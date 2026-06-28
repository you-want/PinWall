use std::collections::HashMap;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tauri::Manager;

/// Widget manifest 结构（与前端 WidgetManifest 对齐）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WidgetManifest {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub author: String,
    pub entry: String,
    pub icon: String,
    #[serde(rename = "type")]
    pub widget_type: String,
    pub category: String,
    pub permissions: Vec<String>,
    #[serde(rename = "defaultSize")]
    pub default_size: WidgetSize,
    #[serde(rename = "minSize")]
    pub min_size: Option<WidgetSize>,
    #[serde(rename = "maxSize")]
    pub max_size: Option<WidgetSize>,
    pub settings: Option<Vec<serde_json::Value>>,
    #[serde(rename = "installedPath", default, skip_serializing_if = "Option::is_none")]
    pub installed_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WidgetSize {
    pub width: f64,
    pub height: f64,
}

fn validate_widget_id(id: &str) -> Result<(), String> {
    if id.len() < 5 || id.len() > 120 {
        return Err("Widget id length is invalid".to_string());
    }
    if id.starts_with('.') || id.ends_with('.') || id.contains("..") {
        return Err("Widget id must use reverse-domain format".to_string());
    }
    if id.split('.').count() < 3 {
        return Err("Widget id must use reverse-domain format".to_string());
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '-')
    {
        return Err("Widget id may only contain lowercase letters, digits, dots, and hyphens".to_string());
    }
    for part in id.split('.') {
        if part.is_empty() || part.starts_with('-') || part.ends_with('-') {
            return Err("Widget id contains an invalid segment".to_string());
        }
    }
    Ok(())
}

fn validate_widget_file_path(path: &str, field: &str) -> Result<(), String> {
    let candidate = PathBuf::from(path);
    if candidate.is_absolute() || path.contains('\\') {
        return Err(format!("Widget {} must be a relative POSIX path", field));
    }
    if candidate
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(format!("Widget {} cannot contain parent directory segments", field));
    }
    Ok(())
}

fn validate_widget_type(widget_type: &str) -> Result<(), String> {
    match widget_type {
        "official" | "community" => Ok(()),
        _ => Err("Widget type is invalid".to_string()),
    }
}

fn validate_widget_category(category: &str) -> Result<(), String> {
    match category {
        "utility"
        | "productivity"
        | "beautification"
        | "entertainment"
        | "system"
        | "social"
        | "developer"
        | "other" => Ok(()),
        _ => Err("Widget category is invalid".to_string()),
    }
}

fn validate_widget_permission(permission: &str) -> Result<(), String> {
    match permission {
        "storage"
        | "theme"
        | "notify"
        | "cards"
        | "events"
        | "app"
        | "ai"
        | "system"
        | "network"
        | "i18n" => Ok(()),
        _ => Err(format!("Widget permission is invalid: {}", permission)),
    }
}

fn validate_manifest(manifest: &WidgetManifest) -> Result<(), String> {
    validate_widget_id(&manifest.id)?;
    validate_widget_type(&manifest.widget_type)?;
    validate_widget_category(&manifest.category)?;
    validate_widget_file_path(&manifest.entry, "entry")?;
    validate_widget_file_path(&manifest.icon, "icon")?;
    for permission in &manifest.permissions {
        validate_widget_permission(permission)?;
    }
    if manifest.name.trim().is_empty() {
        return Err("Widget name is required".to_string());
    }
    if manifest.version.trim().is_empty() {
        return Err("Widget version is required".to_string());
    }
    if manifest.default_size.width <= 0.0 || manifest.default_size.height <= 0.0 {
        return Err("Widget default size must be positive".to_string());
    }
    Ok(())
}

fn validate_manifest_files(source: &PathBuf, manifest: &WidgetManifest) -> Result<(), String> {
    for (field, relative_path) in [
        ("entry", manifest.entry.as_str()),
        ("icon", manifest.icon.as_str()),
    ] {
        let full_path = source.join(relative_path);
        let metadata = std::fs::symlink_metadata(&full_path)
            .map_err(|_| format!("Widget {} file does not exist: {}", field, relative_path))?;
        if metadata.file_type().is_symlink() {
            return Err(format!("Widget {} cannot be a symlink", field));
        }
        if !metadata.is_file() {
            return Err(format!("Widget {} must be a file", field));
        }
    }
    Ok(())
}

fn official_widget_dir_name(id: &str) -> Option<&'static str> {
    match id {
        "com.pinwall.clock" => Some("widget-clock"),
        "com.pinwall.weather" => Some("widget-weather"),
        "com.pinwall.pomodoro" => Some("widget-pomodoro"),
        "com.pinwall.system-monitor" => Some("widget-system-monitor"),
        "com.pinwall.music" => Some("widget-music"),
        _ => None,
    }
}

fn official_widget_source(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    validate_widget_id(id)?;
    let dir_name = official_widget_dir_name(id)
        .ok_or_else(|| "Official widget is not available".to_string())?;

    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir
            .join("official-widgets")
            .join(dir_name);
        if bundled.exists() {
            return Ok(bundled);
        }
    }

    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../widgets")
        .join(dir_name);
    if dev_path.exists() {
        return Ok(dev_path);
    }

    Err("Official widget files were not found".to_string())
}

/// 获取 widgets 目录路径
fn widgets_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("widgets");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// 列出所有已安装 Widget 的 manifest
#[tauri::command]
pub fn list_installed_widgets(app: tauri::AppHandle) -> Result<Vec<WidgetManifest>, String> {
    let dir = widgets_dir(&app)?;
    let mut manifests = Vec::new();

    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let manifest_path = entry.path().join("widget.json");
        if !manifest_path.exists() {
            continue;
        }
        match std::fs::read_to_string(&manifest_path) {
            Ok(content) => match serde_json::from_str::<WidgetManifest>(&content) {
                Ok(mut manifest) => match validate_manifest(&manifest) {
                    Ok(()) => {
                        manifest.installed_path = Some(entry.path().to_string_lossy().to_string());
                        manifests.push(manifest);
                    },
                    Err(e) => {
                        eprintln!(
                            "[Widget] Invalid manifest for {:?}: {}",
                            entry.file_name(),
                            e
                        );
                    }
                },
                Err(e) => {
                    eprintln!(
                        "[Widget] Failed to parse manifest for {:?}: {}",
                        entry.file_name(),
                        e
                    );
                }
            },
            Err(e) => {
                eprintln!(
                    "[Widget] Failed to read manifest for {:?}: {}",
                    entry.file_name(),
                    e
                );
            }
        }
    }

    Ok(manifests)
}

/// 从本地路径安装 Widget（复制整个目录到 widgets/{id}/）
#[tauri::command]
pub fn install_widget(app: tauri::AppHandle, path: String) -> Result<WidgetManifest, String> {
    let source = PathBuf::from(&path);
    install_widget_from_source(&app, source)
}

fn install_widget_from_source(app: &tauri::AppHandle, source: PathBuf) -> Result<WidgetManifest, String> {
    if !source.exists() {
        return Err("Source path does not exist".to_string());
    }

    // 读取并校验 manifest
    let manifest_path = source.join("widget.json");
    let manifest_content =
        std::fs::read_to_string(&manifest_path).map_err(|e| format!("Cannot read widget.json: {}", e))?;
    let manifest: WidgetManifest =
        serde_json::from_str(&manifest_content).map_err(|e| format!("Invalid widget.json: {}", e))?;
    validate_manifest(&manifest)?;
    validate_manifest_files(&source, &manifest)?;

    // 目标目录
    let dest = widgets_dir(app)?.join(&manifest.id);

    // 如果已存在则先删除（覆盖安装）
    if dest.exists() {
        std::fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
    }

    // 递归复制
    copy_dir_recursive(&source, &dest)?;

    let mut installed_manifest = manifest;
    installed_manifest.installed_path = Some(dest.to_string_lossy().to_string());
    Ok(installed_manifest)
}

/// 安装内置官方 Widget（从打包资源或开发目录复制到用户 widgets 目录）
#[tauri::command]
pub fn install_official_widget(app: tauri::AppHandle, id: String) -> Result<WidgetManifest, String> {
    let source = official_widget_source(&app, &id)?;
    install_widget_from_source(&app, source)
}

/// 读取已安装 Widget 的入口 HTML，用于前端 iframe srcDoc 渲染。
#[tauri::command]
pub fn read_widget_entry_html(app: tauri::AppHandle, id: String) -> Result<String, String> {
    validate_widget_id(&id)?;

    let widget_dir = widgets_dir(&app)?.join(&id);
    if !widget_dir.exists() {
        return Err("Widget is not installed".to_string());
    }

    let manifest_path = widget_dir.join("widget.json");
    let manifest_content = std::fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Cannot read widget.json: {}", e))?;
    let manifest: WidgetManifest = serde_json::from_str(&manifest_content)
        .map_err(|e| format!("Invalid widget.json: {}", e))?;
    validate_manifest(&manifest)?;
    if manifest.id != id {
        return Err("Widget manifest id does not match installed directory".to_string());
    }

    let entry_path = widget_dir.join(&manifest.entry);
    let metadata = std::fs::symlink_metadata(&entry_path)
        .map_err(|_| format!("Widget entry file does not exist: {}", manifest.entry))?;
    if metadata.file_type().is_symlink() {
        return Err("Widget entry cannot be a symlink".to_string());
    }
    if !metadata.is_file() {
        return Err("Widget entry must be a file".to_string());
    }

    std::fs::read_to_string(&entry_path)
        .map_err(|e| format!("Cannot read widget entry: {}", e))
}

/// 卸载 Widget（删除 widgets/{id}/ 目录及其存储数据）
#[tauri::command]
pub fn uninstall_widget(app: tauri::AppHandle, id: String) -> Result<(), String> {
    validate_widget_id(&id)?;
    let dir = widgets_dir(&app)?.join(&id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }

    // 清理存储数据
    let storage_path = widgets_dir(&app)?
        .join(format!("{}_storage.json", id));
    if storage_path.exists() {
        let _ = std::fs::remove_file(&storage_path);
    }

    Ok(())
}

/// 读取 Widget 存储数据
#[tauri::command]
pub fn read_widget_storage(
    app: tauri::AppHandle,
    id: String,
) -> Result<HashMap<String, serde_json::Value>, String> {
    validate_widget_id(&id)?;
    let storage_path = widgets_dir(&app)?
        .join(format!("{}_storage.json", id));
    if !storage_path.exists() {
        return Ok(HashMap::new());
    }
    let content = std::fs::read_to_string(&storage_path).map_err(|e| e.to_string())?;
    let data: HashMap<String, serde_json::Value> =
        serde_json::from_str(&content).unwrap_or_default();
    Ok(data)
}

/// 写入 Widget 存储数据
#[tauri::command]
pub fn write_widget_storage(
    app: tauri::AppHandle,
    id: String,
    data: HashMap<String, serde_json::Value>,
) -> Result<(), String> {
    validate_widget_id(&id)?;
    let storage_path = widgets_dir(&app)?
        .join(format!("{}_storage.json", id));
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&storage_path, json).map_err(|e| e.to_string())?;
    Ok(())
}

/// 获取系统信息（供 Widget system API 使用）
#[tauri::command]
pub fn get_system_info(category: String) -> Result<serde_json::Value, String> {
    match category.as_str() {
        "getBattery" => {
            // 电池信息在 macOS 上通过 pmset 获取
            #[cfg(target_os = "macos")]
            {
                let output = std::process::Command::new("pmset")
                    .arg("-g")
                    .arg("batt")
                    .output()
                    .map_err(|e| e.to_string())?;
                let text = String::from_utf8_lossy(&output.stdout);
                // 解析百分比
                let percent = text
                    .find('\t')
                    .and_then(|i| {
                        let rest = &text[i..];
                        rest.find('%').map(|j| {
                            let start = rest[..j].rfind(char::is_numeric).unwrap_or(0);
                            rest[start..j].parse::<f64>().unwrap_or(-1.0)
                        })
                    })
                    .unwrap_or(-1.0);
                let charging = text.contains("charging") && !text.contains("discharging");
                Ok(serde_json::json!({
                    "level": percent / 100.0,
                    "charging": charging,
                }))
            }
            #[cfg(not(target_os = "macos"))]
            {
                Ok(serde_json::json!({ "level": -1, "charging": false }))
            }
        }
        "getMemoryInfo" => {
            #[cfg(target_os = "macos")]
            {
                let output = std::process::Command::new("vm_stat")
                    .output()
                    .map_err(|e| e.to_string())?;
                let text = String::from_utf8_lossy(&output.stdout);
                // 简单解析（pages active * page_size）
                let page_size = 16384u64; // Apple Silicon default
                let active = parse_vm_stat(&text, "Pages active").unwrap_or(0);
                let total_mem = get_total_memory_macos().unwrap_or(0);
                let used = active * page_size;
                Ok(serde_json::json!({
                    "total": total_mem,
                    "used": used,
                    "free": total_mem.saturating_sub(used),
                }))
            }
            #[cfg(not(target_os = "macos"))]
            {
                Ok(serde_json::json!({ "total": 0, "used": 0, "free": 0 }))
            }
        }
        "getMediaInfo" => Ok(serde_json::json!({
            "trackName": "PinWall Focus",
            "artistName": "Local Demo",
            "albumName": "Desktop Session",
            "isPlaying": false,
            "position": 0,
            "duration": 180,
            "volume": 0.7
        })),
        "mediaControl" => Ok(serde_json::json!({ "ok": true })),
        _ => Ok(serde_json::json!({})),
    }
}

// ── 辅助函数 ──

fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        let metadata = std::fs::symlink_metadata(&src_path).map_err(|e| e.to_string())?;
        if metadata.file_type().is_symlink() {
            return Err(format!("Widget package cannot contain symlinks: {:?}", src_path));
        }
        if metadata.is_dir() {
            // 跳过 node_modules 和 .git
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str == "node_modules" || name_str == ".git" || name_str == "dist" && false {
                continue;
            }
            copy_dir_recursive(&src_path, &dst_path)?;
        } else if metadata.is_file() {
            std::fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn parse_vm_stat(text: &str, key: &str) -> Option<u64> {
    text.lines()
        .find(|line| line.contains(key))
        .and_then(|line| {
            line.split(':')
                .nth(1)
                .and_then(|v| v.trim().split('.').next())
                .and_then(|v| v.trim().parse::<u64>().ok())
        })
}

#[cfg(target_os = "macos")]
fn get_total_memory_macos() -> Option<u64> {
    let output = std::process::Command::new("sysctl")
        .arg("-n")
        .arg("hw.memsize")
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    text.trim().parse::<u64>().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_reverse_domain_widget_ids() {
        assert!(validate_widget_id("com.pinwall.clock").is_ok());
        assert!(validate_widget_id("io.example.my-widget1").is_ok());
    }

    #[test]
    fn rejects_widget_ids_that_can_escape_storage_paths() {
        assert!(validate_widget_id("../clock").is_err());
        assert!(validate_widget_id("com..clock").is_err());
        assert!(validate_widget_id("Com.PinWall.Clock").is_err());
        assert!(validate_widget_id("clock").is_err());
    }

    #[test]
    fn rejects_absolute_or_parent_widget_paths() {
        assert!(validate_widget_file_path("index.html", "entry").is_ok());
        assert!(validate_widget_file_path("dist/index.html", "entry").is_ok());
        assert!(validate_widget_file_path("../index.html", "entry").is_err());
        assert!(validate_widget_file_path("/tmp/index.html", "entry").is_err());
        assert!(validate_widget_file_path("dist\\index.html", "entry").is_err());
    }

    #[test]
    fn validates_manifest_enums() {
        assert!(validate_widget_type("official").is_ok());
        assert!(validate_widget_type("community").is_ok());
        assert!(validate_widget_type("unknown").is_err());

        assert!(validate_widget_category("utility").is_ok());
        assert!(validate_widget_category("beautification").is_ok());
        assert!(validate_widget_category("unknown").is_err());

        assert!(validate_widget_permission("storage").is_ok());
        assert!(validate_widget_permission("network").is_ok());
        assert!(validate_widget_permission("dangerous").is_err());
    }

    #[test]
    fn maps_only_known_official_widget_ids() {
        assert_eq!(official_widget_dir_name("com.pinwall.clock"), Some("widget-clock"));
        assert_eq!(official_widget_dir_name("com.pinwall.weather"), Some("widget-weather"));
        assert_eq!(official_widget_dir_name("com.pinwall.unknown"), None);
        assert_eq!(official_widget_dir_name("../widgets/widget-clock"), None);
    }

    #[test]
    fn bundled_official_widgets_are_installable_sources() {
        let widgets_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../widgets");
        for id in [
            "com.pinwall.clock",
            "com.pinwall.weather",
            "com.pinwall.pomodoro",
            "com.pinwall.system-monitor",
            "com.pinwall.music",
        ] {
            let dir_name = official_widget_dir_name(id).unwrap();
            let source = widgets_root.join(dir_name);
            let manifest_content = std::fs::read_to_string(source.join("widget.json")).unwrap();
            let manifest: WidgetManifest = serde_json::from_str(&manifest_content).unwrap();
            validate_manifest(&manifest).unwrap();
            validate_manifest_files(&source, &manifest).unwrap();
        }
    }

    #[test]
    fn validates_manifest_entry_and_icon_files() {
        let temp_root = std::env::temp_dir().join(format!(
            "pinwall-widget-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&temp_root).unwrap();
        std::fs::write(temp_root.join("index.html"), "<html></html>").unwrap();
        std::fs::write(temp_root.join("icon.png"), "").unwrap();

        let manifest = WidgetManifest {
            id: "com.pinwall.clock".to_string(),
            name: "Clock".to_string(),
            description: "Clock widget".to_string(),
            version: "1.0.0".to_string(),
            author: "PinWall".to_string(),
            entry: "index.html".to_string(),
            icon: "icon.png".to_string(),
            widget_type: "official".to_string(),
            category: "utility".to_string(),
            permissions: vec!["storage".to_string()],
            default_size: WidgetSize { width: 200.0, height: 200.0 },
            min_size: None,
            max_size: None,
            settings: None,
            installed_path: None,
        };

        assert!(validate_manifest_files(&temp_root, &manifest).is_ok());

        let missing_icon = WidgetManifest {
            icon: "missing.png".to_string(),
            ..manifest
        };
        assert!(validate_manifest_files(&temp_root, &missing_icon).is_err());

        std::fs::remove_dir_all(&temp_root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_when_copying_widget_package() {
        let temp_root = std::env::temp_dir().join(format!(
            "pinwall-widget-copy-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let source = temp_root.join("source");
        let dest = temp_root.join("dest");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(source.join("index.html"), "<html></html>").unwrap();
        std::os::unix::fs::symlink(source.join("index.html"), source.join("link.html")).unwrap();

        assert!(copy_dir_recursive(&source, &dest).is_err());

        std::fs::remove_dir_all(&temp_root).unwrap();
    }
}
