use tauri::{Emitter, Manager};

pub struct MainLayerState(pub std::sync::Mutex<bool>);

pub fn set_main_default_layer<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Ok(mut state) = app.state::<MainLayerState>().0.lock() {
        *state = false;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(false);
        let _ = window.set_always_on_bottom(true);
        let _ = window.set_ignore_cursor_events(true);
        let _ = window.set_visible_on_all_workspaces(true);
        let _ = window.set_shadow(false);
        let _ = window.show();
    }
    let _ = app.emit("main-layer-changed", false);
}

pub fn summon_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Ok(mut state) = app.state::<MainLayerState>().0.lock() {
        *state = true;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_bottom(false);
        let _ = window.set_always_on_top(true);
        let _ = window.set_visible_on_all_workspaces(true);
        let _ = window.set_ignore_cursor_events(false);
        let _ = window.set_shadow(false);
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    let _ = app.emit("main-layer-changed", true);
}

pub fn toggle_main_layer<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let is_summoned = app
        .state::<MainLayerState>()
        .0
        .lock()
        .map(|v| *v)
        .unwrap_or(false);

    if is_summoned {
        set_main_default_layer(app);
    } else {
        summon_main_window(app);
    }
}

#[tauri::command]
pub fn send_to_background(app: tauri::AppHandle) {
    set_main_default_layer(&app);
}

#[tauri::command]
pub fn summon_main(app: tauri::AppHandle) {
    summon_main_window(&app);
}

#[tauri::command]
pub fn is_main_summoned(app: tauri::AppHandle) -> bool {
    app.state::<MainLayerState>()
        .0
        .lock()
        .map(|v| *v)
        .unwrap_or(false)
}

#[tauri::command]
pub fn set_cursor_passthrough(window: tauri::WebviewWindow, ignore: bool) {
    let _ = window.set_ignore_cursor_events(ignore);
}
