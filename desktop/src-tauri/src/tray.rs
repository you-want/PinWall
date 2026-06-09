use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::i18n::{self, Lang};
use crate::window_layer::summon_main_window;

const TRAY_ID: &str = "main-tray";

fn build_tray_menu(app: &tauri::AppHandle, lang: Lang) -> tauri::Result<Menu<tauri::Wry>> {
    let t = i18n::tray_translations(lang);
    let open = MenuItem::with_id(
        app,
        "tray.open",
        format!("{} ({})", t.open, i18n::shortcut_display()),
        true,
        None::<&str>,
    )?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let settings = MenuItem::with_id(app, "tray.settings", t.settings, true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "tray.quit", t.quit, true, None::<&str>)?;
    Menu::with_items(app, &[&open, &sep1, &settings, &sep2, &quit])
}

pub fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let lang = i18n::detect_lang_from_disk(&app.handle());
    let menu = build_tray_menu(&app.handle(), lang)?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .icon(tauri::image::Image::from_bytes(include_bytes!(
            "../icons/tray/icon_32.png"
        )).unwrap())
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

    Ok(())
}

/// Command called from frontend when the user switches language.
/// Updates the tray menu in-place without recreating the tray icon.
#[tauri::command]
pub fn update_tray_menu(app: tauri::AppHandle, lang: String) -> Result<(), String> {
    let lang = i18n::lang_from_str(&lang);
    let menu = build_tray_menu(&app, lang).map_err(|e| e.to_string())?;

    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn setup_global_shortcut(app: &tauri::AppHandle) {
    use crate::window_layer::toggle_main_layer;

    if let Err(err) = app.global_shortcut().on_shortcut(
        "CommandOrControl+Shift+Space",
        |app_handle, _shortcut, event: tauri_plugin_global_shortcut::ShortcutEvent| {
            if event.state() == ShortcutState::Pressed {
                toggle_main_layer(app_handle);
            }
        },
    ) {
        eprintln!("failed to register global shortcut: {err}");
    }
}
