//! Request-driven shared snapshots. No resident sampling thread, timer, subprocess or telemetry.
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum Reading<T> {
    Ok(T),
    WarmingUp,
    NotPresent,
    Unavailable,
    Unsupported,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    pub total: u64,
    /// Active + wired + physical compressor pages, NOT an Activity Monitor replica.
    pub in_use: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Battery {
    pub level: f64,
    pub charging: bool,
    pub on_ac: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Metrics {
    pub sampled_at: u64,
    pub cpu: Reading<f64>,
    pub memory: Reading<Memory>,
    pub battery: Reading<Battery>,
}

struct RawMetrics {
    supported: bool,
    cpu: Result<[u32; 4], ()>,
    memory: Result<Memory, ()>,
    battery: Result<Option<Battery>, ()>,
}

trait MetricsBackend {
    fn read(&mut self) -> RawMetrics;
}

fn cpu_usage(previous: [u32; 4], current: [u32; 4]) -> Option<f64> {
    let deltas =
        std::array::from_fn::<_, 4, _>(|index| current[index].wrapping_sub(previous[index]));
    // A reset is not a massive CPU spike. Ordinary u32 wrap remains valid.
    if deltas.iter().any(|delta| *delta > u32::MAX / 2) {
        return None;
    }
    let total: u64 = deltas.iter().map(|value| u64::from(*value)).sum();
    (total > 0).then(|| 100.0 * (total - u64::from(deltas[2])) as f64 / total as f64)
}

#[cfg(any(target_os = "macos", test))]
fn memory_usage(
    total: u64,
    page_size: u64,
    active: u64,
    wired: u64,
    compressed: u64,
) -> Result<Memory, ()> {
    let in_use = active
        .checked_add(wired)
        .and_then(|v| v.checked_add(compressed))
        .and_then(|v| v.checked_mul(page_size))
        .ok_or(())?;
    if total == 0 || page_size == 0 || in_use > total {
        return Err(());
    }
    Ok(Memory { total, in_use })
}

struct Sampler<B> {
    backend: B,
    cached: Option<(Instant, Metrics)>,
    previous_cpu: Option<(Instant, [u32; 4])>,
}

impl<B: MetricsBackend> Sampler<B> {
    fn new(backend: B) -> Self {
        Self {
            backend,
            cached: None,
            previous_cpu: None,
        }
    }
    fn snapshot(&mut self, now: Instant, epoch_ms: u64) -> Metrics {
        if let Some((sampled, snapshot)) = &self.cached {
            if now.saturating_duration_since(*sampled) < Duration::from_secs(3) {
                return snapshot.clone();
            }
        }
        let raw = self.backend.read();
        let cpu = match raw.cpu {
            Ok(ticks) if raw.supported => {
                let usage = self
                    .previous_cpu
                    .filter(|(last, _)| {
                        now.saturating_duration_since(*last) <= Duration::from_secs(30)
                    })
                    .and_then(|(_, previous)| cpu_usage(previous, ticks));
                self.previous_cpu = Some((now, ticks));
                usage.map(Reading::Ok).unwrap_or(Reading::WarmingUp)
            }
            _ if !raw.supported => {
                self.previous_cpu = None;
                Reading::Unsupported
            }
            _ => {
                self.previous_cpu = None;
                Reading::Unavailable
            }
        };
        let memory = if !raw.supported {
            Reading::Unsupported
        } else {
            raw.memory.map(Reading::Ok).unwrap_or(Reading::Unavailable)
        };
        let battery = if !raw.supported {
            Reading::Unsupported
        } else {
            match raw.battery {
                Ok(Some(value)) => Reading::Ok(value),
                Ok(None) => Reading::NotPresent,
                Err(()) => Reading::Unavailable,
            }
        };
        let result = Metrics {
            sampled_at: epoch_ms,
            cpu,
            memory,
            battery,
        };
        self.cached = Some((now, result.clone()));
        result
    }
}

struct NativeBackend;
impl MetricsBackend for NativeBackend {
    fn read(&mut self) -> RawMetrics {
        #[cfg(target_os = "macos")]
        {
            macos::read()
        }
        #[cfg(not(target_os = "macos"))]
        {
            RawMetrics {
                supported: false,
                cpu: Err(()),
                memory: Err(()),
                battery: Err(()),
            }
        }
    }
}

#[derive(Clone)]
pub struct MetricsService(Arc<Mutex<Sampler<NativeBackend>>>);
impl Default for MetricsService {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(Sampler::new(NativeBackend))))
    }
}
impl MetricsService {
    pub fn snapshot(&self) -> Result<Metrics, String> {
        let epoch = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| "metrics_unavailable")?;
        let epoch_ms = u64::try_from(epoch.as_millis()).map_err(|_| "metrics_unavailable")?;
        Ok(self
            .0
            .lock()
            .map_err(|_| "metrics_unavailable")?
            .snapshot(Instant::now(), epoch_ms))
    }
}

pub fn require_main(label: &str) -> Result<(), String> {
    if label == "main" {
        Ok(())
    } else {
        Err("metrics_permission_denied".into())
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use core_foundation_sys::{
        array::{CFArrayGetCount, CFArrayGetValueAtIndex, CFArrayRef},
        base::{CFComparisonResult, CFGetTypeID, CFRelease, CFTypeRef},
        dictionary::{CFDictionaryGetValue, CFDictionaryRef},
        number::{
            kCFNumberSInt64Type, CFBooleanGetTypeID, CFBooleanGetValue, CFNumberGetTypeID,
            CFNumberGetValue,
        },
        string::{
            kCFStringEncodingUTF8, CFStringCompare, CFStringCreateWithCString, CFStringGetTypeID,
        },
    };
    use std::ffi::{c_void, CString};

    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOPSCopyPowerSourcesInfo() -> CFTypeRef;
        fn IOPSCopyPowerSourcesList(info: CFTypeRef) -> CFArrayRef;
        fn IOPSGetPowerSourceDescription(info: CFTypeRef, source: CFTypeRef) -> CFDictionaryRef;
    }
    struct OwnedCf(CFTypeRef);
    impl OwnedCf {
        fn new(value: CFTypeRef) -> Result<Self, ()> {
            if value.is_null() {
                Err(())
            } else {
                Ok(Self(value))
            }
        }
        fn string(value: &str) -> Result<Self, ()> {
            let text = CString::new(value).map_err(|_| ())?;
            // SAFETY: valid NUL-terminated input; Create ownership is held by OwnedCf.
            Self::new(
                unsafe {
                    CFStringCreateWithCString(
                        std::ptr::null(),
                        text.as_ptr(),
                        kCFStringEncodingUTF8,
                    )
                }
                .cast(),
            )
        }
    }
    impl Drop for OwnedCf {
        fn drop(&mut self) {
            /* SAFETY: non-null object held under the CF Create/Copy rule. */
            unsafe {
                CFRelease(self.0);
            }
        }
    }

    extern "C" {
        fn mach_host_self() -> libc::mach_port_t;
        static mach_task_self_: libc::mach_port_t;
        fn mach_port_deallocate(
            task: libc::mach_port_t,
            name: libc::mach_port_t,
        ) -> libc::kern_return_t;
    }
    struct HostPort(libc::mach_port_t);
    impl Drop for HostPort {
        fn drop(&mut self) {
            // SAFETY: mach_host_self returned one send right owned by this wrapper.
            unsafe {
                mach_port_deallocate(mach_task_self_, self.0);
            }
        }
    }

    fn cpu(host: &HostPort) -> Result<[u32; 4], ()> {
        // SAFETY: zero is a valid initialization for the integer-only Mach output struct.
        let mut info = unsafe { std::mem::zeroed::<libc::host_cpu_load_info>() };
        let mut count = libc::HOST_CPU_LOAD_INFO_COUNT;
        // SAFETY: correct flavor, writable output struct and count measured in integer_t units.
        let result = unsafe {
            libc::host_statistics(
                host.0,
                libc::HOST_CPU_LOAD_INFO,
                (&mut info as *mut libc::host_cpu_load_info).cast(),
                &mut count,
            )
        };
        if result != libc::KERN_SUCCESS || count != libc::HOST_CPU_LOAD_INFO_COUNT {
            return Err(());
        }
        Ok(info.cpu_ticks)
    }

    fn memory(host: &HostPort) -> Result<Memory, ()> {
        let mut total = 0u64;
        let mut length = std::mem::size_of::<u64>();
        // SAFETY: fixed sysctl name, output capacity matches u64; this is a read-only query.
        let result = unsafe {
            libc::sysctlbyname(
                c"hw.memsize".as_ptr(),
                (&mut total as *mut u64).cast(),
                &mut length,
                std::ptr::null_mut(),
                0,
            )
        };
        if result != 0 || length != std::mem::size_of::<u64>() {
            return Err(());
        }
        // SAFETY: sysconf is a read-only POSIX query; negative results are rejected.
        let page_size =
            u64::try_from(unsafe { libc::sysconf(libc::_SC_PAGESIZE) }).map_err(|_| ())?;
        // SAFETY: integer-only output is initialized, including fields older kernels may omit.
        let mut info = unsafe { std::mem::zeroed::<libc::vm_statistics64>() };
        let mut count = libc::HOST_VM_INFO64_COUNT;
        // SAFETY: flavor and buffer match; newer libc tails may be absent on older kernels.
        let result = unsafe {
            libc::host_statistics64(
                host.0,
                libc::HOST_VM_INFO64,
                (&mut info as *mut libc::vm_statistics64).cast(),
                &mut count,
            )
        };
        let required = (std::mem::offset_of!(libc::vm_statistics64, compressor_page_count)
            + std::mem::size_of::<u32>())
            / std::mem::size_of::<i32>();
        if result != libc::KERN_SUCCESS || (count as usize) < required {
            return Err(());
        }
        memory_usage(
            total,
            page_size,
            u64::from(info.active_count),
            u64::from(info.wire_count),
            u64::from(info.compressor_page_count),
        )
    }

    fn value(dictionary: CFDictionaryRef, key: &str) -> Result<CFTypeRef, ()> {
        let key = OwnedCf::string(key)?;
        // SAFETY: dictionary is borrowed from the live power info object; key remains alive during lookup.
        let result = unsafe { CFDictionaryGetValue(dictionary, key.0) };
        if result.is_null() {
            Err(())
        } else {
            Ok(result)
        }
    }
    fn number(dictionary: CFDictionaryRef, key: &str) -> Result<i64, ()> {
        let value = value(dictionary, key)?;
        let mut result = 0i64;
        // SAFETY: type ID checked before using the typed accessor and writable i64 output.
        unsafe {
            if CFGetTypeID(value) != CFNumberGetTypeID()
                || !CFNumberGetValue(
                    value.cast(),
                    kCFNumberSInt64Type,
                    (&mut result as *mut i64).cast::<c_void>(),
                )
            {
                return Err(());
            }
        }
        Ok(result)
    }
    fn boolean(dictionary: CFDictionaryRef, key: &str) -> Result<bool, ()> {
        let value = value(dictionary, key)?;
        // SAFETY: only invoke the boolean accessor after checking its runtime type.
        unsafe {
            if CFGetTypeID(value) != CFBooleanGetTypeID() {
                Err(())
            } else {
                Ok(CFBooleanGetValue(value.cast()))
            }
        }
    }
    fn equals(dictionary: CFDictionaryRef, key: &str, expected: &str) -> Result<bool, ()> {
        let value = value(dictionary, key)?;
        let expected = OwnedCf::string(expected)?;
        // SAFETY: checked string type, both borrowed strings remain live for comparison.
        unsafe {
            if CFGetTypeID(value) != CFStringGetTypeID() {
                Err(())
            } else {
                Ok(CFStringCompare(value.cast(), expected.0.cast(), 0)
                    == CFComparisonResult::EqualTo)
            }
        }
    }
    fn battery() -> Result<Option<Battery>, ()> {
        // SAFETY: zero-argument Copy API; owned results released by RAII.
        let info = OwnedCf::new(unsafe { IOPSCopyPowerSourcesInfo() })?;
        // SAFETY: info is a live power-source snapshot.
        let sources = OwnedCf::new(unsafe { IOPSCopyPowerSourcesList(info.0) }.cast())?;
        // SAFETY: CopyPowerSourcesList returns an array; borrowed elements live with sources/info.
        unsafe {
            let array = sources.0.cast();
            for index in 0..CFArrayGetCount(array) {
                let source = CFArrayGetValueAtIndex(array, index);
                let dictionary = IOPSGetPowerSourceDescription(info.0, source);
                if dictionary.is_null() {
                    return Err(());
                }
                if !equals(dictionary, "Type", "InternalBattery")? {
                    continue;
                }
                if !boolean(dictionary, "Is Present")? {
                    continue;
                }
                let current = number(dictionary, "Current Capacity")?;
                let maximum = number(dictionary, "Max Capacity")?;
                if maximum <= 0 || current < 0 || current > maximum {
                    return Err(());
                }
                return Ok(Some(Battery {
                    level: current as f64 / maximum as f64,
                    charging: boolean(dictionary, "Is Charging")?,
                    on_ac: equals(dictionary, "Power Source State", "AC Power")?,
                }));
            }
        }
        Ok(None)
    }

    pub(super) fn read() -> RawMetrics {
        // SAFETY: read-only host query returns a send right released by HostPort.
        let host = HostPort(unsafe { mach_host_self() });
        RawMetrics {
            supported: true,
            cpu: cpu(&host),
            memory: memory(&host),
            battery: battery(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpu_uses_tick_deltas_not_lifetime_average_and_handles_wrap() {
        assert_eq!(cpu_usage([10, 20, 60, 10], [20, 30, 120, 30]), Some(40.0));
        assert_eq!(cpu_usage([1; 4], [1; 4]), None);
        assert_eq!(cpu_usage([100; 4], [1; 4]), None);
        assert_eq!(
            cpu_usage([u32::MAX - 4, 0, 10, 0], [5, 0, 20, 0]),
            Some(50.0)
        );
    }

    #[test]
    fn memory_uses_actual_page_size_and_rejects_invalid_counters() {
        assert_eq!(
            memory_usage(1_000_000, 4096, 10, 2, 3).unwrap().in_use,
            61_440
        );
        assert_eq!(
            memory_usage(1_000_000, 16384, 10, 2, 3).unwrap().in_use,
            245_760
        );
        assert!(memory_usage(0, 4096, 10, 2, 3).is_err());
        assert!(memory_usage(1_000, 0, 10, 2, 3).is_err());
        assert!(memory_usage(1, 4096, 10, 2, 3).is_err());
        assert!(memory_usage(u64::MAX, 16384, u64::MAX, 2, 3).is_err());
    }

    #[derive(Default)]
    struct FakeBackend {
        calls: usize,
        failed: bool,
    }
    impl MetricsBackend for FakeBackend {
        fn read(&mut self) -> RawMetrics {
            self.calls += 1;
            RawMetrics {
                supported: true,
                cpu: Ok([self.calls as u32 * 10, 0, self.calls as u32 * 30, 0]),
                memory: if self.failed {
                    Err(())
                } else {
                    memory_usage(1_000_000, 4096, 10, 2, 3)
                },
                battery: Ok(None),
            }
        }
    }

    #[test]
    fn one_sampler_shares_a_snapshot_and_does_no_work_without_requests() {
        let mut sampler = Sampler::new(FakeBackend::default());
        assert_eq!(sampler.backend.calls, 0);
        let now = Instant::now();
        let first = sampler.snapshot(now, 1000);
        assert!(matches!(first.cpu, Reading::WarmingUp));
        assert!(matches!(first.battery, Reading::NotPresent));
        let cached = sampler.snapshot(now + Duration::from_secs(2), 3000);
        assert_eq!(first, cached);
        assert_eq!(sampler.backend.calls, 1);
        let next = sampler.snapshot(now + Duration::from_secs(3), 4000);
        assert_eq!(next.cpu, Reading::Ok(25.0));
        assert_eq!(sampler.backend.calls, 2);
        // Hiding/unmounting requires no native stop: no worker or timer exists.
        let resumed = sampler.snapshot(now + Duration::from_secs(60), 61000);
        assert!(matches!(resumed.cpu, Reading::WarmingUp));
        assert_eq!(sampler.backend.calls, 3);
    }

    #[test]
    fn a_failed_metric_does_not_hide_other_metrics() {
        let mut sampler = Sampler::new(FakeBackend {
            failed: true,
            ..Default::default()
        });
        let result = sampler.snapshot(Instant::now(), 1000);
        assert!(matches!(result.memory, Reading::Unavailable));
        assert!(matches!(result.battery, Reading::NotPresent));
        assert!(matches!(result.cpu, Reading::WarmingUp));
        for label in ["settings", "notification", "other"] {
            assert!(require_main(label).is_err());
        }
        assert!(require_main("main").is_ok());
    }

    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "Reads real macOS metrics; run explicitly during native QA"]
    fn native_metrics_smoke() {
        let mut backend = NativeBackend;
        let first = backend.read();
        let memory = first.memory.unwrap();
        assert!(memory.total > 0 && memory.in_use <= memory.total);
        if let Some(battery) = first.battery.unwrap() {
            assert!((0.0..=1.0).contains(&battery.level));
        }
        std::thread::sleep(Duration::from_millis(150));
        let second = backend.read();
        let cpu = cpu_usage(first.cpu.unwrap(), second.cpu.unwrap()).unwrap();
        assert!((0.0..=100.0).contains(&cpu));
        println!(
            "native metrics: cpu={cpu:.1}%, memory={}/{} bytes",
            memory.in_use, memory.total
        );
    }
}
