use crate::persistence::{
    authorize, merge_notes, migrate_card_state, next_revision, prepare_cards, read_bytes,
    write_json, StorageResult,
};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Emitter, Manager};

#[derive(Default)]
pub struct CardsStorage(Mutex<Repository>);
#[derive(Default)]
struct Repository {
    acknowledged: HashMap<String, u64>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CardPatch {
    creates: Vec<Value>,
    updates: Vec<CardUpdate>,
    deletes: Vec<String>,
    z_index: HashMap<String, Option<u64>>,
}
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct CardUpdate {
    id: String,
    changes: Map<String, Value>,
}

fn read_document(path: &Path) -> StorageResult<Value> {
    prepare_cards(path)?;
    let mut state = match read_bytes(path)? {
        Some(bytes) => {
            migrate_card_state(serde_json::from_slice(&bytes).map_err(|_| "storage_corrupt")?)?
        }
        None => json!({"schemaVersion":1,"cards":[],"zIndexMap":{}}),
    };
    if state.get("zIndexMap").is_none() {
        state["zIndexMap"] = json!({});
    }
    let revision = state
        .get("revision")
        .map_or(Ok(0), |v| v.as_u64().ok_or("storage_corrupt"))?;
    if revision >= 9_007_199_254_740_991 {
        return Err("storage_corrupt".into());
    }
    state["revision"] = json!(revision);
    Ok(state)
}

fn apply_patch(state: Value, patch: CardPatch) -> StorageResult<Value> {
    let mut state = migrate_card_state(state)?;
    let mut cards = state["cards"].as_array().ok_or("storage_corrupt")?.clone();
    cards.retain(|card| !patch.deletes.iter().any(|id| card["id"] == *id));
    for update in patch.updates {
        if update
            .changes
            .keys()
            .any(|key| key == "id" || !crate::persistence::CARD_FIELDS.contains(&key.as_str()))
        {
            return Err("storage_invalid_patch".into());
        }
        if let Some(card) = cards.iter_mut().find(|card| card["id"] == update.id) {
            for (key, value) in update.changes {
                card[key] = value;
            }
        }
    }
    for card in patch.creates {
        if !card.as_object().is_some_and(|object| {
            object
                .keys()
                .all(|key| crate::persistence::CARD_FIELDS.contains(&key.as_str()))
        }) {
            return Err("storage_invalid_patch".into());
        }
        if !cards.iter().any(|old| old["id"] == card["id"]) {
            cards.push(card);
        }
    }
    let layers = state["zIndexMap"]
        .as_object_mut()
        .ok_or("storage_corrupt")?;
    for (id, value) in patch.z_index {
        if let Some(value) = value {
            layers.insert(id, json!(value));
        } else {
            layers.remove(&id);
        }
    }
    for id in patch.deletes {
        layers.remove(&id);
    }
    state["cards"] = json!(cards);
    migrate_card_state(state)
}

impl Repository {
    fn patch_with<F>(
        &mut self,
        path: &Path,
        client: &str,
        mutation: u64,
        patch: CardPatch,
        commit: F,
    ) -> StorageResult<Value>
    where
        F: FnOnce(&Path, &Value) -> StorageResult<()>,
    {
        let current = read_document(path)?;
        if self
            .acknowledged
            .get(client)
            .is_some_and(|last| *last >= mutation)
        {
            return Ok(current);
        }
        let mut merged = apply_patch(current.clone(), patch)?;
        merged["revision"] = json!(next_revision(&current)?);
        commit(path, &merged)?;
        // Record only successful commits. A retry after a lost response is idempotent.
        self.acknowledged.insert(client.into(), mutation);
        Ok(merged)
    }
}

fn path(app: &tauri::AppHandle) -> StorageResult<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|_| "storage_unreadable")?
        .join("tauri-plugin-zustand")
        .join(if cfg!(debug_assertions) {
            "cards.dev.json"
        } else {
            "cards.json"
        }))
}
pub(crate) fn read_for_app(app: &tauri::AppHandle) -> StorageResult<Value> {
    let state = app.state::<CardsStorage>();
    let _guard = state.0.lock().map_err(|_| "storage_busy")?;
    read_document(&path(app)?)
}
pub(crate) fn restore_for_app(app: &tauri::AppHandle, cards: Vec<Value>) -> StorageResult<usize> {
    let state = app.state::<CardsStorage>();
    let _guard = state.0.lock().map_err(|_| "storage_busy")?;
    let path = path(app)?;
    let old = read_document(&path)?;
    let (mut merged, count) = merge_notes(old.clone(), cards)?;
    if count == 0 {
        return Ok(0);
    }
    merged["revision"] = json!(next_revision(&old)?);
    write_json(&path.with_extension("json.before-restore"), &old)?;
    write_json(&path, &merged)?;
    app.emit(
        "cards:committed",
        json!({"document":merged,"clientId":"restore","mutationId":""}),
    )
    .map_err(|_| "storage_restore_reload")?;
    Ok(count)
}

#[tauri::command]
pub fn cards_read(app: tauri::AppHandle, window: tauri::WebviewWindow) -> StorageResult<Value> {
    if !matches!(window.label(), "main" | "settings" | "notification") {
        return Err("storage_forbidden".into());
    }
    read_for_app(&app)
}
#[tauri::command]
pub fn cards_patch(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    patch: CardPatch,
    client_id: String,
    mutation_id: String,
) -> StorageResult<Value> {
    authorize(&window)?;
    if client_id.is_empty() || client_id.len() > 100 {
        return Err("storage_invalid_patch".into());
    }
    let mutation = mutation_id
        .parse::<u64>()
        .map_err(|_| "storage_invalid_patch")?;
    if mutation == 0 {
        return Err("storage_invalid_patch".into());
    }
    let state = app.state::<CardsStorage>();
    let mut guard = state.0.lock().map_err(|_| "storage_busy")?;
    let document = guard.patch_with(&path(&app)?, &client_id, mutation, patch, write_json)?;
    // The response acknowledges the durable commit even if a background window misses the event.
    let _ = app.emit(
        "cards:committed",
        json!({"document":document,"clientId":client_id,"mutationId":mutation_id}),
    );
    Ok(document)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn card(id: &str) -> Value {
        json!({"id":id,"title":"Title","content":"Body","x":10,"y":20,"collapsed":false,"colorIndex":0,"createdAt":1,"updatedAt":1})
    }
    fn patch(value: Value) -> CardPatch {
        serde_json::from_value(value).unwrap()
    }
    #[test]
    fn disjoint_changes_merge_and_deleted_cards_stay_deleted() {
        let state = migrate_card_state(json!({"cards":[card("a")],"zIndexMap":{}})).unwrap();
        let first = apply_patch(state, patch(json!({"creates":[],"updates":[{"id":"a","changes":{"x":77}}],"deletes":[],"zIndex":{}}))).unwrap();
        let second = apply_patch(first, patch(json!({"creates":[card("b")],"updates":[{"id":"a","changes":{"content":"Edit"}}],"deletes":[],"zIndex":{}}))).unwrap();
        assert_eq!(second["cards"][0]["x"], 77);
        assert_eq!(second["cards"][0]["content"], "Edit");
        let deleted = apply_patch(
            second,
            patch(json!({"creates":[],"updates":[],"deletes":["a"],"zIndex":{}})),
        )
        .unwrap();
        let stale = apply_patch(deleted.clone(), patch(json!({"creates":[],"updates":[{"id":"a","changes":{"content":"stale"}}],"deletes":[],"zIndex":{}}))).unwrap();
        assert_eq!(deleted, stale);
    }
    #[test]
    fn failed_commit_does_not_acknowledge_and_retry_does_not_repeat_success() {
        let dir =
            std::env::temp_dir().join(format!("pinwall-card-{}", crate::persistence::next_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("cards.json");
        let mut repository = Repository::default();
        let input = patch(json!({"creates":[card("a")],"updates":[],"deletes":[],"zIndex":{}}));
        assert!(repository
            .patch_with(&path, "window", 1, input.clone(), |_, _| Err(
                "storage_write_failed".into()
            ))
            .is_err());
        assert!(!path.exists());
        assert!(repository.acknowledged.is_empty());
        let saved = repository
            .patch_with(&path, "window", 1, input.clone(), write_json)
            .unwrap();
        let retried = repository
            .patch_with(&path, "window", 1, input, |_, _| panic!("duplicate commit"))
            .unwrap();
        assert_eq!(saved, retried);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
