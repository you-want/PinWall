use super::*;

#[test]
fn revisions_never_exceed_the_readable_javascript_integer_range() {
    assert_eq!(next_revision(&json!({"revision":0})).unwrap(), 1);
    assert!(next_revision(&json!({"revision":9_007_199_254_740_990u64})).is_err());
    assert!(next_revision(&json!({"revision":u64::MAX})).is_err());
}
use serde_json::json;

struct TempDir(PathBuf);
impl TempDir {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "pinwall-storage-test-{}-{}",
            std::process::id(),
            next_id()
        ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}
impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn card(id: &str) -> Value {
    json!({"id":id,"title":"title","content":"body","x":22,"y":33,"collapsed":false,
        "colorIndex":2,"createdAt":1,"updatedAt":2,"reminderEnabled":true,
        "reminderTime":123456,"reminderFired":false})
}

#[test]
fn missing_and_legacy_settings_are_supported() {
    let dir = TempDir::new();
    let path = dir.0.join("settings.json");
    assert_eq!(read_settings(&path).unwrap()["revision"], 0);
    fs::write(
        &path,
        r#"{"holidayEnabled":false,"globalShortcut":"Alt+Space"}"#,
    )
    .unwrap();
    let data = read_settings(&path).unwrap();
    assert_eq!(data["globalShortcut"], "Alt+Space");
    let saved = compare_and_swap(&path, 0, data).unwrap().unwrap();
    assert_eq!(saved["revision"], 1);
    assert_eq!(saved["schemaVersion"], 1);
}

#[test]
fn concurrent_disjoint_settings_changes_survive() {
    let dir = TempDir::new();
    let path = dir.0.join("settings.json");
    std::thread::scope(|scope| {
        for (key, value) in [("opacity", json!(0.4)), ("weatherCity", json!("city"))] {
            let path = &path;
            scope.spawn(move || loop {
                let mut data = {
                    let _lock = STORAGE_LOCK.lock().unwrap();
                    read_settings(path).unwrap()
                };
                let revision = data["revision"].as_u64().unwrap();
                data[key] = value.clone();
                let _lock = STORAGE_LOCK.lock().unwrap();
                if compare_and_swap(path, revision, data).unwrap().is_some() {
                    break;
                }
            });
        }
    });
    let data = read_settings(&path).unwrap();
    assert_eq!(data["opacity"], 0.4);
    assert_eq!(data["weatherCity"], "city");
    assert_eq!(data["revision"], 2);
}

#[test]
fn bad_settings_are_backed_up_once_and_never_overwritten() {
    for contents in ["broken JSON", r#"{"opacity":"bad"}"#] {
        let dir = TempDir::new();
        let path = dir.0.join("settings.json");
        fs::write(&path, contents).unwrap();
        assert_eq!(read_settings(&path).unwrap_err(), "storage_corrupt");
        assert!(read_settings(&path).is_err());
        assert!(compare_and_swap(&path, 0, json!({"opacity":0.5})).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), contents);
        assert_eq!(fs::read_to_string(backup_path(&path)).unwrap(), contents);
    }
}

#[test]
fn future_versions_stay_untouched() {
    let dir = TempDir::new();
    let path = dir.0.join("settings.json");
    let bytes = r#"{"schemaVersion":99,"opacity":0.5}"#;
    fs::write(&path, bytes).unwrap();
    assert_eq!(read_settings(&path).unwrap_err(), "storage_future_version");
    assert_eq!(fs::read_to_string(&path).unwrap(), bytes);
    assert!(!backup_path(&path).exists());
}

#[test]
fn failed_atomic_replace_keeps_original_and_cleans_temporary_file() {
    let dir = TempDir::new();
    let path = dir.0.join("settings.json");
    fs::write(&path, "original").unwrap();
    let error = atomic_write_with(&path, b"replacement", |_, _| {
        Err(std::io::Error::other("injected"))
    });
    assert!(error.is_err());
    assert_eq!(fs::read_to_string(&path).unwrap(), "original");
    assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 1);
}

#[test]
fn card_migration_preserves_layout_and_infers_type() {
    let state = migrate_card_state(json!({"cards":[card("a")],"zIndexMap":{"a":110}})).unwrap();
    assert_eq!(state["schemaVersion"], 1);
    assert_eq!(state["cards"][0]["cardType"], "reminder");
    assert_eq!(state["cards"][0]["x"], 22);
    assert_eq!(state["cards"][0]["checkinDone"], false);
    assert_eq!(state["zIndexMap"]["a"], 110);
}

#[test]
fn empty_plugin_state_and_pre_reminder_cards_are_supported() {
    assert_eq!(make_note_backup(json!({})).unwrap()["cards"], json!([]));
    let mut legacy = card("old");
    for key in ["reminderEnabled", "reminderTime", "reminderFired"] {
        legacy.as_object_mut().unwrap().remove(key);
    }
    let state = migrate_card_state(json!({"cards":[legacy]})).unwrap();
    assert_eq!(state["cards"][0]["cardType"], "note");
    assert_eq!(state["cards"][0]["reminderEnabled"], false);
    assert_eq!(state["cards"][0]["reminderTime"], Value::Null);
}

#[test]
fn malformed_and_duplicate_cards_are_rejected() {
    let mut invalid = card("b");
    invalid["x"] = json!("bad");
    assert!(migrate_card_state(json!({"cards":[invalid]})).is_err());
    assert!(migrate_card_state(json!({"cards":[card("a"),card("a")]})).is_err());
    assert!(migrate_card_state(json!({"schemaVersion":8,"cards":[]})).is_err());
    assert!(
        parse_note_backup(br#"{"format":"pinwall-notes","schemaVersion":8,"cards":[]}"#).is_err()
    );
}

#[test]
fn backup_allowlist_omits_settings_keys_and_unknown_card_fields() {
    let mut original = card("a");
    original["apiKey"] = json!("secret");
    let backup = make_note_backup(json!({"cards":[original],"ai":{"apiKey":"secret"}})).unwrap();
    let bytes = serde_json::to_vec(&backup).unwrap();
    assert!(!String::from_utf8_lossy(&bytes).contains("secret"));
    assert_eq!(parse_note_backup(&bytes).unwrap().len(), 1);
}

#[test]
fn restore_keeps_local_conflicts_and_disables_imported_reminders() {
    let existing = migrate_card_state(json!({"cards":[card("a")]})).unwrap();
    let (merged, count) = merge_notes(existing.clone(), vec![card("a"), card("b")]).unwrap();
    assert_eq!(count, 1);
    assert_eq!(merged["cards"][0], existing["cards"][0]);
    assert_eq!(merged["cards"][1]["reminderEnabled"], false);
    assert_eq!(merged["cards"][1]["reminderFired"], true);
    assert_eq!(merge_notes(merged.clone(), vec![card("b")]).unwrap().1, 0);
}

#[test]
fn unreadable_files_are_errors_and_symlink_writes_are_rejected() {
    let dir = TempDir::new();
    assert_eq!(read_settings(&dir.0).unwrap_err(), "storage_unreadable");
    #[cfg(unix)]
    {
        let target = dir.0.join("target");
        fs::write(&target, "private").unwrap();
        let link = dir.0.join("link");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        assert!(atomic_write(&link, b"bad").is_err());
        assert_eq!(fs::read_to_string(target).unwrap(), "private");
    }
}

#[test]
fn card_preflight_migrates_once_and_preserves_corrupt_files() {
    let dir = TempDir::new();
    let path = dir.0.join("cards.dev.json");
    fs::write(
        &path,
        serde_json::to_vec(&json!({"cards":[card("a")]})).unwrap(),
    )
    .unwrap();
    prepare_cards(&path).unwrap();
    let migrated = fs::read(&path).unwrap();
    assert_eq!(
        serde_json::from_slice::<Value>(&migrated).unwrap()["schemaVersion"],
        1
    );
    prepare_cards(&path).unwrap();
    assert_eq!(fs::read(&path).unwrap(), migrated);
    fs::write(&path, b"broken").unwrap();
    assert_eq!(prepare_cards(&path).unwrap_err(), "storage_corrupt");
    assert_eq!(fs::read(&path).unwrap(), b"broken");
    assert_eq!(fs::read(backup_path(&path)).unwrap(), b"broken");
}

#[test]
fn future_card_preflight_and_invalid_backups_do_not_modify_disk() {
    let dir = TempDir::new();
    let path = dir.0.join("cards.json");
    let contents = br#"{"schemaVersion":22,"cards":[]}"#;
    fs::write(&path, contents).unwrap();
    assert_eq!(prepare_cards(&path).unwrap_err(), "storage_future_version");
    assert_eq!(fs::read(&path).unwrap(), contents);
    assert!(!backup_path(&path).exists());
    for bytes in [
        b"invalid".as_slice(),
        br#"{"cards":[]}"#,
        br#"{"format":"pinwall-notes","schemaVersion":1,"cards":[{}]}"#,
    ] {
        assert!(parse_note_backup(bytes).is_err());
        assert_eq!(fs::read(&path).unwrap(), contents);
    }
}
