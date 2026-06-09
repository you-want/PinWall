mod background;
mod commands;
mod i18n;
mod tray;
mod window_layer;

use tauri::Manager;
use window_layer::{set_main_default_layer, MainLayerState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // 隐藏 Dock 图标，仅通过托盘图标交互
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            app.handle()
                .plugin(tauri_plugin_global_shortcut::Builder::new().build())?;

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
            commands::quit_app,
            window_layer::send_to_background,
            window_layer::summon_main,
            window_layer::set_cursor_passthrough,
            background::import_background_images,
            background::delete_background_image_file,
            tray::update_tray_menu
        ])
        .on_window_event(|window, event| match event {
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
