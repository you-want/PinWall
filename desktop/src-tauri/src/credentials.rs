//! Immutable Keychain bundles make settings commits safe without a cross-resource transaction.
use crate::persistence::{
    next_id, next_revision, read_settings, validate_settings, write_json, StorageResult,
};
use serde_json::{json, Value};
use std::{collections::BTreeMap, path::Path};

type Secrets = BTreeMap<String, String>;
pub(crate) trait Vault {
    fn get(&self, reference: &str) -> StorageResult<Vec<u8>>;
    fn set(&self, reference: &str, bytes: &[u8]) -> StorageResult<()>;
    fn delete(&self, reference: &str);
}
pub(crate) struct SystemVault;
#[cfg(target_os = "macos")]
const SERVICE: &str = "com.rain9.pinwall.credentials";
impl Vault for SystemVault {
    fn get(&self, reference: &str) -> StorageResult<Vec<u8>> {
        #[cfg(target_os = "macos")]
        {
            security_framework::passwords::get_generic_password(SERVICE, reference)
                .map_err(|_| "credentials_unavailable".into())
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = reference;
            Err("credentials_unsupported".into())
        }
    }
    fn set(&self, reference: &str, bytes: &[u8]) -> StorageResult<()> {
        #[cfg(target_os = "macos")]
        {
            security_framework::passwords::set_generic_password(SERVICE, reference, bytes)
                .map_err(|_| "credentials_unavailable".into())
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (reference, bytes);
            Err("credentials_unsupported".into())
        }
    }
    fn delete(&self, reference: &str) {
        #[cfg(target_os = "macos")]
        {
            let _ = security_framework::passwords::delete_generic_password(SERVICE, reference);
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = reference;
        }
    }
}

fn extract(data: &Value) -> Secrets {
    let mut secrets = Secrets::new();
    if let Some(key) = data["ai"]["apiKey"].as_str().filter(|key| !key.is_empty()) {
        secrets.insert("ai".into(), key.into());
    }
    if let Some(models) = data["quotaMonitor"]["models"].as_array() {
        for model in models {
            if let (Some(id), Some(key)) = (
                model["id"].as_str(),
                model["apiKey"].as_str().filter(|key| !key.is_empty()),
            ) {
                secrets.insert(format!("quota:{id}"), key.into());
            }
        }
    }
    secrets
}
fn hydrate(mut data: Value, secrets: &Secrets) -> Value {
    if data.get("ai").is_some() {
        data["ai"]["apiKey"] = json!(secrets.get("ai").cloned().unwrap_or_default());
    }
    if let Some(models) = data["quotaMonitor"]["models"].as_array_mut() {
        for model in models {
            let slot = format!("quota:{}", model["id"].as_str().unwrap_or_default());
            model["apiKey"] = json!(secrets.get(&slot).cloned().unwrap_or_default());
        }
    }
    data
}
fn reference(data: &Value) -> Option<&str> {
    data.get("credentialsRef").and_then(Value::as_str)
}
fn stored(data: &Value, vault: &impl Vault) -> StorageResult<Secrets> {
    match reference(data) {
        Some(reference) => serde_json::from_slice(&vault.get(reference)?)
            .map_err(|_| "credentials_unavailable".into()),
        None => Ok(Secrets::new()),
    }
}
fn public(mut data: Value, secrets: &Secrets) -> Value {
    data = hydrate(data, secrets);
    if let Some(object) = data.as_object_mut() {
        object.remove("credentialsRef");
    }
    data
}

fn commit_with<F>(
    path: &Path,
    current: &Value,
    mut desired: Value,
    vault: &impl Vault,
    commit: F,
) -> StorageResult<Value>
where
    F: FnOnce(&Path, &Value) -> StorageResult<()>,
{
    validate_settings(&desired)?;
    let revision = next_revision(current)?;
    let secrets = extract(&desired);
    let existing = stored(current, vault)?;
    desired = hydrate(desired, &Secrets::new());
    desired
        .as_object_mut()
        .ok_or("storage_corrupt")?
        .remove("credentialsRef");
    let mut created = None;
    if !secrets.is_empty() {
        let account = if secrets == existing {
            reference(current)
                .ok_or("credentials_unavailable")?
                .to_owned()
        } else {
            let time = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| "credentials_unavailable")?
                .as_nanos();
            let account = format!("credentials-{time}-{}-{}", std::process::id(), next_id());
            let bytes = serde_json::to_vec(&secrets).map_err(|_| "credentials_unavailable")?;
            vault.set(&account, &bytes)?;
            if vault.get(&account).map_or(true, |saved| saved != bytes) {
                vault.delete(&account);
                return Err("credentials_unavailable".into());
            }
            created = Some(account.clone());
            account
        };
        desired["credentialsRef"] = json!(account);
    }
    desired["schemaVersion"] = json!(2);
    desired["revision"] = json!(revision);
    if let Err(error) = commit(path, &desired) {
        if let Some(account) = created {
            vault.delete(&account);
        }
        return Err(error);
    }
    if reference(current) != reference(&desired) {
        if let Some(old) = reference(current) {
            vault.delete(old);
        }
    }
    Ok(public(desired, &secrets))
}

pub(crate) fn read_preferences(path: &Path) -> StorageResult<Value> {
    Ok(public(read_settings(path)?, &Secrets::new()))
}
pub(crate) fn read(path: &Path, vault: &impl Vault) -> StorageResult<Value> {
    let data = read_settings(path)?;
    let legacy = extract(&data);
    if !legacy.is_empty() {
        let mut combined = stored(&data, vault)?;
        combined.extend(legacy);
        return commit_with(
            path,
            &data,
            hydrate(data.clone(), &combined),
            vault,
            write_json,
        );
    }
    Ok(public(data.clone(), &stored(&data, vault)?))
}
pub(crate) fn compare_and_swap(
    path: &Path,
    expected: u64,
    desired: Value,
    vault: &impl Vault,
) -> StorageResult<Option<Value>> {
    let current = read_settings(path)?;
    if current["revision"].as_u64() != Some(expected) {
        return Ok(None);
    }
    commit_with(path, &current, desired, vault, write_json).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    #[derive(Default)]
    struct MemoryVault {
        entries: RefCell<BTreeMap<String, Vec<u8>>>,
        fail: bool,
        bad_readback: bool,
    }
    impl Vault for MemoryVault {
        fn get(&self, key: &str) -> StorageResult<Vec<u8>> {
            if self.bad_readback {
                return Ok(b"invalid".to_vec());
            }
            self.entries
                .borrow()
                .get(key)
                .cloned()
                .ok_or("credentials_unavailable".into())
        }
        fn set(&self, key: &str, bytes: &[u8]) -> StorageResult<()> {
            if self.fail {
                return Err("credentials_unavailable".into());
            }
            self.entries.borrow_mut().insert(key.into(), bytes.into());
            Ok(())
        }
        fn delete(&self, key: &str) {
            self.entries.borrow_mut().remove(key);
        }
    }
    fn legacy() -> Value {
        json!({"revision":0,"ai":{"enabled":true,"apiEndpoint":"https://example.com","apiKey":"ai-secret","model":"model"},"quotaMonitor":{"enabled":true,"refreshInterval":5,"models":[{"id":"a","name":"A","apiEndpoint":"https://example.com","apiKey":"quota-secret","model":"model"}]}})
    }
    fn dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "pinwall-vault-{}-{}",
            std::process::id(),
            next_id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }
    #[test]
    fn migrates_and_rehydrates_without_plaintext_on_disk() {
        let dir = dir();
        let path = dir.join("settings.json");
        let vault = MemoryVault::default();
        write_json(&path, &legacy()).unwrap();
        let hydrated = read(&path, &vault).unwrap();
        assert_eq!(hydrated["ai"]["apiKey"], "ai-secret");
        assert_eq!(
            hydrated["quotaMonitor"]["models"][0]["apiKey"],
            "quota-secret"
        );
        assert_eq!(hydrated["schemaVersion"], 2);
        assert!(hydrated.get("credentialsRef").is_none());
        let disk = std::fs::read_to_string(&path).unwrap();
        assert!(!disk.contains("ai-secret") && !disk.contains("quota-secret"));
        assert_eq!(read(&path, &vault).unwrap(), hydrated);
        assert_eq!(vault.entries.borrow().len(), 1);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn denied_keychain_access_preserves_legacy_data() {
        let dir = dir();
        let path = dir.join("settings.json");
        let vault = MemoryVault {
            fail: true,
            ..Default::default()
        };
        write_json(&path, &legacy()).unwrap();
        let before = std::fs::read(&path).unwrap();
        assert_eq!(read(&path, &vault).unwrap_err(), "credentials_unavailable");
        assert_eq!(std::fs::read(&path).unwrap(), before);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn failed_settings_commit_keeps_previous_keys_and_removes_uncommitted_bundle() {
        let dir = dir();
        let path = dir.join("settings.json");
        let vault = MemoryVault::default();
        write_json(&path, &legacy()).unwrap();
        let old = read(&path, &vault).unwrap();
        let current = read_settings(&path).unwrap();
        let mut changed = old.clone();
        changed["ai"]["apiKey"] = json!("replacement");
        assert!(commit_with(&path, &current, changed, &vault, |_, _| Err(
            "storage_write_failed".into()
        ))
        .is_err());
        assert_eq!(read(&path, &vault).unwrap(), old);
        assert_eq!(vault.entries.borrow().len(), 1);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn clearing_keys_and_removing_models_cleans_up_the_previous_bundle() {
        let dir = dir();
        let path = dir.join("settings.json");
        let vault = MemoryVault::default();
        write_json(&path, &legacy()).unwrap();
        let mut data = read(&path, &vault).unwrap();
        let revision = data["revision"].as_u64().unwrap();
        data["ai"]["apiKey"] = json!("");
        data["quotaMonitor"]["models"] = json!([]);
        assert!(compare_and_swap(&path, revision - 1, data.clone(), &vault)
            .unwrap()
            .is_none());
        compare_and_swap(&path, revision, data, &vault)
            .unwrap()
            .unwrap();
        assert!(vault.entries.borrow().is_empty());
        assert!(read_settings(&path)
            .unwrap()
            .get("credentialsRef")
            .is_none());
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn failed_vault_readback_preserves_plaintext_file_and_removes_new_bundle() {
        let dir = dir();
        let path = dir.join("settings.json");
        let vault = MemoryVault {
            bad_readback: true,
            ..Default::default()
        };
        write_json(&path, &legacy()).unwrap();
        let before = std::fs::read(&path).unwrap();
        assert_eq!(read(&path, &vault).unwrap_err(), "credentials_unavailable");
        assert_eq!(std::fs::read(&path).unwrap(), before);
        assert!(vault.entries.borrow().is_empty());
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn notification_preferences_never_access_the_vault_or_return_secrets() {
        let dir = dir();
        let path = dir.join("settings.json");
        write_json(&path, &legacy()).unwrap();
        let before = std::fs::read(&path).unwrap();
        let preferences = read_preferences(&path).unwrap();
        assert_eq!(preferences["ai"]["apiKey"], "");
        assert_eq!(preferences["quotaMonitor"]["models"][0]["apiKey"], "");
        assert_eq!(std::fs::read(&path).unwrap(), before);
        let vault = MemoryVault::default();
        read(&path, &vault).unwrap();
        vault.entries.borrow_mut().clear();
        assert_eq!(read(&path, &vault).unwrap_err(), "credentials_unavailable");
        assert!(read_preferences(&path)
            .unwrap()
            .get("credentialsRef")
            .is_none());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
