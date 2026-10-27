//! Explicitly started, bounded, session-only clipboard history. No disk writes.
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Manager;

pub const WIDGET_ID: &str = "com.pinwall.clipboard-history";
const MAX_ENTRIES: usize = 100;
const MAX_BYTES: usize = 1024 * 1024;
const RETENTION_MS: u64 = 24 * 60 * 60 * 1000;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    id: String,
    text: String,
    created_at: u64,
}
#[derive(Default)]
struct History {
    entries: Vec<Entry>,
    active: bool,
    worker: bool,
    generation: u64,
    sequence: u64,
    skipped: u64,
    failed: bool,
}
impl History {
    // A result from a slow pasteboard provider cannot revive a stopped session.
    fn accept_capture(
        &mut self,
        generation: u64,
        result: Result<String, String>,
        now: u64,
    ) -> bool {
        if !self.active || self.generation != generation {
            return false;
        }
        match result {
            Ok(text) => {
                self.failed = false;
                self.insert(text, now);
            }
            Err(code)
                if matches!(
                    code.as_str(),
                    "clipboard_sensitive"
                        | "clipboard_empty"
                        | "clipboard_too_large"
                        | "clipboard_changed"
                ) =>
            {
                self.skipped += 1;
            }
            Err(_) => {
                self.failed = true;
            }
        }
        true
    }
    fn prune(&mut self, now: u64) {
        self.entries
            .retain(|e| now.saturating_sub(e.created_at) < RETENTION_MS);
        let mut total = 0usize;
        self.entries.retain(|e| {
            total += e.text.len();
            total <= MAX_BYTES
        });
        self.entries.truncate(MAX_ENTRIES);
    }
    fn insert(&mut self, text: String, now: u64) {
        self.prune(now);
        if text.trim().is_empty() || text.len() > 64 * 1024 {
            self.skipped += 1;
            return;
        }
        if self.entries.first().is_some_and(|entry| entry.text == text) {
            return;
        }
        // Re-copying existing text moves that item to the front, without accumulating duplicates.
        self.entries.retain(|entry| entry.text != text);
        self.sequence += 1;
        self.entries.insert(
            0,
            Entry {
                id: self.sequence.to_string(),
                text,
                created_at: now,
            },
        );
        self.prune(now);
    }
}
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|v| v.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Clone, Default)]
pub struct HistoryService(Arc<Mutex<History>>);
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySnapshot {
    pub recording: bool,
    pub stopping: bool,
    pub entries: Vec<Entry>,
    skipped: u64,
    failed: bool,
}
impl HistoryService {
    pub fn stop(&self, clear: bool) -> Result<(), String> {
        let mut state = self.0.lock().map_err(|_| "history_unavailable")?;
        state.active = false;
        state.generation += 1;
        if clear {
            state.entries.clear();
            state.skipped = 0;
            state.failed = false;
        }
        Ok(())
    }
    fn snapshot(&self) -> Result<HistorySnapshot, String> {
        let mut state = self.0.lock().map_err(|_| "history_unavailable")?;
        state.prune(now_ms());
        Ok(HistorySnapshot {
            recording: state.active,
            stopping: state.worker && !state.active,
            entries: state.entries.clone(),
            skipped: state.skipped,
            failed: state.failed,
        })
    }
    #[cfg(target_os = "macos")]
    fn start(&self, app: tauri::AppHandle) -> Result<(), String> {
        let generation = {
            let mut state = self.0.lock().map_err(|_| "history_unavailable")?;
            if state.active {
                return Ok(());
            }
            if state.worker {
                return Err("history_busy".into());
            }
            state.active = true;
            state.worker = true;
            state.failed = false;
            state.generation += 1;
            state.generation
        };
        let service = self.clone();
        let spawned = std::thread::Builder::new()
            .name("pinwall-clipboard-history".into())
            .spawn(move || {
                // Establish a baseline without reading existing clipboard text at Start.
                let mut count = crate::clipboard::change_count();
                loop {
                    std::thread::sleep(Duration::from_millis(750));
                    if !service
                        .0
                        .lock()
                        .is_ok_and(|s| s.active && s.generation == generation)
                    {
                        break;
                    }
                    let clipboard = app.state::<crate::clipboard::ClipboardService>();
                    let Ok(_guard) = clipboard.acquire() else {
                        continue;
                    };
                    if let Some((next, result)) = crate::clipboard::changed_text(count) {
                        count = next;
                        let Ok(mut state) = service.0.lock() else {
                            break;
                        };
                        // Stop/clear wins over an already pending pasteboard provider.
                        if !state.accept_capture(generation, result, now_ms()) {
                            break;
                        }
                    }
                }
                if let Ok(mut state) = service.0.lock() {
                    state.worker = false;
                }
            });
        if spawned.is_err() {
            let mut state = self.0.lock().map_err(|_| "history_unavailable")?;
            state.active = false;
            state.worker = false;
            return Err("history_unavailable".into());
        }
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(tag = "method", rename_all = "camelCase", deny_unknown_fields)]
pub enum HistoryAction {
    Status {},
    Start {},
    Pause {},
    Clear {},
    Delete { id: String },
    Copy { id: String },
}

#[tauri::command]
pub async fn widget_history_request(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    action: HistoryAction,
) -> Result<HistorySnapshot, String> {
    if window.label() != "main" {
        return Err("tool_permission_denied".into());
    }
    crate::widgets::verify_native_tool(&app, WIDGET_ID)?;
    tauri::async_runtime::spawn_blocking(move || {
        let service = app.state::<HistoryService>();
        match action {
            HistoryAction::Status {} => {}
            HistoryAction::Start {} => {
                #[cfg(target_os = "macos")]
                service.start(app.clone())?;
                #[cfg(not(target_os = "macos"))]
                return Err("history_unsupported".into());
            }
            HistoryAction::Pause {} => service.stop(false)?,
            HistoryAction::Clear {} => {
                let mut state = service.0.lock().map_err(|_| "history_unavailable")?;
                state.entries.clear();
                state.skipped = 0;
                state.failed = false;
                // Invalidate reads that began before Clear. An active worker stops, requiring explicit Start.
                state.active = false;
                state.generation += 1;
            }
            HistoryAction::Delete { id } => {
                if id.len() > 32 || !id.bytes().all(|c| c.is_ascii_digit()) {
                    return Err("history_invalid_request".into());
                }
                service
                    .0
                    .lock()
                    .map_err(|_| "history_unavailable")?
                    .entries
                    .retain(|entry| entry.id != id);
            }
            HistoryAction::Copy { id } => {
                let text = service
                    .0
                    .lock()
                    .map_err(|_| "history_unavailable")?
                    .entries
                    .iter()
                    .find(|e| e.id == id)
                    .map(|e| e.text.clone())
                    .ok_or("history_invalid_request")?;
                let clipboard = app.state::<crate::clipboard::ClipboardService>();
                let _guard = clipboard.acquire().map_err(|_| "history_busy")?;
                #[cfg(target_os = "macos")]
                crate::clipboard::write_confirmed_text(&text)?;
                #[cfg(not(target_os = "macos"))]
                {
                    let _ = text;
                    return Err("history_unsupported".into());
                }
            }
        }
        service.snapshot()
    })
    .await
    .map_err(|_| "history_unavailable".to_string())?
}

#[tauri::command]
pub fn get_widget_history_status(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    if window.label() != "main" {
        return Err("tool_permission_denied".into());
    }
    crate::widgets::verify_native_tool(&app, WIDGET_ID)?;
    let service = app.state::<HistoryService>();
    let mut state = service.0.lock().map_err(|_| "history_unavailable")?;
    state.prune(now_ms());
    Ok(
        serde_json::json!({ "recording": state.active, "count": state.entries.len(), "revision": format!("{}-{}-{}-{}-{}-{}", state.generation, state.sequence, state.entries.len(), state.skipped, state.worker, state.failed) }),
    )
}

#[tauri::command]
pub fn revoke_widget_tool(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    widget_id: String,
) -> Result<(), String> {
    if !matches!(window.label(), "main" | "settings") {
        return Err("tool_permission_denied".into());
    }
    match widget_id.as_str() {
        crate::desktop_tools::AUDIO_ID | crate::desktop_tools::WINDOWS_ID => app.state::<crate::desktop_tools::DesktopService>().clear_widget(&widget_id),
        crate::hardware_tools::WIDGET_ID => app.state::<crate::hardware_tools::HardwareService>().clear(),
        crate::display_tools::WIDGET_ID => app.state::<crate::display_tools::DisplayService>().clear(),
        crate::maintenance::WIDGET_ID => app.state::<crate::maintenance::MaintenanceService>().clear(),
        crate::video_tools::WIDGET_ID => app.state::<crate::video_tools::VideoService>().clear(),
        crate::input_tools::WIDGET_ID => app.state::<crate::input_tools::InputService>().clear(),
        crate::utilities::WIDGET_ID => Ok(()),
        WIDGET_ID => app.state::<HistoryService>().stop(true),
        crate::shelf::WIDGET_ID => app.state::<crate::shelf::ShelfService>().deactivate(),
        crate::screen_tools::WIDGET_ID => app.state::<crate::screen_tools::ScreenService>().clear(),
        crate::image_tools::IMAGE_ID => app.state::<crate::image_tools::ImageService>().clear(),
        crate::image_tools::OCR_ID => Ok(()),
        _ => Err("tool_permission_denied".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn history_is_bounded_deduplicated_and_expires() {
        let mut state = History::default();
        state.insert("one".into(), 1000);
        state.insert("one".into(), 1001);
        assert_eq!(state.entries.len(), 1);
        state.insert("two".into(), 1002);
        state.insert("one".into(), 1003);
        assert_eq!(state.entries[0].text, "one");
        assert_eq!(state.entries.len(), 2);
        for i in 0..200 {
            state.insert(format!("{i}:{}", "x".repeat(16000)), 2000);
        }
        assert!(state.entries.len() <= MAX_ENTRIES);
        assert!(
            state
                .entries
                .iter()
                .map(|entry| entry.text.len())
                .sum::<usize>()
                <= MAX_BYTES
        );
        state.prune(RETENTION_MS + 3000);
        assert!(state.entries.is_empty());
        state.insert(" ".into(), 3000);
        state.insert("x".repeat(65537), 3000);
        assert!(state.entries.is_empty());
        assert_eq!(state.skipped, 2);
    }
    #[test]
    fn disabling_stops_capture_and_clears_private_session_data() {
        let service = HistoryService::default();
        {
            let mut state = service.0.lock().unwrap();
            state.active = true;
            state.insert("private fixture".into(), now_ms());
        }
        service.stop(true).unwrap();
        let snapshot = service.snapshot().unwrap();
        assert!(!snapshot.recording);
        assert!(snapshot.entries.is_empty());
        assert_eq!(service.0.lock().unwrap().generation, 1);
    }
    #[test]
    fn late_provider_results_cannot_restore_paused_or_cleared_data() {
        let service = HistoryService::default();
        {
            let mut state = service.0.lock().unwrap();
            state.active = true;
            state.generation = 1;
        }
        service.stop(false).unwrap();
        assert!(!service.0.lock().unwrap().accept_capture(
            1,
            Ok("late paused text".into()),
            now_ms()
        ));
        {
            let mut state = service.0.lock().unwrap();
            state.active = true;
            state.generation = 3;
            assert!(state.accept_capture(3, Ok("current text".into()), now_ms()));
        }
        service.stop(true).unwrap();
        {
            let mut state = service.0.lock().unwrap();
            // Even a new recording session must reject results from the old worker.
            state.active = true;
            state.generation += 1;
            assert!(!state.accept_capture(3, Ok("late cleared text".into()), now_ms()));
            assert!(!state.accept_capture(3, Err("provider failed".into()), now_ms()));
            assert!(state.entries.is_empty());
            assert!(!state.failed);
        }
    }
    #[test]
    fn unknown_history_actions_and_extra_arguments_are_rejected() {
        for value in [
            serde_json::json!({"method":"write"}),
            serde_json::json!({"method":"start","text":"bad"}),
        ] {
            assert!(serde_json::from_value::<HistoryAction>(value).is_err());
        }
    }
}
