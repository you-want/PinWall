use std::path::PathBuf;

#[derive(serde::Serialize)]
pub struct ImportedBackgroundImage {
    pub path: String,
    pub file_name: String,
}

#[tauri::command]
pub fn import_background_images(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<Vec<ImportedBackgroundImage>, String> {
    use tauri::Manager;

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
pub fn delete_background_image_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use std::path::{Path, PathBuf};
    use tauri::Manager;

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

pub fn chrono_like_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    ms.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chrono_like_timestamp_returns_non_empty() {
        let ts = chrono_like_timestamp();
        assert!(!ts.is_empty());
    }

    #[test]
    fn test_chrono_like_timestamp_is_numeric() {
        let ts = chrono_like_timestamp();
        assert!(ts.chars().all(|c| c.is_ascii_digit()), "timestamp '{}' should be numeric", ts);
    }

    #[test]
    fn test_chrono_like_timestamp_is_large() {
        // Millisecond timestamps should be > 1 trillion
        let ts: u128 = chrono_like_timestamp().parse().unwrap();
        assert!(ts > 1_000_000_000_000);
    }
}
