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
/// e.g. "CommandOrControl+Shift+Space" -> "⌘⇧Space" (macOS) / "Ctrl+Shift+Space" (other)
pub fn format_shortcut(shortcut: &str) -> String {
    let parts: Vec<&str> = shortcut
        .split('+')
        .map(|part| {
            let p = part.trim();
            if cfg!(target_os = "macos") {
                match p {
                    "CommandOrControl" | "CmdOrCtrl" | "Command" | "Cmd" => "⌘",
                    "Control" | "Ctrl" => "⌃",
                    "Alt" | "Option" => "⌥",
                    "Shift" => "⇧",
                    "Super" | "Meta" => "⌘",
                    other => other,
                }
            } else {
                match p {
                    "CommandOrControl" | "CmdOrCtrl" => "Ctrl",
                    "Command" | "Cmd" => "Cmd",
                    "Control" | "Ctrl" => "Ctrl",
                    "Alt" | "Option" => "Alt",
                    "Shift" => "Shift",
                    "Super" | "Meta" => "Win",
                    other => other,
                }
            }
        })
        .collect();

    // macOS: concatenate without separator (⌘⇧Space), others: join with "+"
    if cfg!(target_os = "macos") {
        parts.join("")
    } else {
        parts.join("+")
    }
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
    std::env::var("LANG")
        .map(|l| if l.starts_with("zh") { Lang::Zh } else { Lang::En })
        .unwrap_or(Lang::En)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lang_from_str_zh() {
        assert_eq!(lang_from_str("zh"), Lang::Zh);
    }

    #[test]
    fn test_lang_from_str_en() {
        assert_eq!(lang_from_str("en"), Lang::En);
    }

    #[test]
    fn test_lang_from_str_unknown_defaults_to_en() {
        assert_eq!(lang_from_str("ja"), Lang::En);
    }

    #[test]
    fn test_tray_translations_zh() {
        let t = tray_translations(Lang::Zh);
        assert_eq!(t.open, "打开 PinWall");
        assert_eq!(t.settings, "设置");
        assert_eq!(t.quit, "退出");
    }

    #[test]
    fn test_tray_translations_en() {
        let t = tray_translations(Lang::En);
        assert_eq!(t.open, "Open PinWall");
        assert_eq!(t.settings, "Settings");
        assert_eq!(t.quit, "Quit");
    }

    #[test]
    fn test_format_shortcut_macos_style() {
        // On macOS, parts are concatenated without separator
        let result = format_shortcut("CommandOrControl+Shift+Space");
        assert_eq!(result, "⌘⇧Space");
    }

    #[test]
    fn test_format_shortcut_control() {
        let result = format_shortcut("Control+Shift+Space");
        // On macOS: "⌃⇧Space"
        // On other: "Ctrl+Shift+Space"
        assert!(result.contains("Space"));
    }

    #[test]
    fn test_format_shortcut_single_key() {
        let result = format_shortcut("Space");
        assert_eq!(result, "Space");
    }

    #[test]
    fn test_format_shortcut_option() {
        let result = format_shortcut("Alt+Space");
        // On macOS: "⌥Space"
        assert!(result.contains("Space"));
    }

    #[test]
    fn test_format_shortcut_super() {
        let result = format_shortcut("Super+Space");
        // On macOS: "⌘Space"
        assert!(result.contains("Space"));
    }

    #[test]
    fn test_format_shortcut_unknown_kept_as_is() {
        let result = format_shortcut("F1");
        assert_eq!(result, "F1");
    }

    #[test]
    fn test_format_shortcut_cmd_or_ctrl_aliases() {
        let result1 = format_shortcut("CmdOrCtrl+Space");
        assert!(result1.contains("Space"));

        let result2 = format_shortcut("Command+Space");
        assert!(result2.contains("Space"));
    }
}
