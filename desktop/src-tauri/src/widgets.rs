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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WidgetSize {
    pub width: f64,
    pub height: f64,
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
                Ok(manifest) => manifests.push(manifest),
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
    if !source.exists() {
        return Err("Source path does not exist".to_string());
    }

    // 读取并校验 manifest
    let manifest_path = source.join("widget.json");
    let manifest_content =
        std::fs::read_to_string(&manifest_path).map_err(|e| format!("Cannot read widget.json: {}", e))?;
    let manifest: WidgetManifest =
        serde_json::from_str(&manifest_content).map_err(|e| format!("Invalid widget.json: {}", e))?;

    // 目标目录
    let dest = widgets_dir(&app)?.join(&manifest.id);

    // 如果已存在则先删除（覆盖安装）
    if dest.exists() {
        std::fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
    }

    // 递归复制
    copy_dir_recursive(&source, &dest)?;

    Ok(manifest)
}

/// 卸载 Widget（删除 widgets/{id}/ 目录及其存储数据）
#[tauri::command]
pub fn uninstall_widget(app: tauri::AppHandle, id: String) -> Result<(), String> {
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
        if src_path.is_dir() {
            // 跳过 node_modules 和 .git
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str == "node_modules" || name_str == ".git" || name_str == "dist" && false {
                continue;
            }
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
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
