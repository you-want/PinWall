//! Narrow, host-owned power sessions for the bundled keep-awake plugin.
//! IOKit owns assertion expiry, so no polling thread or renderer timer is required.
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub const WIDGET_ID: &str = "com.pinwall.keep-awake";

#[derive(Debug, Deserialize)]
#[serde(tag = "method", rename_all = "camelCase", deny_unknown_fields)]
pub enum PowerAction {
    Status,
    Start { minutes: u16 },
    Stop,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PowerStatus {
    supported: bool,
    active: bool,
    ends_at: Option<u64>,
}

trait PowerBackend {
    fn acquire(&mut self, seconds: u32) -> Result<u32, String>;
    fn release(&mut self, id: u32) -> Result<(), String>;
}

struct ActiveAssertion {
    id: u32,
    deadline: Instant,
    ends_at: u64,
}

struct Controller<B: PowerBackend> {
    backend: B,
    token: Option<String>,
    active: Option<ActiveAssertion>,
}

impl<B: PowerBackend> Controller<B> {
    fn new(backend: B) -> Self {
        Self {
            backend,
            token: None,
            active: None,
        }
    }

    fn stop(&mut self) -> Result<(), String> {
        if let Some(active) = &self.active {
            // Keep state on release failure, allowing a later stop/open to retry.
            if active.deadline > Instant::now() {
                self.backend.release(active.id)?;
            }
        }
        self.active = None;
        Ok(())
    }

    fn open(&mut self, token: String) -> Result<(), String> {
        self.stop()?;
        self.token = Some(token);
        Ok(())
    }

    fn close(&mut self, token: &str) -> Result<(), String> {
        // A delayed cleanup from an older iframe must not close the replacement.
        if self.token.as_deref() == Some(token) {
            self.close_all()?;
        }
        Ok(())
    }

    fn close_all(&mut self) -> Result<(), String> {
        self.stop()?;
        self.token = None;
        Ok(())
    }

    fn request(
        &mut self,
        token: &str,
        action: PowerAction,
        now: Instant,
        epoch_ms: u64,
    ) -> Result<PowerStatus, String> {
        if self.token.as_deref() != Some(token) {
            return Err("power_session_closed".into());
        }
        if self
            .active
            .as_ref()
            .is_some_and(|active| now >= active.deadline)
        {
            // IOKit already releases expired assertions. No second release of a recycled ID.
            self.active = None;
        }
        match action {
            PowerAction::Start { minutes } => {
                if !(1..=480).contains(&minutes) {
                    return Err("power_invalid_duration".into());
                }
                if self.active.is_none() {
                    let seconds = u32::from(minutes) * 60;
                    let id = self.backend.acquire(seconds)?;
                    self.active = Some(ActiveAssertion {
                        id,
                        deadline: now + Duration::from_secs(u64::from(seconds)),
                        ends_at: epoch_ms + u64::from(seconds) * 1000,
                    });
                }
            }
            PowerAction::Stop => self.stop()?,
            PowerAction::Status => {}
        }
        Ok(PowerStatus {
            supported: true,
            active: self.active.is_some(),
            ends_at: self.active.as_ref().map(|active| active.ends_at),
        })
    }
}

impl<B: PowerBackend> Drop for Controller<B> {
    fn drop(&mut self) {
        if self.stop().is_err() {
            eprintln!("[Power] Assertion cleanup failed; system timeout remains active");
        }
    }
}

struct NativeBackend;

#[cfg(target_os = "macos")]
mod macos {
    use std::ffi::{c_void, CString};
    type CFString = *const c_void;
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFStringCreateWithCString(
            allocator: *const c_void,
            string: *const i8,
            encoding: u32,
        ) -> CFString;
        fn CFRelease(value: *const c_void);
    }
    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOPMAssertionCreateWithDescription(
            kind: CFString,
            name: CFString,
            details: CFString,
            reason: CFString,
            bundle: CFString,
            timeout: f64,
            action: CFString,
            id: *mut u32,
        ) -> i32;
        fn IOPMAssertionRelease(id: u32) -> i32;
    }
    struct OwnedString(CFString);
    impl OwnedString {
        fn new(value: &str) -> Result<Self, String> {
            let string = CString::new(value).map_err(|_| "power_unavailable")?;
            // SAFETY: the C string is valid for the call; a successful create transfers ownership.
            let result =
                unsafe { CFStringCreateWithCString(std::ptr::null(), string.as_ptr(), 0x08000100) };
            if result.is_null() {
                Err("power_unavailable".into())
            } else {
                Ok(Self(result))
            }
        }
    }
    impl Drop for OwnedString {
        fn drop(&mut self) {
            // SAFETY: this is a non-null CFString obtained with the Create rule.
            unsafe {
                CFRelease(self.0);
            }
        }
    }
    pub fn acquire(seconds: u32) -> Result<u32, String> {
        let kind = OwnedString::new("PreventUserIdleSystemSleep")?;
        let name = OwnedString::new("PinWall Keep Awake")?;
        let action = OwnedString::new("TimeoutActionRelease")?;
        let mut id = 0;
        // SAFETY: all strings are alive, optional strings are null, and id points to writable storage.
        let result = unsafe {
            IOPMAssertionCreateWithDescription(
                kind.0,
                name.0,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                f64::from(seconds),
                action.0,
                &mut id,
            )
        };
        if result == 0 {
            Ok(id)
        } else {
            Err("power_acquire_failed".into())
        }
    }
    pub fn release(id: u32) -> Result<(), String> {
        // SAFETY: the controller owns this assertion until release or its system timeout.
        if unsafe { IOPMAssertionRelease(id) } == 0 {
            Ok(())
        } else {
            Err("power_release_failed".into())
        }
    }
}

impl PowerBackend for NativeBackend {
    fn acquire(&mut self, seconds: u32) -> Result<u32, String> {
        #[cfg(target_os = "macos")]
        {
            macos::acquire(seconds)
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = seconds;
            Err("power_unsupported".into())
        }
    }
    fn release(&mut self, id: u32) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            macos::release(id)
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = id;
            Err("power_unsupported".into())
        }
    }
}

pub struct PowerService(Mutex<Controller<NativeBackend>>);
impl Default for PowerService {
    fn default() -> Self {
        Self(Mutex::new(Controller::new(NativeBackend)))
    }
}
impl PowerService {
    pub fn close_all(&self) -> Result<(), String> {
        self.0.lock().map_err(|_| "power_unavailable")?.close_all()
    }
}

fn require_main(label: &str) -> Result<(), String> {
    if label == "main" {
        Ok(())
    } else {
        Err("power_permission_denied".into())
    }
}

/// Settings may revoke a session, but only the main host can open one or start work.
#[tauri::command]
pub fn revoke_widget_power(
    window: tauri::WebviewWindow,
    widget_id: String,
    state: tauri::State<'_, PowerService>,
) -> Result<(), String> {
    if !["main", "settings"].contains(&window.label()) || widget_id != WIDGET_ID {
        return Err("power_permission_denied".into());
    }
    state.close_all()
}

#[tauri::command]
pub fn open_widget_power_session(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    widget_id: String,
    state: tauri::State<'_, PowerService>,
) -> Result<String, String> {
    require_main(window.label())?;
    if widget_id != WIDGET_ID {
        return Err("power_permission_denied".into());
    }
    crate::widgets::verify_power_widget(&app)?;
    #[cfg(target_os = "macos")]
    {
        let mut random = [0u8; 32];
        security_framework::random::SecRandom::default()
            .copy_bytes(&mut random)
            .map_err(|_| "power_unavailable")?;
        let token = random
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        state
            .0
            .lock()
            .map_err(|_| "power_unavailable")?
            .open(token.clone())?;
        Ok(token)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = state;
        Err("power_unsupported".into())
    }
}

#[tauri::command]
pub fn widget_power_request(
    window: tauri::WebviewWindow,
    token: String,
    action: PowerAction,
    state: tauri::State<'_, PowerService>,
) -> Result<PowerStatus, String> {
    require_main(window.label())?;
    let epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "power_unavailable")?;
    let epoch_ms = u64::try_from(epoch.as_millis()).map_err(|_| "power_unavailable")?;
    state.0.lock().map_err(|_| "power_unavailable")?.request(
        &token,
        action,
        Instant::now(),
        epoch_ms,
    )
}

#[tauri::command]
pub fn close_widget_power_session(
    window: tauri::WebviewWindow,
    token: String,
    state: tauri::State<'_, PowerService>,
) -> Result<(), String> {
    require_main(window.label())?;
    state
        .0
        .lock()
        .map_err(|_| "power_unavailable")?
        .close(&token)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[derive(Default)]
    struct FakeBackend {
        acquired: Vec<u32>,
        released: Vec<u32>,
        fail_acquire: bool,
        fail_release: bool,
    }
    impl PowerBackend for FakeBackend {
        fn acquire(&mut self, seconds: u32) -> Result<u32, String> {
            if self.fail_acquire {
                return Err("acquire_failed".into());
            }
            self.acquired.push(seconds);
            Ok(self.acquired.len() as u32)
        }
        fn release(&mut self, id: u32) -> Result<(), String> {
            if self.fail_release {
                return Err("release_failed".into());
            }
            self.released.push(id);
            Ok(())
        }
    }
    fn controller() -> Controller<FakeBackend> {
        let mut service = Controller::new(FakeBackend::default());
        service.open("token".into()).unwrap();
        service
    }
    #[test]
    fn duration_and_token_are_validated_without_side_effects() {
        let mut service = controller();
        let now = Instant::now();
        for minutes in [0, 481, u16::MAX] {
            assert!(service
                .request("token", PowerAction::Start { minutes }, now, 0)
                .is_err());
        }
        assert!(service
            .request("forged", PowerAction::Start { minutes: 25 }, now, 0)
            .is_err());
        assert!(service.backend.acquired.is_empty());
        for label in ["settings", "notification", "other"] {
            assert!(require_main(label).is_err());
        }
        assert!(require_main("main").is_ok());
    }
    #[test]
    fn starts_once_and_does_not_extend_on_retry() {
        let mut service = controller();
        let now = Instant::now();
        let first = service
            .request("token", PowerAction::Start { minutes: 25 }, now, 1000)
            .unwrap();
        let retry = service
            .request(
                "token",
                PowerAction::Start { minutes: 60 },
                now + Duration::from_secs(1),
                2000,
            )
            .unwrap();
        assert_eq!(first, retry);
        assert_eq!(first.ends_at, Some(1_501_000));
        assert_eq!(service.backend.acquired, vec![1500]);
    }
    #[test]
    fn expiry_does_not_depend_on_the_renderer_and_stale_cleanup_cannot_stop_a_new_session() {
        let mut service = controller();
        let now = Instant::now();
        service
            .request("token", PowerAction::Start { minutes: 1 }, now, 0)
            .unwrap();
        assert!(
            !service
                .request(
                    "token",
                    PowerAction::Status,
                    now + Duration::from_secs(60),
                    60000
                )
                .unwrap()
                .active
        );
        assert!(service.backend.released.is_empty()); // OS already released the timed assertion.
        service.open("replacement".into()).unwrap();
        service
            .request("replacement", PowerAction::Start { minutes: 1 }, now, 0)
            .unwrap();
        service.close("token").unwrap();
        assert!(service.active.is_some());
        service.close("replacement").unwrap();
        assert_eq!(service.backend.released, vec![2]);
        assert!(service
            .request("replacement", PowerAction::Status, now, 0)
            .is_err());
    }
    #[test]
    fn stop_revoke_and_failed_acquire_keep_state_consistent() {
        let mut service = controller();
        let now = Instant::now();
        service.backend.fail_acquire = true;
        assert!(service
            .request("token", PowerAction::Start { minutes: 1 }, now, 0)
            .is_err());
        assert!(service.active.is_none());
        service.backend.fail_acquire = false;
        service
            .request("token", PowerAction::Start { minutes: 1 }, now, 0)
            .unwrap();
        service.backend.fail_release = true;
        assert!(service.request("token", PowerAction::Stop, now, 0).is_err());
        assert!(service.active.is_some());
        service.backend.fail_release = false;
        service.close_all().unwrap();
        service.close_all().unwrap();
        assert_eq!(service.backend.released, vec![1]);
        assert!(service.token.is_none());
    }
    #[test]
    fn unknown_native_fields_and_methods_are_rejected() {
        for json in [
            r#"{"method":"shell"}"#,
            r#"{"method":"start","minutes":25,"command":"bad"}"#,
            r#"{"method":"start","minutes":1.5}"#,
        ] {
            assert!(serde_json::from_str::<PowerAction>(json).is_err());
        }
    }
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "Creates a temporary real macOS power assertion; run explicitly during native QA"]
    fn native_assertion_smoke() {
        let id = macos::acquire(2).unwrap();
        let status = std::process::Command::new("pmset")
            .args(["-g", "assertions"])
            .output()
            .unwrap();
        assert!(String::from_utf8_lossy(&status.stdout).contains("PinWall Keep Awake"));
        macos::release(id).unwrap();
        let id = macos::acquire(1).unwrap();
        std::thread::sleep(Duration::from_secs(2));
        assert!(
            macos::release(id).is_err(),
            "IOKit should already have released the timed assertion"
        );
    }
}
