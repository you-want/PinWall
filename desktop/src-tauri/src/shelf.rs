//! Opt-in file references. Originals are never moved, deleted, executed, or copied on import.
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

pub const WIDGET_ID: &str = "com.pinwall.file-shelf";
const MAX_ENTRIES: usize = 50;
const MAX_FILE: u64 = 100 * 1024 * 1024;
const RETENTION: u64 = 7 * 24 * 60 * 60 * 1000;
fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|v| v.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Entry {
    id: String,
    path: PathBuf,
    name: String,
    added_at: u64,
    expires_at: u64,
    device: u64,
    inode: u64,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Index {
    schema_version: u32,
    entries: Vec<Entry>,
}
impl Default for Index {
    fn default() -> Self {
        Self {
            schema_version: 1,
            entries: Vec::new(),
        }
    }
}
impl Index {
    fn validate(&self) -> Result<(), String> {
        if self.schema_version > 1 {
            return Err("shelf_future_version".into());
        }
        if self.schema_version != 1 || self.entries.len() > MAX_ENTRIES {
            return Err("shelf_corrupt".into());
        }
        let mut ids = std::collections::HashSet::new();
        let mut paths = std::collections::HashSet::new();
        for entry in &self.entries {
            if !valid_id(&entry.id)
                || !ids.insert(&entry.id)
                || !paths.insert(&entry.path)
                || !entry.path.is_absolute()
                || entry.path.to_str().is_none_or(|v| v.len() > 4096)
                || entry
                    .path
                    .components()
                    .any(|p| matches!(p, std::path::Component::ParentDir))
                || entry.name.is_empty()
                || entry.name.len() > 1024
                || entry.expires_at != entry.added_at.saturating_add(RETENTION)
            {
                return Err("shelf_corrupt".into());
            }
        }
        Ok(())
    }
    fn prune(&mut self, now: u64) {
        self.entries.retain(|entry| entry.expires_at > now);
    }
    fn add(&mut self, paths: &[PathBuf], now: u64) -> (usize, usize) {
        self.prune(now);
        let mut added = 0;
        let mut skipped = 0;
        for path in paths.iter().take(MAX_ENTRIES + 1) {
            match selected_entry(path, now) {
                Ok(entry)
                    if !self.entries.iter().any(|e| e.path == entry.path)
                        && self.entries.len() < MAX_ENTRIES =>
                {
                    self.entries.insert(0, entry);
                    added += 1;
                }
                _ => skipped += 1,
            }
        }
        skipped += paths.len().saturating_sub(MAX_ENTRIES + 1);
        (added, skipped)
    }
}
fn valid_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 64 && value.bytes().all(|c| c.is_ascii_digit() || c == b'-')
}
fn identity(metadata: &fs::Metadata) -> (u64, u64) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        (metadata.dev(), metadata.ino())
    }
    #[cfg(not(unix))]
    {
        let _ = metadata;
        (0, 0)
    }
}
fn selected_entry(path: &Path, time: u64) -> Result<Entry, String> {
    if !path.is_absolute()
        || path
            .components()
            .any(|p| matches!(p, std::path::Component::ParentDir))
    {
        return Err("shelf_file_unavailable".into());
    }
    let metadata = fs::symlink_metadata(path).map_err(|_| "shelf_file_unavailable")?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > MAX_FILE {
        return Err("shelf_file_unavailable".into());
    }
    let path = path.canonicalize().map_err(|_| "shelf_file_unavailable")?;
    if path.to_str().is_none_or(|v| v.len() > 4096) {
        return Err("shelf_file_unavailable".into());
    }
    let name = path
        .file_name()
        .and_then(|v| v.to_str())
        .filter(|v| v.len() <= 1024)
        .ok_or("shelf_file_unavailable")?
        .to_string();
    let metadata = fs::metadata(&path).map_err(|_| "shelf_file_unavailable")?;
    let (device, inode) = identity(&metadata);
    Ok(Entry {
        id: format!(
            "{}-{}-{}",
            time,
            std::process::id(),
            crate::persistence::next_id()
        ),
        path,
        name,
        added_at: time,
        expires_at: time.saturating_add(RETENTION),
        device,
        inode,
    })
}
fn checked_file(entry: &Entry) -> Result<fs::File, String> {
    let metadata = fs::symlink_metadata(&entry.path).map_err(|_| "shelf_file_unavailable")?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || entry.path.canonicalize().map_or(true, |p| p != entry.path)
    {
        return Err("shelf_file_unavailable".into());
    }
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(target_os = "macos")]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let file = options
        .open(&entry.path)
        .map_err(|_| "shelf_file_unavailable")?;
    let metadata = file.metadata().map_err(|_| "shelf_file_unavailable")?;
    if !metadata.is_file()
        || metadata.len() > MAX_FILE
        || identity(&metadata) != (entry.device, entry.inode)
    {
        return Err("shelf_file_unavailable".into());
    }
    Ok(file)
}
fn load(path: &Path) -> Result<Index, String> {
    if !path.exists() && fs::symlink_metadata(path).is_err() {
        return Ok(Index::default());
    }
    let bytes = crate::tool_files::read_bounded(path, 1024 * 1024)?;
    let index = serde_json::from_slice::<serde_json::Value>(&bytes)
        .map_err(|_| "shelf_corrupt".to_string())
        .and_then(|value| {
            if value
                .get("schemaVersion")
                .and_then(|v| v.as_u64())
                .is_some_and(|v| v > 1)
            {
                return Err("shelf_future_version".into());
            }
            let index: Index = serde_json::from_value(value).map_err(|_| "shelf_corrupt")?;
            index.validate().map(|_| index)
        });
    if index.as_ref().is_err_and(|code| code == "shelf_corrupt") {
        crate::persistence::preserve_corrupt(path)?;
    }
    index
}
fn save(path: &Path, index: &Index) -> Result<(), String> {
    index.validate()?;
    crate::persistence::write_json(
        path,
        &serde_json::to_value(index).map_err(|_| "shelf_corrupt")?,
    )
}
fn index_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(crate::tool_files::storage_root(app)?.join("shelf.json"))
}

#[derive(Default)]
struct Lifecycle {
    active: bool,
    generation: u64,
}
#[derive(Default)]
pub struct ShelfService {
    state: Mutex<Lifecycle>,
    io: Mutex<()>,
}
impl ShelfService {
    pub fn deactivate(&self) -> Result<(), String> {
        let mut state = self.state.lock().map_err(|_| "tool_unavailable")?;
        state.active = false;
        state.generation += 1;
        Ok(())
    }
    fn is_current(&self, generation: u64) -> bool {
        self.state
            .lock()
            .is_ok_and(|s| s.active && s.generation == generation)
    }
    fn generation(&self) -> Result<u64, String> {
        let state = self.state.lock().map_err(|_| "tool_unavailable")?;
        if !state.active {
            return Err("tool_cancelled".into());
        }
        Ok(state.generation)
    }
    fn commit(
        &self,
        generation: u64,
        operation: impl FnOnce() -> Result<(), String>,
    ) -> Result<(), String> {
        let state = self.state.lock().map_err(|_| "tool_unavailable")?;
        if !state.active || state.generation != generation {
            return Err("tool_cancelled".into());
        }
        drop(state);
        operation()
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfItem {
    id: String,
    name: String,
    bytes: u64,
    added_at: u64,
    expires_at: u64,
    available: bool,
}
#[derive(Serialize)]
pub struct ShelfSnapshot {
    entries: Vec<ShelfItem>,
    added: usize,
    skipped: usize,
}
fn snapshot(index: &Index, added: usize, skipped: usize) -> ShelfSnapshot {
    ShelfSnapshot {
        entries: index
            .entries
            .iter()
            .map(|entry| {
                let metadata = checked_file(entry).ok().and_then(|f| f.metadata().ok());
                let available = metadata.is_some();
                let bytes = metadata.map(|v| v.len()).unwrap_or(0);
                ShelfItem {
                    id: entry.id.clone(),
                    name: entry.name.clone(),
                    bytes,
                    added_at: entry.added_at,
                    expires_at: entry.expires_at,
                    available,
                }
            })
            .collect(),
        added,
        skipped,
    }
}
#[derive(Deserialize)]
#[serde(tag = "method", rename_all = "camelCase", deny_unknown_fields)]
pub enum ShelfAction {
    Activate {},
    Status {},
    Add {},
    Remove { id: String },
    Clear {},
    Export { id: String },
    Reveal { id: String },
}

fn add_paths(
    app: &tauri::AppHandle,
    paths: &[PathBuf],
    generation: u64,
) -> Result<ShelfSnapshot, String> {
    let service = app.state::<ShelfService>();
    service.commit(generation, || Ok(()))?;
    let _io = service.io.try_lock().map_err(|_| "shelf_busy")?;
    let path = index_path(app)?;
    let mut index = load(&path)?;
    let (added, skipped) = index.add(paths, now());
    service.commit(generation, || save(&path, &index))?;
    Ok(snapshot(&index, added, skipped))
}

#[tauri::command]
pub async fn widget_shelf_request(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    action: ShelfAction,
) -> Result<ShelfSnapshot, String> {
    if window.label() != "main" {
        return Err("tool_permission_denied".into());
    }
    crate::widgets::verify_native_tool(&app, WIDGET_ID)?;
    let service = app.state::<ShelfService>();
    if matches!(action, ShelfAction::Activate {}) {
        let mut state = service.state.lock().map_err(|_| "tool_unavailable")?;
        state.active = true;
        state.generation += 1;
    }
    let generation = service.generation()?;
    tauri::async_runtime::spawn_blocking(move || {
        let service = app.state::<ShelfService>();
        service.commit(generation, || Ok(()))?;
        if matches!(action, ShelfAction::Add {}) {
            let files = app
                .dialog()
                .file()
                .blocking_pick_files()
                .unwrap_or_default();
            let paths: Result<Vec<_>, _> = files.into_iter().map(|v| v.into_path()).collect();
            return add_paths(&app, &paths.map_err(|_| "tool_unsafe_path")?, generation);
        }
        let _io = service.io.try_lock().map_err(|_| "shelf_busy")?;
        let path = index_path(&app)?;
        let mut index = match load(&path) {
            Err(code) if code == "shelf_corrupt" && matches!(action, ShelfAction::Clear {}) => {
                Index::default()
            }
            other => other?,
        };
        let old = index.entries.len();
        index.prune(now());
        let mut changed = old != index.entries.len();
        let reveal = matches!(&action, ShelfAction::Reveal { .. });
        let clear = matches!(&action, ShelfAction::Clear { .. });
        match action {
            ShelfAction::Remove { id } => {
                if !valid_id(&id) {
                    return Err("shelf_invalid_request".into());
                }
                index.entries.retain(|e| e.id != id);
                changed = true;
            }
            ShelfAction::Clear {} => {
                index.entries.clear();
                changed = true;
            }
            ShelfAction::Export { id } | ShelfAction::Reveal { id } => {
                let entry = index
                    .entries
                    .iter()
                    .find(|e| e.id == id)
                    .ok_or("shelf_file_unavailable")?;
                let file = checked_file(entry)?;
                if reveal {
                    service.commit(generation, || {
                        app.opener()
                            .reveal_item_in_dir(&entry.path)
                            .map_err(|_| "shelf_file_unavailable".into())
                    })?;
                } else {
                    let Some(out) = app
                        .dialog()
                        .file()
                        .set_file_name(&entry.name)
                        .blocking_save_file()
                    else {
                        return Ok(snapshot(&index, 0, 0));
                    };
                    let out = crate::tool_files::export_destination(
                        &app,
                        &out.into_path().map_err(|_| "tool_unsafe_path")?,
                    )?;
                    if index
                        .entries
                        .iter()
                        .any(|e| out == e.path || out.canonicalize().is_ok_and(|p| p == e.path))
                    {
                        return Err("image_source_protected".into());
                    }
                    service.commit(generation, || {
                        crate::tool_files::atomic_export_cancellable(&out, file, MAX_FILE, || {
                            !service.is_current(generation)
                        })
                        .map(|_| ())
                    })?;
                }
            }
            _ => {}
        }
        if changed {
            service.commit(generation, || {
                save(&path, &index)?;
                let backup = path.with_extension("json.corrupt-backup");
                if clear && fs::symlink_metadata(&backup).is_ok() {
                    fs::remove_file(backup).map_err(|_| "tool_io_failed")?;
                }
                Ok(())
            })?;
        }
        Ok(snapshot(&index, 0, 0))
    })
    .await
    .map_err(|_| "tool_unavailable".to_string())?
}

/// Drop paths originate in Tauri, never in a JS or iframe payload. Only an open Shelf accepts them.
pub fn on_native_drop(app: tauri::AppHandle, mut paths: Vec<PathBuf>) {
    let excess = paths.len().saturating_sub(MAX_ENTRIES + 1);
    paths.truncate(MAX_ENTRIES + 1);
    let Ok(generation) = app.state::<ShelfService>().generation() else {
        return;
    };
    tauri::async_runtime::spawn_blocking(move || {
        let result = crate::widgets::verify_native_tool(&app, WIDGET_ID)
            .and_then(|_| add_paths(&app, &paths, generation));
        if let Some(main) = app.get_webview_window("main") {
            let payload = match result {
                Ok(snapshot) => {
                    serde_json::json!({"added":snapshot.added,"skipped":snapshot.skipped + excess})
                }
                Err(_) => serde_json::json!({"error":"shelf_drop_failed"}),
            };
            if main.emit("pinwall:shelf-changed", payload).is_err() {
                eprintln!("[Shelf] Drop update delivery failed");
            }
        }
    });
}
pub fn uninstall(app: &tauri::AppHandle) -> Result<(), String> {
    let service = app.state::<ShelfService>();
    service.deactivate()?;
    let _io = service.io.try_lock().map_err(|_| "shelf_busy")?;
    let path = index_path(app)?;
    for file in [path.clone(), path.with_extension("json.corrupt-backup")] {
        if fs::symlink_metadata(&file).is_ok() {
            fs::remove_file(file).map_err(|_| "tool_io_failed")?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (PathBuf, PathBuf) {
        let root = std::env::temp_dir().join(format!(
            "pinwall-shelf-{}-{}",
            std::process::id(),
            crate::persistence::next_id()
        ));
        fs::create_dir_all(&root).unwrap();
        let file = root.join("fixture.txt");
        fs::write(&file, b"fixture").unwrap();
        (root, file)
    }
    #[test]
    fn references_are_deduplicated_expire_and_never_change_originals() {
        let (root, file) = fixture();
        let mut index = Index::default();
        assert_eq!(index.add(&[file.clone(), file.clone()], 1000), (1, 1));
        index.validate().unwrap();
        index.prune(1000 + RETENTION);
        assert!(index.entries.is_empty());
        assert_eq!(fs::read(&file).unwrap(), b"fixture");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn missing_replaced_symlinked_and_oversized_files_cannot_be_exported() {
        let (root, file) = fixture();
        let entry = selected_entry(&file, 1000).unwrap();
        assert!(checked_file(&entry).is_ok());
        let replacement = root.join("replacement");
        fs::write(&replacement, b"new").unwrap();
        fs::rename(&replacement, &file).unwrap();
        assert!(checked_file(&entry).is_err());
        #[cfg(unix)]
        {
            let link = root.join("link");
            std::os::unix::fs::symlink(&file, &link).unwrap();
            assert!(selected_entry(&link, 1000).is_err());
        }
        fs::OpenOptions::new()
            .write(true)
            .open(&file)
            .unwrap()
            .set_len(MAX_FILE + 1)
            .unwrap();
        assert!(selected_entry(&file, 1000).is_err());
        assert!(selected_entry(&root, 1000).is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn corrupted_index_is_preserved_and_future_version_stays_untouched() {
        let (root, _) = fixture();
        let path = root.join("shelf.json");
        fs::write(&path, b"broken").unwrap();
        assert!(matches!(load(&path),Err(code) if code=="shelf_corrupt"));
        assert_eq!(
            fs::read(path.with_extension("json.corrupt-backup")).unwrap(),
            b"broken"
        );
        let future = br#"{"schemaVersion":2,"entries":[]}"#;
        fs::write(&path, future).unwrap();
        assert!(matches!(load(&path),Err(code) if code=="shelf_future_version"));
        assert_eq!(fs::read(&path).unwrap(), future);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn closing_invalidates_pending_selection_without_erasing_saved_references() {
        let service = ShelfService::default();
        {
            let mut state = service.state.lock().unwrap();
            state.active = true;
            state.generation = 1;
        }
        service.deactivate().unwrap();
        let mut ran = false;
        assert!(service
            .commit(1, || {
                ran = true;
                Ok(())
            })
            .is_err());
        assert!(!ran);
    }
    #[test]
    fn malformed_requests_and_indexes_are_rejected() {
        assert!(serde_json::from_value::<ShelfAction>(
            serde_json::json!({"method":"add","paths":["/etc/passwd"]})
        )
        .is_err());
        let mut index = Index::default();
        for i in 0..=MAX_ENTRIES {
            index.entries.push(Entry {
                id: i.to_string(),
                path: PathBuf::from(format!("/fixture/{i}")),
                name: "fixture".into(),
                added_at: 1000,
                expires_at: 1000 + RETENTION,
                device: 0,
                inode: 0,
            });
        }
        assert!(index.validate().is_err());
    }
}
