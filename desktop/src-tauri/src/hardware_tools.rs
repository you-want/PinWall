//! Opt-in, signed helper access; never accepts commands, paths or SMC key names.
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Mutex,
};
use tauri::Manager;
pub const WIDGET_ID: &str = "com.pinwall.hardware-tools";
#[derive(Clone, Default)]
pub struct HardwareService {
    operations: Arc<Mutex<()>>,
    generation: Arc<AtomicU64>,
}
#[derive(Debug, Deserialize)]
#[serde(tag = "method", rename_all = "camelCase", deny_unknown_fields)]
pub enum Action {
    Service {},
    Register {
        confirmed: bool,
    },
    Unregister {},
    Status {},
    Fan {
        fan: u8,
        rpm: u16,
        seconds: u16,
        confirmed: bool,
    },
    Lid {
        seconds: u16,
        confirmed: bool,
    },
    Stop {},
}
fn validate(action: &Action) -> Result<(), String> {
    match action {
        Action::Register { confirmed: false }
        | Action::Fan {
            confirmed: false, ..
        }
        | Action::Lid {
            confirmed: false, ..
        } => Err("hardware_confirmation".into()),
        Action::Fan {
            fan, rpm, seconds, ..
        } if *fan > 3 || *rpm < 1000 || *rpm > 12000 || !(15..=300).contains(seconds) => {
            Err("hardware_invalid".into())
        }
        Action::Lid { seconds, .. } if !(15..=300).contains(seconds) => {
            Err("hardware_invalid".into())
        }
        _ => Ok(()),
    }
}
impl HardwareService {
    pub fn clear(&self) -> Result<(), String> {
        self.generation.fetch_add(1, Ordering::SeqCst);
        #[cfg(target_os = "macos")]
        {
            unsafe extern "C" {
                fn pinwall_hardware_clear();
            }
            unsafe {
                pinwall_hardware_clear();
            }
        }
        Ok(())
    }
}
#[cfg(target_os = "macos")]
fn epoch() -> u64 {
    unsafe extern "C" {
        fn pinwall_hardware_generation() -> u64;
    }
    unsafe { pinwall_hardware_generation() }
}
#[cfg(not(target_os = "macos"))]
fn epoch() -> u64 {
    0
}
#[tauri::command]
pub async fn widget_hardware_request(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    action: Action,
) -> Result<Value, String> {
    crate::metrics::require_main(window.label())?;
    crate::widgets::verify_native_tool(&app, WIDGET_ID)?;
    validate(&action)?;
    let state = app.state::<HardwareService>().inner().clone();
    let generation = state.generation.load(Ordering::SeqCst);
    let epoch = epoch();
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = state.operations.lock().map_err(|_| "hardware_busy")?;
        if generation != state.generation.load(Ordering::SeqCst) {
            return Err("tool_cancelled".into());
        }
        let mut request = match action {
            Action::Service {} => json!({"method":"service"}),
            Action::Register { .. } => json!({"method":"register"}),
            Action::Unregister {} => json!({"method":"unregister"}),
            Action::Status {} => json!({"method":"status"}),
            Action::Stop {} => json!({"method":"stop"}),
            Action::Fan {
                fan, rpm, seconds, ..
            } => json!({"method":"fan","fan":fan,"rpm":rpm,"seconds":seconds}),
            Action::Lid { seconds, .. } => json!({"method":"lid","seconds":seconds}),
        };
        request["domain"] = json!("hardware");
        request["epoch"] = json!(epoch);
        crate::desktop_tools::native(&request)
    })
    .await
    .map_err(|_| "hardware_unavailable".to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_actions_require_explicit_confirmation_and_bounded_targets() {
        for action in [
            Action::Fan {
                fan: 4,
                rpm: 4000,
                seconds: 60,
                confirmed: true,
            },
            Action::Fan {
                fan: 0,
                rpm: 0,
                seconds: 60,
                confirmed: true,
            },
            Action::Lid {
                seconds: 301,
                confirmed: true,
            },
            Action::Register { confirmed: false },
            Action::Fan {
                fan: 0,
                rpm: 4000,
                seconds: 60,
                confirmed: false,
            },
        ] {
            assert!(validate(&action).is_err());
        }
        assert!(validate(&Action::Fan {
            fan: 0,
            rpm: 4000,
            seconds: 60,
            confirmed: true
        })
        .is_ok());
        assert!(serde_json::from_value::<Action>(
            json!({"method":"fan","fan":0,"rpm":4000,"seconds":60,"confirmed":true,"key":"FS! "})
        )
        .is_err());
    }
    #[test]
    fn clear_invalidates_queued_actions_without_contacting_a_helper() {
        let service = HardwareService::default();
        let generation = service.generation.load(Ordering::SeqCst);
        service.clear().unwrap();
        assert_ne!(generation, service.generation.load(Ordering::SeqCst));
    }
}
