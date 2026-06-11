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

/// Convert a Tauri shortcut string to a human-readable display string.
/// e.g. "CommandOrControl+Shift+Space" -> "Cmd+Shift+Space" (macOS) / "Ctrl+Shift+Space" (other)
pub fn format_shortcut(shortcut: &str) -> String {
    shortcut
        .split('+')
        .map(|part| {
            let p = part.trim();
            match p {
                "CommandOrControl" | "CmdOrCtrl" => {
                    if cfg!(target_os = "macos") { "Cmd" } else { "Ctrl" }
                }
                "Command" | "Cmd" => "Cmd",
                "Control" | "Ctrl" => {
                    if cfg!(target_os = "macos") { "Ctrl" } else { "Ctrl" }
                }
                "Alt" | "Option" => "Alt",
                "Shift" => "Shift",
                "Super" | "Meta" => {
                    if cfg!(target_os = "macos") { "Cmd" } else { "Win" }
                }
                other => other,
            }
        })
        .collect::<Vec<_>>()
        .join("+")
}

/// Read the globalShortcut from pinwall-settings.json on disk.
/// Returns the default shortcut if the file doesn't exist or can't be parsed.
pub fn read_shortcut_from_disk(app: &tauri::AppHandle) -> String {
    if let Ok(data_dir) = app.path().app_data_dir() {
        let path = data_dir.join("pinwall-settings.json");
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(s) = v.get("globalShortcut").and_then(|v| v.as_str()) {
                    if !s.is_empty() {
                        return s.to_string();
                    }
                }
            }
        }
    }
    "CommandOrControl+Shift+Space".to_string()
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
