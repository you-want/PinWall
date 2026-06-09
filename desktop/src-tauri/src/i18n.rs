use serde::Deserialize;
use tauri::Manager;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    Zh,
    En,
}

pub struct TrayTranslations {
    pub open: &'static str,
    pub settings: &'static str,
    pub quit: &'static str,
}

pub fn tray_translations(lang: Lang) -> TrayTranslations {
    match lang {
        Lang::Zh => TrayTranslations {
            open: "打开 PinWall",
            settings: "设置",
            quit: "退出",
        },
        Lang::En => TrayTranslations {
            open: "Open PinWall",
            settings: "Settings",
            quit: "Quit",
        },
    }
}

pub fn shortcut_display() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Cmd+Shift+Space"
    }

    #[cfg(not(target_os = "macos"))]
    {
        "Ctrl+Shift+Space"
    }
}

pub fn detect_lang_from_disk(app: &tauri::AppHandle) -> Lang {
    if let Ok(data_dir) = app.path().app_data_dir() {
        // tauri-plugin-zustand adds ".dev" suffix in debug builds
        let file_name = if cfg!(debug_assertions) {
            "language.dev.json"
        } else {
            "language.json"
        };
        let path = data_dir.join("tauri-plugin-zustand").join(file_name);
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(state) = serde_json::from_str::<LangState>(&content) {
                return match state.lang.as_str() {
                    "zh" => Lang::Zh,
                    _ => Lang::En,
                };
            }
        }
    }
    detect_system_lang()
}

pub fn lang_from_str(s: &str) -> Lang {
    match s {
        "zh" => Lang::Zh,
        _ => Lang::En,
    }
}

#[derive(Deserialize)]
struct LangState {
    lang: String,
}

fn detect_system_lang() -> Lang {
    #[cfg(target_os = "macos")]
    {
        std::env::var("LANG")
            .map(|l| if l.starts_with("zh") { Lang::Zh } else { Lang::En })
            .unwrap_or(Lang::En)
    }

    #[cfg(not(target_os = "macos"))]
    {
        std::env::var("LANG")
            .map(|l| if l.starts_with("zh") { Lang::Zh } else { Lang::En })
            .unwrap_or(Lang::En)
    }
}
