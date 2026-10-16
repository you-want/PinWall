#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Returns the app version from Tauri config.
#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_greet_returns_string() {
        let result = greet("PinWall");
        assert_eq!(result, "Hello, PinWall! You've been greeted from Rust!");
    }

    #[test]
    fn test_greet_empty_name() {
        let result = greet("");
        assert_eq!(result, "Hello, ! You've been greeted from Rust!");
    }

    #[test]
    fn test_greet_unicode() {
        let result = greet("世界");
        assert!(result.contains("世界"));
    }
}
