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
    #[serde(rename = "minSize", skip_serializing_if = "Option::is_none")]
    pub min_size: Option<WidgetSize>,
    #[serde(rename = "maxSize", skip_serializing_if = "Option::is_none")]
    pub max_size: Option<WidgetSize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub settings: Option<Vec<serde_json::Value>>,
    #[serde(rename = "installedPath", default, skip_serializing_if = "Option::is_none")]
    pub installed_path: Option<String>,
    #[serde(rename = "defaultEnabled", default, skip_serializing_if = "Option::is_none")]
    pub default_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WidgetSize {
    pub width: f64,
    pub height: f64,
}

pub(crate) fn validate_widget_id(id: &str) -> Result<(), String> {
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
    if path.is_empty() || path.contains('\0') || candidate.is_absolute() || path.contains('\\') || candidate.components().any(|c| matches!(c, std::path::Component::CurDir)) {
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
        | "power"
        | "clipboard"
        | "ocr" | "images" | "clipboardHistory" | "shelf" | "screenCapture" | "utilities" | "audio" | "windows" | "input" | "video" | "maintenance" | "display" | "hardware"
        | "network"
        | "i18n" => Ok(()),
        _ => Err(format!("Widget permission is invalid: {}", permission)),
    }
}

pub(crate) fn validate_manifest(manifest: &WidgetManifest) -> Result<(), String> {
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
    if !manifest.default_size.width.is_finite() || !manifest.default_size.height.is_finite() || manifest.default_size.width <= 0.0 || manifest.default_size.height <= 0.0 || manifest.default_size.width > 10000.0 || manifest.default_size.height > 10000.0 {
        return Err("Widget default size must be positive".to_string());
    }
    Ok(())
}

fn validate_manifest_files(source: &PathBuf, manifest: &WidgetManifest) -> Result<(), String> {
    let root = source.canonicalize().map_err(|_| "widget_unsafe_path")?;
    let metadata = std::fs::symlink_metadata(source).map_err(|_| "widget_io")?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() { return Err("widget_unsafe_path".into()); }
    for relative in [&manifest.entry, &manifest.icon] {
        let mut path = source.clone();
        for component in std::path::Path::new(relative).components() {
            path.push(component);
            if std::fs::symlink_metadata(&path).map_err(|_| "widget_io")?.file_type().is_symlink() { return Err("widget_unsafe_path".into()); }
        }
        let metadata = std::fs::metadata(&path).map_err(|_| "widget_io")?;
        if !metadata.is_file() || metadata.len() > 2 * 1024 * 1024 || !path.canonicalize().map_err(|_| "widget_io")?.starts_with(&root) { return Err("widget_unsafe_path".into()); }
    }
    Ok(())
}
pub(crate) fn read_manifest(source: &std::path::Path) -> Result<WidgetManifest, String> {
    let bytes = crate::tool_files::read_bounded(&source.join("widget.json"), 64 * 1024)?;
    let manifest: WidgetManifest = serde_json::from_slice(&bytes).map_err(|_| "widget_manifest_invalid")?;
    validate_manifest(&manifest)?;
    validate_manifest_files(&source.to_path_buf(), &manifest)?;
    Ok(manifest)
}
fn require_host(label: &str) -> Result<(), String> {
    if matches!(label, "main" | "settings") { Ok(()) } else { Err("widget_permission_denied".into()) }
}

fn official_widget_dir_name(id: &str) -> Option<&'static str> {
    match id {
        "com.pinwall.clock" => Some("widget-clock"),
        "com.pinwall.weather" => Some("widget-weather"),
        "com.pinwall.pomodoro" => Some("widget-pomodoro"),
        "com.pinwall.system-monitor" => Some("widget-system-monitor"),
        "com.pinwall.music" => Some("widget-music"),
        "com.pinwall.keep-awake" => Some("widget-keep-awake"),
        "com.pinwall.clipboard-note" => Some("widget-clipboard-note"),
        "com.pinwall.hardware-tools" => Some("widget-hardware-tools"),
        "com.pinwall.display-tools" => Some("widget-display-tools"),
        "com.pinwall.maintenance" => Some("widget-maintenance"),
        "com.pinwall.video-tools" => Some("widget-video-tools"),
        "com.pinwall.input-tools" => Some("widget-input-tools"),
        "com.pinwall.window-tools" => Some("widget-window-tools"),
        "com.pinwall.local-tools" => Some("widget-local-tools"),
        "com.pinwall.file-shelf" => Some("widget-file-shelf"),
        "com.pinwall.screen-tools" => Some("widget-screen-tools"),
        "com.pinwall.ocr-note" => Some("widget-ocr-note"),
        "com.pinwall.image-tools" => Some("widget-image-tools"),
        "com.pinwall.clipboard-history" => Some("widget-clipboard-history"),
        _ => None,
    }
}

fn is_desktop_widget(id: &str) -> bool {
    matches!(id, crate::power::WIDGET_ID | "com.pinwall.system-monitor" | crate::clipboard::WIDGET_ID | "com.pinwall.ocr-note" | "com.pinwall.image-tools" | "com.pinwall.clipboard-history" | "com.pinwall.file-shelf" | "com.pinwall.screen-tools" | "com.pinwall.local-tools" | "com.pinwall.music" | "com.pinwall.window-tools" | "com.pinwall.input-tools" | "com.pinwall.video-tools" | "com.pinwall.maintenance" | "com.pinwall.display-tools" | "com.pinwall.hardware-tools")
}

fn official_widget_source(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    validate_widget_id(id)?;
    let dir_name = official_widget_dir_name(id)
        .ok_or_else(|| "Official widget is not available".to_string())?;

    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir
            .join(if is_desktop_widget(id) { "native-widgets" } else { "official-widgets" })
            .join(dir_name);
        if bundled.exists() {
            return Ok(bundled);
        }
    }

    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join(if is_desktop_widget(id) { "../resources/widgets" } else { "../../widgets" })
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
    std::fs::create_dir_all(&dir).map_err(|_| "widget_io")?;
    if std::fs::symlink_metadata(&dir).map_err(|_| "widget_io")?.file_type().is_symlink() { return Err("widget_unsafe_path".into()); }
    dir.canonicalize().map_err(|_| "widget_io".into())
}

/// 列出所有已安装 Widget 的 manifest
#[tauri::command]
pub fn list_installed_widgets(window: tauri::WebviewWindow, app: tauri::AppHandle) -> Result<Vec<WidgetManifest>, String> {
    require_host(window.label())?;
    let _lock = crate::widget_repository::PACKAGES.lock().map_err(|_| "widget_busy")?;
    let dir = widgets_dir(&app)?;
    let _file_lock=crate::widget_repository::lock_packages(&dir)?;
    crate::widget_repository::cleanup_staging(&dir)?;
    // Recover an interrupted replacement before listing; hidden backup/staging directories are never plugins.
    for entry in std::fs::read_dir(&dir).map_err(|_| "widget_io")? {
        let entry = entry.map_err(|_| "widget_io")?;
        let name = entry.file_name(); let name = name.to_string_lossy();
        if let Some(id) = name.strip_prefix(".previous-") { if validate_widget_id(id).is_ok() { crate::widget_repository::recover(&dir, id)?; } }
    }
    let mut manifests = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|_| "widget_io")? {
        let entry = entry.map_err(|_| "widget_io")?;
        let id = entry.file_name().to_string_lossy().to_string();
        if validate_widget_id(&id).is_err() { continue; }
        match read_manifest(&entry.path()) {
            Ok(mut manifest) if manifest.id == id => {
                manifest.installed_path = Some(entry.path().to_string_lossy().to_string());
                manifests.push(manifest);
            },
            _ => eprintln!("[Widget] Invalid installed package skipped"),
        }
    }
    Ok(manifests)
}

#[tauri::command]
pub fn preview_widget_install(window: tauri::WebviewWindow, path: String) -> Result<WidgetManifest, String> {
    require_host(window.label())?;
    read_manifest(std::path::Path::new(&path))
}

/// 从本地路径安装 Widget（复制整个目录到 widgets/{id}/）
#[tauri::command]
pub fn install_widget(window: tauri::WebviewWindow, app: tauri::AppHandle, path: String, id: String, version: String, permissions: Vec<String>) -> Result<WidgetManifest, String> {
    require_host(window.label())?;
    let source = PathBuf::from(&path);
    install_checked(&app, source, Some((&id, &version, &permissions)))
}

fn install_widget_from_source(app: &tauri::AppHandle, source: PathBuf) -> Result<WidgetManifest, String> {
    install_checked(app, source, None)
}
pub(crate) fn install_checked(app: &tauri::AppHandle, source: PathBuf, expected: Option<(&str, &str, &[String])>) -> Result<WidgetManifest, String> {
    let _lock = crate::widget_repository::PACKAGES.lock().map_err(|_| "widget_busy")?;
    let manifest = read_manifest(&source)?;
    if expected.is_some_and(|(id, version, permissions)| manifest.id != id || manifest.version != version || manifest.permissions != permissions) { return Err("widget_package_changed".into()); }
    let root = widgets_dir(app)?;
    let _file_lock=crate::widget_repository::lock_packages(&root)?;
    let dest = root.join(&manifest.id);
    crate::widget_repository::install(&root, &source, &manifest.id, |stage| {
        let staged = read_manifest(stage)?;
        if staged.id != manifest.id || staged.permissions != manifest.permissions || staged.version != manifest.version { return Err("widget_package_changed".into()); }
        if matches!(manifest.id.as_str(), crate::desktop_tools::AUDIO_ID | crate::desktop_tools::WINDOWS_ID) { app.state::<crate::desktop_tools::DesktopService>().clear_widget(&manifest.id)?; }
        if manifest.id==crate::hardware_tools::WIDGET_ID {app.state::<crate::hardware_tools::HardwareService>().clear()?;}
        if manifest.id==crate::display_tools::WIDGET_ID {app.state::<crate::display_tools::DisplayService>().clear()?;}
        if manifest.id==crate::maintenance::WIDGET_ID {app.state::<crate::maintenance::MaintenanceService>().clear()?;}
        if manifest.id==crate::video_tools::WIDGET_ID {app.state::<crate::video_tools::VideoService>().clear()?;}
        if manifest.id==crate::input_tools::WIDGET_ID {app.state::<crate::input_tools::InputService>().clear()?;}
        if manifest.id == crate::power::WIDGET_ID { app.state::<crate::power::PowerService>().close_all()?; }
        if manifest.id == crate::clipboard_history::WIDGET_ID { app.state::<crate::clipboard_history::HistoryService>().stop(true)?; }
        if manifest.id == crate::shelf::WIDGET_ID { app.state::<crate::shelf::ShelfService>().deactivate()?; }
        if manifest.id == crate::screen_tools::WIDGET_ID { app.state::<crate::screen_tools::ScreenService>().clear()?; }
        if manifest.id == crate::image_tools::IMAGE_ID { app.state::<crate::image_tools::ImageService>().clear()?; }
        Ok(())
    })?;

    let mut installed_manifest = manifest;
    installed_manifest.installed_path = Some(dest.to_string_lossy().to_string());
    Ok(installed_manifest)
}

/// 安装内置官方 Widget（从打包资源或开发目录复制到用户 widgets 目录）
#[tauri::command]
pub fn install_official_widget(window: tauri::WebviewWindow, app: tauri::AppHandle, id: String) -> Result<WidgetManifest, String> {
    require_host(window.label())?;
    let source = official_widget_source(&app, &id)?;
    install_widget_from_source(&app, source)
}

/// 读取已安装 Widget 的入口 HTML，用于前端 iframe srcDoc 渲染。
#[tauri::command]
pub fn read_widget_entry_html(window: tauri::WebviewWindow, app: tauri::AppHandle, id: String) -> Result<String, String> {
    crate::metrics::require_main(window.label())?;
    validate_widget_id(&id)?;
    let _lock = crate::widget_repository::PACKAGES.lock().map_err(|_| "widget_busy")?;
    let root = widgets_dir(&app)?;
    let _file_lock=crate::widget_repository::lock_packages(&root)?;
    crate::widget_repository::recover(&root, &id)?;
    let directory = root.join(&id); let manifest = read_manifest(&directory)?;
    if manifest.id != id { return Err("widget_manifest_invalid".into()); }
    String::from_utf8(crate::tool_files::read_bounded(&directory.join(manifest.entry), 2 * 1024 * 1024)?).map_err(|_| "widget_entry_invalid".into())
}

#[tauri::command]
pub fn get_widget_rollback(window: tauri::WebviewWindow, app: tauri::AppHandle, id: String) -> Result<Option<WidgetManifest>, String> {
    require_host(window.label())?; validate_widget_id(&id)?;
    let _lock = crate::widget_repository::PACKAGES.lock().map_err(|_| "widget_busy")?;
    let root=widgets_dir(&app)?;let _file_lock=crate::widget_repository::lock_packages(&root)?;
    let path = crate::widget_repository::previous(&root, &id);
    if !path.exists() { return Ok(None); }
    let mut manifest = read_manifest(&path)?;
    if manifest.id != id { return Err("widget_manifest_invalid".into()); }
    manifest.default_enabled = Some(false);
    Ok(Some(manifest))
}
#[tauri::command]
pub fn rollback_widget(window: tauri::WebviewWindow, app: tauri::AppHandle, id: String, version: String, permissions: Vec<String>) -> Result<WidgetManifest, String> {
    require_host(window.label())?; validate_widget_id(&id)?;
    let path = crate::widget_repository::previous(&widgets_dir(&app)?, &id);
    let preview = read_manifest(&path)?;
    if preview.id != id || preview.version != version || preview.permissions != permissions { return Err("widget_package_changed".into()); }
    let mut manifest = install_checked(&app, path, Some((&id, &version, &permissions)))?;
    manifest.default_enabled = Some(false);
    Ok(manifest)
}

/// 卸载 Widget（删除 widgets/{id}/ 目录及其存储数据）
#[tauri::command]
pub fn uninstall_widget(window: tauri::WebviewWindow, app: tauri::AppHandle, id: String) -> Result<(), String> {
    require_host(window.label())?;
    validate_widget_id(&id)?;
    let _lock = crate::widget_repository::PACKAGES.lock().map_err(|_| "widget_busy")?;
    let root=widgets_dir(&app)?;let _file_lock=crate::widget_repository::lock_packages(&root)?;
    if matches!(id.as_str(), crate::desktop_tools::AUDIO_ID | crate::desktop_tools::WINDOWS_ID) { app.state::<crate::desktop_tools::DesktopService>().clear_widget(&id)?; }
    if id==crate::hardware_tools::WIDGET_ID {app.state::<crate::hardware_tools::HardwareService>().clear()?;}
    if id==crate::display_tools::WIDGET_ID {app.state::<crate::display_tools::DisplayService>().clear()?;}
    if id==crate::maintenance::WIDGET_ID {app.state::<crate::maintenance::MaintenanceService>().uninstall()?;}
    if id==crate::video_tools::WIDGET_ID {app.state::<crate::video_tools::VideoService>().clear()?;}
    if id==crate::input_tools::WIDGET_ID {crate::input_tools::uninstall(&app)?;}
    if id == crate::power::WIDGET_ID { app.state::<crate::power::PowerService>().close_all()?; }
    if id == crate::clipboard_history::WIDGET_ID { app.state::<crate::clipboard_history::HistoryService>().stop(true)?; }
    if id == crate::utilities::WIDGET_ID {
        let path=crate::tool_files::storage_root(&app)?.join("snippets.json");
        for path in [path.clone(),path.with_extension("json.corrupt-backup")] { if std::fs::symlink_metadata(&path).is_ok() { std::fs::remove_file(path).map_err(|_|"widget_io")?; } }
    }
    if id == crate::shelf::WIDGET_ID { crate::shelf::uninstall(&app)?; }
    if id == crate::screen_tools::WIDGET_ID { app.state::<crate::screen_tools::ScreenService>().clear()?; }
    if id == crate::image_tools::IMAGE_ID { app.state::<crate::image_tools::ImageService>().clear()?; }
    crate::widget_repository::uninstall(&root, &id)?;
    let storage_path = root.join(format!("{}_storage.json", id));
    for path in [storage_path.clone(), storage_path.with_extension("json.corrupt-backup")] {
        if std::fs::symlink_metadata(&path).is_ok() { std::fs::remove_file(path).map_err(|_| "widget_io")?; }
    }

    Ok(())
}

const POWER_WIDGET_FILES: [(&str, &[u8]); 3] = [
    ("widget.json", include_bytes!("../../resources/widgets/widget-keep-awake/widget.json")),
    ("index.html", include_bytes!("../../resources/widgets/widget-keep-awake/index.html")),
    ("icon.svg", include_bytes!("../../resources/widgets/widget-keep-awake/icon.svg")),
];

fn verify_power_widget_files(root: &std::path::Path) -> Result<(), String> {
    verify_bundled_widget_files(root, &POWER_WIDGET_FILES, "power_untrusted_widget")
}

fn verify_bundled_widget_files(root: &std::path::Path, files: &[(&str, &[u8])], error: &str) -> Result<(), String> {
    let denied = || error.to_string();
    let metadata = std::fs::symlink_metadata(root).map_err(|_| denied())?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() { return Err(denied()); }
    let canonical = root.canonicalize().map_err(|_| denied())?;
    for &(name, expected) in files {
        let path = root.join(name);
        let metadata = std::fs::symlink_metadata(&path).map_err(|_| denied())?;
        if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() != expected.len() as u64 { return Err(denied()); }
        if !path.canonicalize().map_err(|_| denied())?.starts_with(&canonical) { return Err(denied()); }
        if std::fs::read(path).map_err(|_| denied())? != expected { return Err(denied()); }
    }
    Ok(())
}

/// Trust is established by the bundled bytes, never a user-controlled `type: official` label.
pub fn verify_power_widget(app: &tauri::AppHandle) -> Result<(), String> {
    verify_power_widget_files(&widgets_dir(app)?.join(crate::power::WIDGET_ID))
}

const CLIPBOARD_WIDGET_FILES: [(&str, &[u8]); 3] = [
    ("widget.json", include_bytes!("../../resources/widgets/widget-clipboard-note/widget.json")),
    ("index.html", include_bytes!("../../resources/widgets/widget-clipboard-note/index.html")),
    ("icon.svg", include_bytes!("../../resources/widgets/widget-clipboard-note/icon.svg")),
];

pub fn verify_clipboard_widget(app: &tauri::AppHandle) -> Result<(), String> {
    verify_bundled_widget_files(&widgets_dir(app)?.join(crate::clipboard::WIDGET_ID), &CLIPBOARD_WIDGET_FILES, "clipboard_untrusted_widget")
}

fn native_tool_files(id: &str) -> Result<[(&'static str, &'static [u8]); 3], String> {
    macro_rules! files { ($folder:literal) => { [
        ("widget.json", include_bytes!(concat!("../../resources/widgets/", $folder, "/widget.json")).as_slice()),
        ("index.html", include_bytes!(concat!("../../resources/widgets/", $folder, "/index.html")).as_slice()),
        ("icon.svg", include_bytes!(concat!("../../resources/widgets/", $folder, "/icon.svg")).as_slice()),
    ] }; }
    Ok(match id {
        "com.pinwall.music" => files!("widget-music"),
        "com.pinwall.hardware-tools" => files!("widget-hardware-tools"),
        "com.pinwall.display-tools" => files!("widget-display-tools"),
        "com.pinwall.maintenance" => files!("widget-maintenance"),
        "com.pinwall.video-tools" => files!("widget-video-tools"),
        "com.pinwall.input-tools" => files!("widget-input-tools"),
        "com.pinwall.window-tools" => files!("widget-window-tools"),
        "com.pinwall.local-tools" => files!("widget-local-tools"),
        "com.pinwall.file-shelf" => files!("widget-file-shelf"),
        "com.pinwall.screen-tools" => files!("widget-screen-tools"),
        "com.pinwall.ocr-note" => files!("widget-ocr-note"),
        "com.pinwall.image-tools" => files!("widget-image-tools"),
        "com.pinwall.clipboard-history" => files!("widget-clipboard-history"),
        _ => return Err("tool_permission_denied".into()),
    })
}

pub fn verify_native_tool(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let files = native_tool_files(id)?;
    verify_bundled_widget_files(&widgets_dir(app)?.join(id), &files, "tool_reinstall_required")
}

/// 读取 Widget 存储数据
#[tauri::command]
pub fn read_widget_storage(window: tauri::WebviewWindow, app: tauri::AppHandle, id: String) -> Result<HashMap<String, serde_json::Value>, String> {
    storage_path(&window, &app, &id).and_then(|path| crate::widget_repository::read(&path))
}
fn storage_path(window: &tauri::WebviewWindow, app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    crate::metrics::require_main(window.label())?; validate_widget_id(id)?;
    let root = widgets_dir(app)?;
    let manifest = read_manifest(&root.join(id))?;
    if manifest.id != id || !manifest.permissions.iter().any(|p| p == "storage") { return Err("widget_permission_denied".into()); }
    Ok(root.join(format!("{}_storage.json", id)))
}
#[tauri::command]
pub fn mutate_widget_storage(window: tauri::WebviewWindow, app: tauri::AppHandle, id: String, mutation: crate::widget_repository::Mutation) -> Result<(), String> {
    crate::widget_repository::mutate(&storage_path(&window, &app, &id)?, mutation)
}
#[tauri::command]
pub fn write_widget_storage(window: tauri::WebviewWindow, app: tauri::AppHandle, id: String, data: HashMap<String, serde_json::Value>) -> Result<(), String> {
    crate::widget_repository::replace(&storage_path(&window, &app, &id)?, data)
}

/// 获取系统信息（供 Widget system API 使用）
#[tauri::command]
pub async fn get_system_info(
    window: tauri::WebviewWindow,
    category: String,
    state: tauri::State<'_, crate::metrics::MetricsService>,
) -> Result<serde_json::Value, String> {
    crate::metrics::require_main(window.label())?;
    let service = state.inner().clone();
    // Platform queries run off the UI thread; all callers still share one sampler.
    tauri::async_runtime::spawn_blocking(move || system_info(&service, &category))
        .await.map_err(|_| "metrics_unavailable".to_string())?
}

fn system_info(state: &crate::metrics::MetricsService, category: &str) -> Result<serde_json::Value, String> {
    use crate::metrics::Reading;
    match category {
        "getMetrics" => serde_json::to_value(state.snapshot()?).map_err(|_| "metrics_unavailable".into()),
        "getCPUUsage" => match state.snapshot()?.cpu {
            Reading::Ok(value) => Ok(serde_json::json!(value)),
            Reading::WarmingUp => Err("metrics_warming_up".into()),
            _ => Err("metrics_unavailable".into()),
        },
        "getBattery" => match state.snapshot()?.battery {
            Reading::Ok(value) => Ok(serde_json::json!({ "level": value.level, "charging": value.charging })),
            Reading::NotPresent => Ok(serde_json::json!({ "level": -1, "charging": false })),
            _ => Err("metrics_unavailable".into()),
        },
        "getMemoryInfo" => match state.snapshot()?.memory {
            Reading::Ok(value) => Ok(serde_json::json!({ "total": value.total, "used": value.in_use, "free": value.total - value.in_use })),
            _ => Err("metrics_unavailable".into()),
        },
        "getMediaInfo" | "mediaControl" => Err("media_use_audio_tool".into()),
        _ => Err("metrics_unknown_method".into()),
    }
}

// ── 辅助函数 ──

#[cfg(test)]
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
    fn serialized_manifests_omit_absent_optional_fields_instead_of_invalid_nulls() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../resources/widgets/widget-local-tools");
        let manifest = read_manifest(&root).unwrap();
        let value = serde_json::to_value(manifest).unwrap();
        assert!(value.get("maxSize").is_none());
        assert!(value.get("settings").is_none());
        assert!(value.get("installedPath").is_none());
        assert_eq!(value["defaultEnabled"], false);
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
            let source = if is_desktop_widget(id) { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../resources/widgets").join(dir_name) } else { widgets_root.join(dir_name) };
            let manifest_content = std::fs::read_to_string(source.join("widget.json")).unwrap();
            let manifest: WidgetManifest = serde_json::from_str(&manifest_content).unwrap();
            validate_manifest(&manifest).unwrap();
            validate_manifest_files(&source, &manifest).unwrap();
        }
    }

    #[test]
    fn new_native_plugins_are_opt_in_and_clipboard_content_is_verified() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../resources/widgets");
        for id in [crate::clipboard::WIDGET_ID, "com.pinwall.system-monitor"] {
            let source = root.join(official_widget_dir_name(id).unwrap());
            let manifest: WidgetManifest = serde_json::from_slice(&std::fs::read(source.join("widget.json")).unwrap()).unwrap();
            validate_manifest(&manifest).unwrap();
            validate_manifest_files(&source, &manifest).unwrap();
            assert_eq!(manifest.id, id);
            assert_eq!(manifest.default_enabled, Some(false));
            assert!(is_desktop_widget(id));
            if id == crate::clipboard::WIDGET_ID {
                assert!(manifest.permissions.contains(&"clipboard".into()));
                assert!(!manifest.permissions.contains(&"cards".into()));
                verify_bundled_widget_files(&source, &CLIPBOARD_WIDGET_FILES, "denied").unwrap();
                let temp = std::env::temp_dir().join(format!("pinwall-clipboard-trust-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
                copy_dir_recursive(&source, &temp).unwrap();
                verify_bundled_widget_files(&temp, &CLIPBOARD_WIDGET_FILES, "denied").unwrap();
                // Same-length replacement cannot bypass byte verification.
                let mut bytes = std::fs::read(temp.join("index.html")).unwrap();
                bytes[0] ^= 1;
                std::fs::write(temp.join("index.html"), bytes).unwrap();
                assert!(verify_bundled_widget_files(&temp, &CLIPBOARD_WIDGET_FILES, "denied").is_err());
                std::fs::remove_dir_all(temp).unwrap();
            } else {
                assert!(manifest.permissions.contains(&"system".into()));
            }
        }
    }

    #[test]
    fn image_and_history_tools_require_opt_in_and_exact_bundled_bytes() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../resources/widgets");
        for (id, permission) in [(crate::hardware_tools::WIDGET_ID,"hardware"),(crate::display_tools::WIDGET_ID,"display"),(crate::maintenance::WIDGET_ID,"maintenance"),(crate::video_tools::WIDGET_ID,"video"),(crate::input_tools::WIDGET_ID,"input"), (crate::desktop_tools::AUDIO_ID,"audio"), (crate::desktop_tools::WINDOWS_ID,"windows"), (crate::utilities::WIDGET_ID, "utilities"), (crate::shelf::WIDGET_ID, "shelf"), (crate::screen_tools::WIDGET_ID, "screenCapture"), (crate::image_tools::OCR_ID, "ocr"), (crate::image_tools::IMAGE_ID, "images"), (crate::clipboard_history::WIDGET_ID, "clipboardHistory")] {
            let source = root.join(official_widget_dir_name(id).unwrap());
            let manifest: WidgetManifest = serde_json::from_slice(&std::fs::read(source.join("widget.json")).unwrap()).unwrap();
            validate_manifest(&manifest).unwrap();
            validate_manifest_files(&source, &manifest).unwrap();
            assert_eq!(manifest.id, id);
            assert_eq!(manifest.default_enabled, Some(false));
            assert_eq!(manifest.permissions, vec![permission.to_string(), "i18n".to_string()]);
            assert!(is_desktop_widget(id));
            let files = native_tool_files(id).unwrap();
            verify_bundled_widget_files(&source, &files, "denied").unwrap();
            let temp = std::env::temp_dir().join(format!("pinwall-tool-trust-{}-{}", std::process::id(), id));
            copy_dir_recursive(&source, &temp).unwrap();
            for name in ["widget.json", "index.html", "icon.svg"] {
                let original = std::fs::read(temp.join(name)).unwrap();
                let mut modified = original.clone(); modified[0] ^= 1;
                std::fs::write(temp.join(name), modified).unwrap();
                assert!(verify_bundled_widget_files(&temp, &files, "denied").is_err());
                std::fs::write(temp.join(name), original).unwrap();
            }
            std::fs::remove_dir_all(temp).unwrap();
        }
        assert!(native_tool_files("com.example.untrusted").is_err());
    }

    #[test]
    fn power_plugin_is_opt_in_and_only_exact_bundled_content_is_trusted() {
        let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../resources/widgets/widget-keep-awake");
        let manifest: WidgetManifest = serde_json::from_slice(&std::fs::read(source.join("widget.json")).unwrap()).unwrap();
        validate_manifest(&manifest).unwrap();
        assert_eq!(manifest.default_enabled, Some(false));
        assert!(manifest.permissions.contains(&"power".to_string()));
        verify_power_widget_files(&source).unwrap();
        let temp = std::env::temp_dir().join(format!("pinwall-power-trust-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        copy_dir_recursive(&source, &temp).unwrap();
        verify_power_widget_files(&temp).unwrap();
        std::fs::write(temp.join("index.html"), "<script>malicious()</script>").unwrap();
        assert!(verify_power_widget_files(&temp).is_err());
        std::fs::remove_dir_all(&temp).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn power_plugin_rejects_symlinked_files_and_directory() {
        let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../resources/widgets/widget-keep-awake");
        let temp = std::env::temp_dir().join(format!("pinwall-power-symlink-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        copy_dir_recursive(&source, &temp).unwrap();
        std::fs::remove_file(temp.join("index.html")).unwrap();
        std::os::unix::fs::symlink(source.join("index.html"), temp.join("index.html")).unwrap();
        assert!(verify_power_widget_files(&temp).is_err());
        let linked = temp.join("linked");
        std::os::unix::fs::symlink(source, &linked).unwrap();
        assert!(verify_power_widget_files(&linked).is_err());
        std::fs::remove_dir_all(temp).unwrap();
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
            default_enabled: None,
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

pub(crate) fn require_widget_permission(app: &tauri::AppHandle, id: &str, permission: &str) -> Result<(), String> {
    validate_widget_id(id)?;
    let manifest=read_manifest(&widgets_dir(app)?.join(id))?;
    if manifest.id!=id || !manifest.permissions.iter().any(|p|p==permission) { return Err("widget_permission_denied".into()); }
    Ok(())
}
