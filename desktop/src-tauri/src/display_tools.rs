//! Bounded, opt-in EDR display enhancement. No global brightness or persistent power writes.
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Mutex,
};
use tauri::Manager;
pub const WIDGET_ID: &str = "com.pinwall.display-tools";
#[derive(Clone, Default)]
pub struct DisplayService {
    operations: Arc<Mutex<()>>,
    generation: Arc<AtomicU64>,
}
#[derive(Debug, Deserialize)]
#[serde(tag = "method", rename_all = "camelCase", deny_unknown_fields)]
pub enum Action {
    List {},
    Status {},
    Start {
        display: u32,
        gain: f64,
        seconds: u16,
    },
    Stop {},
}
fn validate(action: &Action) -> Result<(), String> {
    if let Action::Start {
        display,
        gain,
        seconds,
    } = action
    {
        if *display == 0
            || !gain.is_finite()
            || !(1.05..=2.0).contains(gain)
            || !(15..=300).contains(seconds)
        {
            return Err("display_invalid".into());
        }
    }
    Ok(())
}
impl DisplayService {
    pub fn clear(&self) -> Result<(), String> {
        self.generation.fetch_add(1, Ordering::SeqCst);
        #[cfg(target_os = "macos")]
        {
            unsafe extern "C" {
                fn pinwall_display_clear();
            }
            unsafe {
                pinwall_display_clear();
            }
        }
        Ok(())
    }
}
#[cfg(target_os = "macos")]
fn epoch() -> u64 {
    unsafe extern "C" {
        fn pinwall_display_generation() -> u64;
    }
    unsafe { pinwall_display_generation() }
}
#[cfg(not(target_os = "macos"))]
fn epoch() -> u64 {
    0
}
#[tauri::command]
pub async fn widget_display_request(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    action: Action,
) -> Result<Value, String> {
    crate::metrics::require_main(window.label())?;
    crate::widgets::verify_native_tool(&app, WIDGET_ID)?;
    validate(&action)?;
    let state = app.state::<DisplayService>().inner().clone();
    let generation = state.generation.load(Ordering::SeqCst);
    let epoch = epoch();
    if matches!(action, Action::Stop {}) {
        state.clear()?;
    }
    tauri::async_runtime::spawn_blocking(move||{
        let _guard=state.operations.lock().map_err(|_|"display_busy")?;
        if !matches!(action,Action::Stop{})&&state.generation.load(Ordering::SeqCst)!=generation{return Err("tool_cancelled".into());}
        let request=match action{Action::List{}=>json!({"domain":"display","method":"list"}),Action::Status{}=>json!({"domain":"display","method":"status"}),Action::Stop{}=>json!({"domain":"display","method":"status"}),Action::Start{display,gain,seconds}=>json!({"domain":"display","method":"start","display":display,"gain":gain,"seconds":seconds,"epoch":epoch})};
        crate::desktop_tools::native(&request)
    }).await.map_err(|_|"display_unavailable".to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn gains_durations_display_ids_and_unknown_requests_are_bounded() {
        for action in [
            Action::Start {
                display: 1,
                gain: 1.05,
                seconds: 15,
            },
            Action::Start {
                display: 1,
                gain: 2.,
                seconds: 300,
            },
        ] {
            assert!(validate(&action).is_ok());
        }
        for action in [
            Action::Start {
                display: 0,
                gain: 1.5,
                seconds: 60,
            },
            Action::Start {
                display: 1,
                gain: f64::NAN,
                seconds: 60,
            },
            Action::Start {
                display: 1,
                gain: 2.01,
                seconds: 60,
            },
            Action::Start {
                display: 1,
                gain: 1.5,
                seconds: 301,
            },
        ] {
            assert!(validate(&action).is_err());
        }
        assert!(serde_json::from_value::<Action>(
            json!({"method":"start","display":1,"gain":1.2,"seconds":60,"path":"/tmp"})
        )
        .is_err());
    }
    #[test]
    fn revocation_invalidates_queued_start_without_changing_hardware() {
        let service = DisplayService::default();
        let before = service.generation.load(Ordering::SeqCst);
        service.clear().unwrap();
        assert_ne!(service.generation.load(Ordering::SeqCst), before);
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn synthetic_geometry_stays_under_gpu_budget() {
        unsafe extern "C" {
            fn pinwall_display_geometry_test() -> i32;
        }
        assert_eq!(unsafe { pinwall_display_geometry_test() }, 1);
    }
}
