mod background;
mod cards_storage;
mod clipboard;
mod clipboard_history;
mod commands;
mod credentials;
mod i18n;
mod image_tools;
mod metrics;
mod persistence;
mod power;
mod shelf;
mod screen_tools;
mod tool_files;
mod tray;
mod widgets;
mod widget_repository;
mod widget_network;
mod utilities;
mod desktop_tools;
mod window_layer;

use tauri::Manager;
use window_layer::{set_main_default_layer, MainLayerState};
use tray::CurrentShortcut;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let application = tauri::Builder::default()
        .manage(cards_storage::CardsStorage::default())
        .manage(power::PowerService::default())
        .manage(metrics::MetricsService::default())
        .manage(clipboard::ClipboardService::default())
        .manage(screen_tools::ScreenService::default())
        .manage(widget_network::NetworkService::default())
        .manage(desktop_tools::DesktopService::default())
        .manage(shelf::ShelfService::default())
        .manage(image_tools::ImageService::default())
        .manage(clipboard_history::HistoryService::default())
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
            widgets::preview_widget_install,
            widgets::install_official_widget,
            widgets::read_widget_entry_html,
            widgets::uninstall_widget,
            widgets::read_widget_storage,
            widgets::write_widget_storage,
            widgets::mutate_widget_storage,
            widgets::get_widget_rollback,
            widgets::rollback_widget,
            widgets::get_system_info,
            desktop_tools::widget_audio_request,
            desktop_tools::widget_audio_route_request,
            desktop_tools::widget_media_request,
            desktop_tools::widget_window_request,
            desktop_tools::widget_notification_request,
            widget_network::widget_network_request,
            widget_network::cancel_widget_network,
            utilities::widget_utilities_request,
            power::open_widget_power_session,
            power::widget_power_request,
            power::close_widget_power_session,
            power::revoke_widget_power,
            clipboard::read_widget_clipboard_text,
            shelf::widget_shelf_request,
            screen_tools::widget_screen_request,
            image_tools::select_widget_image,
            image_tools::export_widget_image,
            image_tools::recognize_widget_image,
            clipboard_history::widget_history_request,
            clipboard_history::get_widget_history_status,
            clipboard_history::revoke_widget_tool,
        ])
        .on_webview_event(|webview, event| {
            if webview.label() == "main" {
                if let tauri::WebviewEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                    shelf::on_native_drop(webview.app_handle().clone(), paths.clone());
                }
            }
        })
        .on_page_load(|webview, payload| {
            if webview.label() == "main" && matches!(payload.event(), tauri::webview::PageLoadEvent::Started) {
                if webview.state::<shelf::ShelfService>().deactivate().is_err() {
                    eprintln!("[Shelf] Session cleanup failed");
                }
                if webview.state::<screen_tools::ScreenService>().clear().is_err() {
                    eprintln!("[ScreenTools] Capture cleanup failed");
                }
                if webview.state::<clipboard_history::HistoryService>().stop(true).is_err() {
                    eprintln!("[ClipboardHistory] Failed to clear session on page reload");
                }
                if webview.state::<image_tools::ImageService>().clear().is_err() {
                    eprintln!("[ImageTools] Failed to clear selection on page reload");
                }
                if webview.state::<power::PowerService>().close_all().is_err() {
                    eprintln!("[Power] Failed to release assertion on page reload");
                }
            }
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::Destroyed if window.label() == "main" => {
                if window.state::<shelf::ShelfService>().deactivate().is_err() {
                    eprintln!("[Shelf] Session cleanup failed");
                }
                if window.state::<screen_tools::ScreenService>().clear().is_err() {
                    eprintln!("[ScreenTools] Capture cleanup failed");
                }
                if window.state::<clipboard_history::HistoryService>().stop(true).is_err() {
                    eprintln!("[ClipboardHistory] Failed to clear session on window destruction");
                }
                if window.state::<desktop_tools::DesktopService>().clear().is_err() { eprintln!("[DesktopTools] Window cleanup failed"); }
                if window.state::<image_tools::ImageService>().clear().is_err() {
                    eprintln!("[ImageTools] Failed to clear selection on window destruction");
                }
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
        .build(tauri::generate_context!());
    match application {
        Ok(app) => app.run(|app, event| {
            if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
                if app.state::<desktop_tools::DesktopService>().clear().is_err() { eprintln!("[DesktopTools] Exit cleanup failed"); }
                if app.state::<screen_tools::ScreenService>().shutdown().is_err() { eprintln!("[ScreenTools] Exit cleanup failed"); }
                if app.state::<shelf::ShelfService>().deactivate().is_err() { eprintln!("[Shelf] Exit cleanup failed"); }
                if app.state::<clipboard_history::HistoryService>().stop(true).is_err() { eprintln!("[ClipboardHistory] Exit cleanup failed"); }
            }
        }),
        Err(_) => { eprintln!("[App] Native application initialization failed"); std::process::exit(1); },
    }
}
