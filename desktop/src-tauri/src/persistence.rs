//! Local storage boundaries. Errors are stable codes and never contain user data or paths.
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

pub(crate) type StorageResult<T> = Result<T, String>;
static STORAGE_LOCK: Mutex<()> = Mutex::new(());
static NEXT_ID: AtomicU64 = AtomicU64::new(0);
const MAX_BYTES: u64 = 20 * 1024 * 1024;
const VERSION: u64 = 1;

pub(crate) fn next_id() -> u64 {
    NEXT_ID.fetch_add(1, Ordering::Relaxed)
}
pub(crate) fn next_revision(data: &Value) -> StorageResult<u64> {
    data["revision"]
        .as_u64()
        .and_then(|n| n.checked_add(1))
        .filter(|n| *n < 9_007_199_254_740_991)
        .ok_or("storage_corrupt".into())
}
fn corrupt<T>() -> StorageResult<T> {
    Err("storage_corrupt".into())
}

fn check_version(data: &Value) -> StorageResult<()> {
    if !data.is_object() {
        return corrupt();
    }
    if let Some(value) = data.get("schemaVersion") {
        let version = value.as_u64().ok_or("storage_corrupt")?;
        if version > VERSION {
            return Err("storage_future_version".into());
        }
    }
    Ok(())
}

pub(crate) fn read_bytes(path: &Path) -> StorageResult<Option<Vec<u8>>> {
    let mut file = match fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("storage_unreadable".into()),
    };
    let mut bytes = Vec::new();
    (&mut file)
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "storage_unreadable")?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("storage_too_large".into());
    }
    Ok(Some(bytes))
}

fn backup_path(path: &Path) -> PathBuf {
    path.with_extension("json.corrupt-backup")
}

pub(crate) fn preserve_corrupt(path: &Path) -> StorageResult<()> {
    let backup = backup_path(path);
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    match options.open(&backup) {
        Ok(mut target) => {
            let result = (|| {
                let mut source = fs::File::open(path)?;
                std::io::copy(&mut source, &mut target)?;
                target.sync_all()
            })();
            if result.is_err() {
                let _ = fs::remove_file(&backup);
                return Err("storage_backup_failed".into());
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(_) => return Err("storage_backup_failed".into()),
    }
    Ok(())
}

/// Same-directory temporary file + fsync + rename. A failed write never truncates the destination.
fn atomic_write_with<F>(path: &Path, bytes: &[u8], replace: F) -> StorageResult<()>
where
    F: FnOnce(&Path, &Path) -> std::io::Result<()>,
{
    if fs::symlink_metadata(path).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
        return Err("storage_unsafe_path".into());
    }
    let parent = path.parent().ok_or("storage_unsafe_path")?;
    fs::create_dir_all(parent).map_err(|_| "storage_write_failed")?;
    let temporary = parent.join(format!(".pinwall-{}-{}.tmp", std::process::id(), next_id()));
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        replace(&temporary, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(|_| "storage_write_failed".into())
}

fn atomic_write(path: &Path, bytes: &[u8]) -> StorageResult<()> {
    atomic_write_with(path, bytes, |from, to| fs::rename(from, to))
}

pub(crate) fn write_json(path: &Path, data: &Value) -> StorageResult<()> {
    let bytes = serde_json::to_vec_pretty(data).map_err(|_| "storage_corrupt")?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("storage_too_large".into());
    }
    atomic_write(path, &bytes)
}

fn optional_fields(
    data: &Value,
    names: &[&str],
    predicate: fn(&Value) -> bool,
) -> StorageResult<()> {
    for name in names {
        if data.get(*name).is_some_and(|value| !predicate(value)) {
            return corrupt();
        }
    }
    Ok(())
}
fn finite(value: &Value) -> bool {
    value.as_f64().is_some_and(f64::is_finite)
}
fn nonnegative(value: &Value) -> bool {
    value.as_f64().is_some_and(|v| v.is_finite() && v >= 0.0)
}
fn clock(value: &Value) -> bool {
    value.as_str().is_some_and(|s| {
        let parts: Vec<_> = s.split(':').collect();
        parts.len() == 2
            && parts[0].len() == 2
            && parts[1].len() == 2
            && parts[0].parse::<u8>().is_ok_and(|v| v < 24)
            && parts[1].parse::<u8>().is_ok_and(|v| v < 60)
    })
}

pub(crate) fn validate_settings(data: &Value) -> StorageResult<()> {
    if !data.is_object() {
        return corrupt();
    }
    if let Some(version) = data.get("schemaVersion") {
        let version = version.as_u64().ok_or("storage_corrupt")?;
        if version > 2 {
            return Err("storage_future_version".into());
        }
    }
    optional_fields(data, &["credentialsRef"], |v| {
        v.as_str()
            .is_some_and(|s| s.starts_with("credentials-") && s.len() < 100)
    })?;
    optional_fields(data, &["revision"], |v| {
        v.as_u64().is_some_and(|n| n < 9_007_199_254_740_991)
    })?;
    optional_fields(
        data,
        &[
            "autoChangeEnabled",
            "launchOnStartup",
            "holidayEnabled",
            "holidayEnabledCn",
            "holidayEnabledIntl",
            "moodCheckinEnabled",
            "restReminderEnabled",
            "offWorkReminderEnabled",
            "eyeCareEnabled",
            "weatherCareEnabled",
            "autoCheckUpdates",
        ],
        Value::is_boolean,
    )?;
    optional_fields(
        data,
        &[
            "globalShortcut",
            "weatherCity",
            "lastDailyCardDate",
            "lastHolidayCardDate",
            "lastWeatherCardDate",
            "skippedVersion",
            "lastUpdatePromptedVersion",
        ],
        Value::is_string,
    )?;
    optional_fields(
        data,
        &[
            "autoChangeInterval",
            "restInterval",
            "eyeCareInterval",
            "hydrationGoal",
            "lastUpdateCheckAt",
        ],
        nonnegative,
    )?;
    optional_fields(data, &["opacity"], |v| {
        v.as_f64().is_some_and(|n| (0.0..=1.0).contains(&n))
    })?;
    optional_fields(data, &["currentImageId"], |v| v.is_null() || v.is_string())?;
    optional_fields(data, &["careTone"], |v| {
        matches!(v.as_str(), Some("warm" | "rational" | "playful"))
    })?;
    optional_fields(data, &["updateChannel"], |v| {
        matches!(v.as_str(), Some("stable" | "beta"))
    })?;
    optional_fields(data, &["offWorkTime"], clock)?;
    optional_fields(data, &["moodCheckinTimes"], |v| {
        v.as_array().is_some_and(|a| a.iter().all(clock))
    })?;
    if let Some(ai) = data.get("ai") {
        if !ai.is_object()
            || !ai["enabled"].is_boolean()
            || ["apiEndpoint", "apiKey", "model"]
                .iter()
                .any(|k| !ai[k].is_string())
        {
            return corrupt();
        }
    }
    if let Some(quota) = data.get("quotaMonitor") {
        if !quota.is_object()
            || !quota["enabled"].is_boolean()
            || !nonnegative(&quota["refreshInterval"])
        {
            return corrupt();
        }
        let models = quota["models"].as_array().ok_or("storage_corrupt")?;
        for model in models {
            if ["id", "name", "apiEndpoint", "apiKey", "model"]
                .iter()
                .any(|k| !model[k].is_string())
            {
                return corrupt();
            }
        }
    }
    if let Some(images) = data.get("backgroundImages") {
        for image in images.as_array().ok_or("storage_corrupt")? {
            if ["id", "path", "fileName"]
                .iter()
                .any(|k| !image[k].is_string())
                || !nonnegative(&image["createdAt"])
                || !image["isDefault"].is_boolean()
            {
                return corrupt();
            }
        }
    }
    Ok(())
}

pub(crate) fn read_settings(path: &Path) -> StorageResult<Value> {
    let Some(bytes) = read_bytes(path)? else {
        return Ok(json!({"schemaVersion":VERSION,"revision":0}));
    };
    let result = (|| {
        let mut data: Value = serde_json::from_slice(&bytes).map_err(|_| "storage_corrupt")?;
        validate_settings(&data)?;
        if data.get("revision").is_none() {
            data["revision"] = json!(0);
        }
        Ok(data)
    })();
    if result.as_ref().is_err_and(|e| e == "storage_corrupt") {
        preserve_corrupt(path)?;
    }
    result
}

/// Call under STORAGE_LOCK: revision check and durable commit are one native transaction.
#[cfg(test)]
fn compare_and_swap(path: &Path, expected: u64, mut data: Value) -> StorageResult<Option<Value>> {
    let current = read_settings(path)?;
    if current["revision"].as_u64() != Some(expected) {
        return Ok(None);
    }
    validate_settings(&data)?;
    data["schemaVersion"] = json!(VERSION);
    data["revision"] = json!(expected.checked_add(1).ok_or("storage_corrupt")?);
    validate_settings(&data)?;
    write_json(path, &data)?;
    if current.get("schemaVersion").and_then(Value::as_u64) != Some(VERSION) {
        eprintln!("[Storage:settings] Migrated schema to version 1");
    }
    Ok(Some(data))
}

// Only these card fields can enter a portable backup. No settings, keys or widget code.
pub(crate) const CARD_FIELDS: &[&str] = &[
    "id",
    "title",
    "content",
    "x",
    "y",
    "collapsed",
    "colorIndex",
    "createdAt",
    "updatedAt",
    "cardType",
    "reminderEnabled",
    "reminderTime",
    "reminderFired",
    "checkinDone",
    "lastCheckinDate",
    "systemKind",
    "hydrationCount",
    "hydrationGoal",
    "hydrationDate",
];

fn migrate_card(mut card: Value) -> StorageResult<Value> {
    if !card.is_object() {
        return corrupt();
    }
    for (key, default) in [
        ("reminderEnabled", json!(false)),
        ("reminderTime", Value::Null),
        ("reminderFired", json!(false)),
    ] {
        if card.get(key).is_none() {
            card[key] = default;
        }
    }
    if card.get("cardType").is_none() {
        card["cardType"] = json!(if card["reminderEnabled"] == true {
            "reminder"
        } else {
            "note"
        });
    }
    if card.get("checkinDone").is_none() {
        card["checkinDone"] = json!(false);
    }
    if card.get("lastCheckinDate").is_none() {
        card["lastCheckinDate"] = Value::Null;
    }
    if ["id", "title", "content"]
        .iter()
        .any(|k| !card[k].is_string())
        || card["id"].as_str().is_none_or(str::is_empty)
    {
        return corrupt();
    }
    if ["x", "y"].iter().any(|k| !finite(&card[k]))
        || ["createdAt", "updatedAt"]
            .iter()
            .any(|k| !nonnegative(&card[k]))
    {
        return corrupt();
    }
    if [
        "collapsed",
        "reminderEnabled",
        "reminderFired",
        "checkinDone",
    ]
    .iter()
    .any(|k| !card[k].is_boolean())
    {
        return corrupt();
    }
    if !card["colorIndex"].as_u64().is_some_and(|v| v < 8)
        || !(card["reminderTime"].is_null() || nonnegative(&card["reminderTime"]))
    {
        return corrupt();
    }
    if !(card["lastCheckinDate"].is_null() || card["lastCheckinDate"].is_string()) {
        return corrupt();
    }
    if !matches!(
        card["cardType"].as_str(),
        Some("note" | "reminder" | "daily-checkin" | "hydration" | "mood")
    ) {
        return corrupt();
    }
    optional_fields(&card, &["systemKind"], |v| {
        matches!(
            v.as_str(),
            Some("eye-care" | "rest" | "off-work" | "overtime" | "weather" | "mood-checkin")
        )
    })?;
    optional_fields(&card, &["hydrationCount", "hydrationGoal"], nonnegative)?;
    optional_fields(&card, &["hydrationDate"], Value::is_string)?;
    Ok(card)
}

pub(crate) fn migrate_card_state(mut state: Value) -> StorageResult<Value> {
    check_version(&state)?;
    optional_fields(&state, &["revision"], |v| {
        v.as_u64().is_some_and(|n| n < 9_007_199_254_740_991)
    })?;
    // A newly loaded plugin store has no keys until the first frontend mutation.
    if state.as_object().is_some_and(|object| object.is_empty()) {
        state = json!({"cards":[],"zIndexMap":{}});
    }
    let cards = state["cards"].as_array().ok_or("storage_corrupt")?;
    if cards.len() > 10_000 {
        return Err("storage_too_large".into());
    }
    let migrated: Vec<Value> = cards
        .iter()
        .cloned()
        .map(migrate_card)
        .collect::<StorageResult<_>>()?;
    let mut ids = HashSet::new();
    for card in &migrated {
        if !ids.insert(card["id"].as_str().ok_or("storage_corrupt")?) {
            return corrupt();
        }
    }
    if let Some(map) = state.get("zIndexMap") {
        if !map.as_object().is_some_and(|m| m.values().all(nonnegative)) {
            return corrupt();
        }
    }
    state["cards"] = json!(migrated);
    state["schemaVersion"] = json!(VERSION);
    Ok(state)
}

pub(crate) fn prepare_cards(path: &Path) -> StorageResult<()> {
    let Some(bytes) = read_bytes(path)? else {
        return Ok(());
    };
    let result = (|| {
        let original: Value = serde_json::from_slice(&bytes).map_err(|_| "storage_corrupt")?;
        let migrated = migrate_card_state(original.clone())?;
        if migrated != original {
            write_json(path, &migrated)?;
            eprintln!("[Storage:cards] Migrated schema to version 1");
        }
        Ok(())
    })();
    if result.as_ref().is_err_and(|e| e == "storage_corrupt") {
        preserve_corrupt(path)?;
    }
    result
}

pub(crate) fn make_note_backup(state: Value) -> StorageResult<Value> {
    let state = migrate_card_state(state)?;
    let cards: Vec<Value> = state["cards"]
        .as_array()
        .ok_or("storage_corrupt")?
        .iter()
        .map(|card| {
            let fields = CARD_FIELDS
                .iter()
                .filter_map(|key| card.get(*key).map(|value| ((*key).into(), value.clone())))
                .collect::<serde_json::Map<_, _>>();
            Value::Object(fields)
        })
        .collect();
    Ok(json!({"format":"pinwall-notes","schemaVersion":VERSION,"cards":cards}))
}

fn parse_note_backup(bytes: &[u8]) -> StorageResult<Vec<Value>> {
    if bytes.len() as u64 > MAX_BYTES {
        return Err("storage_too_large".into());
    }
    let data: Value = serde_json::from_slice(bytes).map_err(|_| "storage_invalid_backup")?;
    check_version(&data)?;
    if data["format"] != "pinwall-notes" || data["schemaVersion"] != VERSION {
        return Err("storage_invalid_backup".into());
    }
    let backup = make_note_backup(json!({"cards":data["cards"]}))?;
    Ok(backup["cards"]
        .as_array()
        .ok_or("storage_invalid_backup")?
        .clone())
}

pub(crate) fn merge_notes(state: Value, incoming: Vec<Value>) -> StorageResult<(Value, usize)> {
    let mut state = migrate_card_state(state)?;
    let incoming = make_note_backup(json!({"cards":incoming}))?;
    let mut cards = state["cards"].as_array().ok_or("storage_corrupt")?.clone();
    let mut ids: HashSet<String> = cards
        .iter()
        .filter_map(|c| c["id"].as_str().map(str::to_owned))
        .collect();
    let mut count = 0;
    for mut card in incoming["cards"]
        .as_array()
        .ok_or("storage_corrupt")?
        .clone()
    {
        if ids.insert(card["id"].as_str().ok_or("storage_corrupt")?.into()) {
            card["reminderEnabled"] = json!(false);
            card["reminderFired"] = json!(true);
            cards.push(card);
            count += 1;
        }
    }
    state["cards"] = json!(cards);
    Ok((migrate_card_state(state)?, count))
}

pub(crate) fn authorize(window: &tauri::WebviewWindow) -> StorageResult<()> {
    if matches!(window.label(), "main" | "settings") {
        Ok(())
    } else {
        Err("storage_forbidden".into())
    }
}

fn settings_path(app: &tauri::AppHandle) -> StorageResult<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|_| "storage_unreadable")?
        .join("pinwall-settings.json"))
}

#[tauri::command]
pub async fn settings_read(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> StorageResult<Value> {
    // Notifications also read preferences, but cannot mutate them.
    if !matches!(window.label(), "main" | "settings" | "notification") {
        return Err("storage_forbidden".into());
    }
    let preferences_only = window.label() == "notification";
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = STORAGE_LOCK.lock().map_err(|_| "storage_busy")?;
        let path = settings_path(&app)?;
        if preferences_only {
            crate::credentials::read_preferences(&path)
        } else {
            crate::credentials::read(&path, &crate::credentials::SystemVault)
        }
    })
    .await
    .map_err(|_| "storage_unreadable")?
}

#[tauri::command]
pub async fn settings_compare_and_swap(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    expected_revision: u64,
    data: Value,
) -> StorageResult<Option<Value>> {
    authorize(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let result = {
            let _lock = STORAGE_LOCK.lock().map_err(|_| "storage_busy")?;
            crate::credentials::compare_and_swap(
                &settings_path(&app)?,
                expected_revision,
                data,
                &crate::credentials::SystemVault,
            )?
        };
        if result.is_some() {
            let _ = app.emit("settings:changed", ());
        }
        Ok(result)
    })
    .await
    .map_err(|_| "storage_write_failed")?
}

#[tauri::command]
pub fn prepare_local_storage(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> StorageResult<()> {
    if !matches!(window.label(), "main" | "settings" | "notification") {
        return Err("storage_forbidden".into());
    }
    let _lock = STORAGE_LOCK.lock().map_err(|_| "storage_busy")?;
    read_settings(&settings_path(&app)?)?;
    crate::cards_storage::read_for_app(&app).map(|_| ())
}

fn selected_path(path: tauri_plugin_dialog::FilePath) -> StorageResult<PathBuf> {
    let path = path.into_path().map_err(|_| "storage_unsafe_path")?;
    if !path.is_absolute()
        || path
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("storage_unsafe_path".into());
    }
    if fs::symlink_metadata(&path).is_ok_and(|m| m.file_type().is_symlink()) {
        return Err("storage_unsafe_path".into());
    }
    let parent = path
        .parent()
        .ok_or("storage_unsafe_path")?
        .canonicalize()
        .map_err(|_| "storage_unsafe_path")?;
    Ok(parent.join(path.file_name().ok_or("storage_unsafe_path")?))
}

#[tauri::command]
pub async fn export_note_backup(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> StorageResult<bool> {
    authorize(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(selected) = app
            .dialog()
            .file()
            .add_filter("PinWall notes", &["json"])
            .set_file_name("pinwall-notes.json")
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = selected_path(selected)?;
        let app_data = app
            .path()
            .app_data_dir()
            .map_err(|_| "storage_unreadable")?;
        if app_data
            .canonicalize()
            .is_ok_and(|root| path.starts_with(root))
        {
            return Err("storage_unsafe_path".into());
        }
        let backup = make_note_backup(crate::cards_storage::read_for_app(&app)?)?;
        write_json(&path, &backup)?;
        Ok(true)
    })
    .await
    .map_err(|_| "storage_write_failed")?
}

#[tauri::command]
pub async fn read_note_backup(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> StorageResult<Option<Vec<Value>>> {
    authorize(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(selected) = app
            .dialog()
            .file()
            .add_filter("PinWall notes", &["json"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let bytes = read_bytes(&selected_path(selected)?)?.ok_or("storage_unreadable")?;
        Ok(Some(parse_note_backup(&bytes)?))
    })
    .await
    .map_err(|_| "storage_unreadable")?
}

#[tauri::command]
pub fn restore_note_backup(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    cards: Vec<Value>,
) -> StorageResult<usize> {
    authorize(&window)?;
    crate::cards_storage::restore_for_app(&app, cards)
}

#[cfg(test)]
#[path = "persistence_tests.rs"]
mod tests;
