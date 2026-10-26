mod background;
mod cards_storage;
mod commands;
mod credentials;
mod i18n;
mod persistence;
mod power;
mod tray;
mod widgets;
mod window_layer;

use tauri::Manager;
use window_layer::{set_main_default_layer, MainLayerState};
use tray::CurrentShortcut;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(cards_storage::CardsStorage::default())
        .manage(power::PowerService::default())
        .setup(|app| {
            // 隐藏 Dock 图标，仅通过托盘图标交互
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            #[cfg(target_os = "macos")]
            app.handle().plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None::<Vec<&str>>,
            ))?;

            app.handle()
                .plugin(tauri_plugin_global_shortcut::Builder::new().build())?;

            // Initialize current shortcut state BEFORE tray (tray menu reads it)
            let shortcut = i18n::read_shortcut_from_disk(&app.handle());
            app.manage(CurrentShortcut(std::sync::Mutex::new(shortcut)));

            tray::setup_tray(app)?;

            app.manage(MainLayerState(std::sync::Mutex::new(false)));
            set_main_default_layer(&app.handle());

            tray::setup_global_shortcut(&app.handle());

            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_zustand::init())
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::get_app_version,
            commands::quit_app,
            persistence::settings_read,
            persistence::settings_compare_and_swap,
            persistence::prepare_local_storage,
            persistence::export_note_backup,
            persistence::read_note_backup,
            persistence::restore_note_backup,
            cards_storage::cards_read,
            cards_storage::cards_patch,
            window_layer::send_to_background,
            window_layer::summon_main,
            window_layer::is_main_summoned,
            window_layer::set_cursor_passthrough,
            background::import_background_images,
            background::delete_background_image_file,
            tray::update_tray_menu,
            tray::update_shortcut_display,
            widgets::list_installed_widgets,
            widgets::install_widget,
            widgets::install_official_widget,
            widgets::read_widget_entry_html,
            widgets::uninstall_widget,
            widgets::read_widget_storage,
            widgets::write_widget_storage,
            widgets::get_system_info,
            power::open_widget_power_session,
            power::widget_power_request,
            power::close_widget_power_session,
            power::revoke_widget_power,
        ])
        .on_page_load(|webview, payload| {
            if webview.label() == "main" && matches!(payload.event(), tauri::webview::PageLoadEvent::Started) {
                if webview.state::<power::PowerService>().close_all().is_err() {
                    eprintln!("[Power] Failed to release assertion on page reload");
                }
            }
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::Destroyed if window.label() == "main" => {
                if window.state::<power::PowerService>().close_all().is_err() {
                    eprintln!("[Power] Failed to release assertion on window destruction");
                }
            }
            tauri::WindowEvent::CloseRequested { api, .. } => {
                // 所有窗口关闭时仅隐藏，不退出 APP
                // 退出只能通过托盘菜单「退出」
                api.prevent_close();
                let _ = window.hide();
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
