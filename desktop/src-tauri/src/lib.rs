use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

struct MainLayerState(std::sync::Mutex<bool>);

fn open_shortcut_display() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Cmd+Shift+空格"
    }

    #[cfg(not(target_os = "macos"))]
    {
        "Ctrl+Shift+Space"
    }
}

fn set_main_default_layer<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Ok(mut state) = app.state::<MainLayerState>().0.lock() {
        *state = false;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(false);
        let _ = window.set_always_on_bottom(true);
        let _ = window.set_visible_on_all_workspaces(true);
        let _ = window.show();
    }
}

fn summon_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Ok(mut state) = app.state::<MainLayerState>().0.lock() {
        *state = true;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_bottom(false);
        let _ = window.set_always_on_top(true);
        let _ = window.set_visible_on_all_workspaces(true);
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn toggle_main_layer<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
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

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn send_to_background(app: tauri::AppHandle) {
    set_main_default_layer(&app);
    let state = app.state::<MainLayerState>()
        .0
        .lock()
        .map(|v| *v)
        .unwrap_or(false);
}

#[derive(serde::Serialize)]
struct ImportedBackgroundImage {
    path: String,
    file_name: String,
}

#[tauri::command]
fn import_background_images(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<Vec<ImportedBackgroundImage>, String> {
    use std::path::PathBuf;

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let backgrounds_dir = app_data_dir.join("backgrounds");
    std::fs::create_dir_all(&backgrounds_dir).map_err(|e| e.to_string())?;

    let mut imported = Vec::with_capacity(paths.len());

    for source in paths {
        let source_path = PathBuf::from(&source);
        let original_name = source_path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("image_{}", chrono_like_timestamp()));

        let mut file_name = format!("{}_{}", chrono_like_timestamp(), original_name);
        let mut dest_path = backgrounds_dir.join(&file_name);
        let mut attempt = 1u32;

        while dest_path.exists() {
            file_name = format!(
                "{}_{}_{}",
                chrono_like_timestamp(),
                attempt,
                original_name
            );
            dest_path = backgrounds_dir.join(&file_name);
            attempt = attempt.saturating_add(1);
        }

        std::fs::copy(&source_path, &dest_path).map_err(|e| e.to_string())?;

        imported.push(ImportedBackgroundImage {
            path: dest_path.to_string_lossy().to_string(),
            file_name,
        });
    }

    Ok(imported)
}

#[tauri::command]
fn delete_background_image_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use std::path::{Path, PathBuf};

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let backgrounds_dir = app_data_dir.join("backgrounds");
    std::fs::create_dir_all(&backgrounds_dir).map_err(|e| e.to_string())?;

    let backgrounds_dir = backgrounds_dir
        .canonicalize()
        .map_err(|e| e.to_string())?;

    let target = PathBuf::from(path);
    let target_file_name = target
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "invalid file path".to_string())?
        .to_string();

    let target_parent = target
        .parent()
        .unwrap_or_else(|| Path::new(""))
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let target_normalized = target_parent.join(target_file_name);

    if !target_normalized.starts_with(&backgrounds_dir) {
        return Err("invalid file path".to_string());
    }

    match std::fs::remove_file(&target_normalized) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

fn chrono_like_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    ms.to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            use tauri::{
                menu::{Menu, MenuItem, PredefinedMenuItem},
                tray::TrayIconBuilder,
                Manager,
            };

            app.handle()
                .plugin(tauri_plugin_global_shortcut::Builder::new().build())?;

            let open = MenuItem::with_id(
                app,
                "tray.open",
                format!("打开 PinWall ({})", open_shortcut_display()),
                true,
                None::<&str>,
            )?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let settings =
                MenuItem::with_id(app, "tray.settings", "设置", true, None::<&str>)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "tray.quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &sep1, &settings, &sep2, &quit])?;

            let tray = TrayIconBuilder::new()
                .menu(&menu)
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "tray.open" => {
                        summon_main_window(app);
                    }
                    "tray.settings" => {
                        if let Some(window) = app.get_webview_window("settings") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "tray.quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            app.manage(tray);

            app.manage(MainLayerState(std::sync::Mutex::new(false)));
            set_main_default_layer(&app.handle());

            if let Err(err) = app.global_shortcut().on_shortcut(
                "CommandOrControl+Shift+Space",
                |app_handle, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_main_layer(app_handle);
                    }
                },
            ) {
                eprintln!("failed to register global shortcut: {err}");
            }

            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            quit_app,
            send_to_background,
            import_background_images,
            delete_background_image_file
        ])
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                window.app_handle().exit(0);
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
