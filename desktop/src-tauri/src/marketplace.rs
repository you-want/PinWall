//! Opt-in, two-signature marketplace. Neither publisher identity nor native authority comes from HTML.
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use ring::{digest, signature};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
const CATALOG_LIMIT: usize = 1024 * 1024;
const PACKAGE_LIMIT: usize = 8 * 1024 * 1024;
const PAYLOAD_LIMIT: usize = 6 * 1024 * 1024;
const FILE_LIMIT: usize = 2 * 1024 * 1024;
const TTL: u64 = 30 * 86400;
fn now() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .map_err(|_| "market_clock".into())
}
fn hash(bytes: &[u8]) -> String {
    digest::digest(&digest::SHA256, bytes)
        .as_ref()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    payload: String,
    signature: String,
}
fn verified<T: serde::de::DeserializeOwned>(
    bytes: &[u8],
    key: &str,
    limit: usize,
) -> Result<(T, String), String> {
    if bytes.len() > limit {
        return Err("market_limit".into());
    }
    let envelope: Envelope = serde_json::from_slice(bytes).map_err(|_| "market_invalid")?;
    let payload = B64.decode(envelope.payload).map_err(|_| "market_invalid")?;
    let sig = B64
        .decode(envelope.signature)
        .map_err(|_| "market_signature")?;
    let key = B64.decode(key).map_err(|_| "market_key")?;
    if key.len() != 32 || sig.len() != 64 {
        return Err("market_signature".into());
    }
    signature::UnparsedPublicKey::new(&signature::ED25519, &key)
        .verify(&payload, &sig)
        .map_err(|_| "market_signature")?;
    let data = serde_json::from_slice(&payload).map_err(|_| "market_invalid")?;
    Ok((data, hash(&payload)))
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Config {
    enabled: bool,
    catalog_url: String,
    root_key: String,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            enabled: false,
            catalog_url: String::new(),
            root_key: String::new(),
        }
    }
}
impl Config {
    fn validate(&self) -> Result<(), String> {
        if self.catalog_url.len() > 8192 || self.root_key.len() > 44 {
            return Err("market_invalid".into());
        }
        if !self.enabled {
            return Ok(());
        }
        crate::widget_network::market_url(&self.catalog_url)?;
        if B64.decode(&self.root_key).map_err(|_| "market_key")?.len() != 32 {
            return Err("market_key".into());
        }
        Ok(())
    }
    fn identity(&self) -> String {
        hash(self.root_key.as_bytes())
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Publisher {
    id: String,
    key: String,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Entry {
    id: String,
    version: String,
    name: String,
    description: String,
    publisher: String,
    permissions: Vec<String>,
    package_url: String,
    sha256: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Catalog {
    schema_version: u32,
    revision: u64,
    issued_at: u64,
    expires_at: u64,
    publishers: Vec<Publisher>,
    entries: Vec<Entry>,
}
impl Catalog {
    fn validate(&self, time: u64) -> Result<(), String> {
        if self.schema_version != 1
            || self.revision == 0
            || self.revision > 9_007_199_254_740_991
            || self.issued_at > time.saturating_add(300)
            || self.expires_at <= time
            || self.expires_at <= self.issued_at
            || self.expires_at - self.issued_at > TTL
        {
            return Err("market_expired".into());
        }
        if self.entries.len() > 100 || self.publishers.len() > 100 {
            return Err("market_limit".into());
        }
        let mut publishers = HashSet::new();
        let mut ids = HashSet::new();
        for p in &self.publishers {
            if !identifier(&p.id, 80)
                || !publishers.insert(&p.id)
                || B64.decode(&p.key).map_err(|_| "market_key")?.len() != 32
            {
                return Err("market_invalid".into());
            }
        }
        for e in &self.entries {
            crate::widgets::validate_widget_id(&e.id)?;
            if e.id.starts_with("com.pinwall.")
                || !ids.insert(&e.id)
                || !publishers.contains(&e.publisher)
                || !version(&e.version)
                || e.name.is_empty()
                || e.name.len() > 256
                || e.description.len() > 2048
                || e.sha256.len() != 64
                || !e
                    .sha256
                    .bytes()
                    .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
                || e.permissions.len() > 24
            {
                return Err("market_invalid".into());
            }
            let mut permissions = HashSet::new();
            for p in &e.permissions {
                if !matches!(
                    p.as_str(),
                    "storage"
                        | "theme"
                        | "notify"
                        | "cards"
                        | "events"
                        | "app"
                        | "network"
                        | "i18n"
                ) || !permissions.insert(p)
                {
                    return Err("market_permission".into());
                }
            }
            crate::widget_network::market_url(&e.package_url)?;
        }
        Ok(())
    }
    fn publisher(&self, e: &Entry) -> Result<&str, String> {
        self.publishers
            .iter()
            .find(|p| p.id == e.publisher)
            .map(|p| p.key.as_str())
            .ok_or("market_invalid".into())
    }
}
fn identifier(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
}
fn version(value: &str) -> bool {
    identifier(value, 64) && value.bytes().next().is_some_and(|b| b.is_ascii_digit())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Package {
    schema_version: u32,
    id: String,
    version: String,
    files: Vec<PackageFile>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PackageFile {
    path: String,
    data: String,
}
fn file_path(path: &str) -> bool {
    let parts = path.split('/').collect::<Vec<_>>();
    !parts.is_empty()
        && parts.len() <= 8
        && path.len() <= 240
        && parts.iter().all(|p| {
            !p.is_empty()
                && !p.starts_with('.')
                && p.len() <= 80
                && p.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
        })
        && path.rsplit('.').next().is_some_and(|ext| {
            matches!(
                ext,
                "json"
                    | "html"
                    | "js"
                    | "css"
                    | "svg"
                    | "png"
                    | "jpg"
                    | "jpeg"
                    | "webp"
                    | "woff"
                    | "woff2"
            )
        })
}
fn unpack(
    bytes: &[u8],
    entry: &Entry,
    key: &str,
) -> Result<(crate::widgets::WidgetManifest, Vec<(String, Vec<u8>)>), String> {
    if hash(bytes) != entry.sha256 {
        return Err("market_digest".into());
    }
    let (package, _): (Package, _) = verified(bytes, key, PACKAGE_LIMIT)?;
    if package.schema_version != 1
        || package.id != entry.id
        || package.version != entry.version
        || package.files.is_empty()
        || package.files.len() > 128
    {
        return Err("market_invalid".into());
    }
    let mut paths = HashSet::new();
    let mut total = 0;
    let mut files = Vec::new();
    for file in package.files {
        if !file_path(&file.path) || !paths.insert(file.path.to_ascii_lowercase()) {
            return Err("market_path".into());
        }
        let data = B64.decode(file.data).map_err(|_| "market_invalid")?;
        total += data.len();
        if data.len() > FILE_LIMIT || total > PAYLOAD_LIMIT {
            return Err("market_limit".into());
        }
        files.push((file.path, data));
    }
    // Files must not also be parents of another file (including case insensitive filesystems).
    for path in &paths {
        let parts = path.split('/').collect::<Vec<_>>();
        for n in 1..parts.len() {
            if paths.contains(&parts[..n].join("/")) {
                return Err("market_path".into());
            }
        }
    }
    let manifest = files
        .iter()
        .find(|(p, _)| p == "widget.json")
        .ok_or("market_manifest")?;
    if manifest.1.len() > 64 * 1024 {
        return Err("market_limit".into());
    }
    let manifest: crate::widgets::WidgetManifest =
        serde_json::from_slice(&manifest.1).map_err(|_| "market_manifest")?;
    crate::widgets::validate_manifest(&manifest)?;
    if manifest.id != entry.id
        || manifest.version != entry.version
        || manifest.name != entry.name
        || manifest.description != entry.description
        || manifest.permissions != entry.permissions
        || manifest.widget_type != "community"
        || manifest.default_enabled != Some(false)
        || manifest.installed_path.is_some()
        || !files.iter().any(|(p, _)| p == &manifest.entry)
        || !files.iter().any(|(p, _)| p == &manifest.icon)
    {
        return Err("market_manifest".into());
    }
    Ok((manifest, files))
}
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Trust {
    config: Config,
    watermarks: HashMap<String, Watermark>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Watermark {
    revision: u64,
    digest: String,
}
fn trust_from(data: &HashMap<String, Value>) -> Result<Trust, String> {
    match data.get("trust") {
        Some(v) => serde_json::from_value(v.clone()).map_err(|_| "market_storage".into()),
        None => Ok(Trust::default()),
    }
}
fn read_trust(path: &Path) -> Result<Trust, String> {
    trust_from(&crate::widget_repository::read(path)?)
}
fn save_config(path: &Path, config: Config) -> Result<(), String> {
    config.validate()?;
    crate::widget_repository::transaction(path, |data| {
        let mut trust = trust_from(data)?;
        trust.config = config;
        data.insert(
            "trust".into(),
            serde_json::to_value(trust).map_err(|_| "market_storage")?,
        );
        Ok(())
    })
}
fn accept_catalog(
    path: &Path,
    config: &Config,
    catalog: &Catalog,
    digest: &str,
) -> Result<(), String> {
    catalog.validate(now()?)?;
    crate::widget_repository::transaction(path, |data| {
        let mut trust = trust_from(data)?;
        if &trust.config != config || !config.enabled {
            return Err("market_changed".into());
        }
        let identity = config.identity();
        if let Some(previous) = trust.watermarks.get(&identity) {
            if catalog.revision < previous.revision
                || catalog.revision == previous.revision && digest != previous.digest
            {
                return Err("market_rollback".into());
            }
        }
        if trust.watermarks.len() >= 32 && !trust.watermarks.contains_key(&identity) {
            return Err("market_limit".into());
        }
        trust.watermarks.insert(
            identity,
            Watermark {
                revision: catalog.revision,
                digest: digest.into(),
            },
        );
        data.insert(
            "trust".into(),
            serde_json::to_value(trust).map_err(|_| "market_storage")?,
        );
        Ok(())
    })
}
struct Preview {
    token: String,
    bytes: Vec<u8>,
    entry: Entry,
    config: Config,
    created: u64,
}
#[derive(Default)]
struct Inner {
    cancel: Option<tokio::sync::oneshot::Sender<()>>,
    preview: Option<Preview>,
    epoch: u64,
}
#[derive(Clone, Default)]
pub struct MarketService {
    inner: Arc<Mutex<Inner>>,
    operation: Arc<tokio::sync::Mutex<()>>,
}
impl MarketService {
    pub fn clear(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|_| "market_busy")?;
        inner.epoch = inner.epoch.wrapping_add(1);
        inner.preview = None;
        if let Some(cancel) = inner.cancel.take() {
            let _ = cancel.send(());
        }
        Ok(())
    }
    fn check(&self, epoch: u64) -> Result<std::sync::MutexGuard<'_, Inner>, String> {
        let inner = self.inner.lock().map_err(|_| "market_busy")?;
        if inner.epoch != epoch {
            return Err("market_cancelled".into());
        }
        Ok(inner)
    }
}
#[derive(Deserialize)]
#[serde(tag = "method", rename_all = "camelCase", deny_unknown_fields)]
pub enum Action {
    Config {},
    Configure { config: Config },
    Refresh {},
    Prepare { id: String, version: String },
    Install { token: String },
    Cancel {},
}
async fn catalog(path: &Path, config: &Config) -> Result<Catalog, String> {
    if !config.enabled {
        return Err("market_disabled".into());
    }
    config.validate()?;
    let bytes = crate::widget_network::market_download(&config.catalog_url, CATALOG_LIMIT).await?;
    let (catalog, digest): (Catalog, _) = verified(&bytes, &config.root_key, CATALOG_LIMIT)?;
    accept_catalog(path, config, &catalog, &digest)?;
    Ok(catalog)
}
struct Stage(PathBuf);
impl Drop for Stage {
    fn drop(&mut self) {
        if fs::remove_dir_all(&self.0).is_err() {
            eprintln!("[Marketplace] Staging cleanup failed");
        }
    }
}
fn materialize(root: &Path, files: Vec<(String, Vec<u8>)>) -> Result<Stage, String> {
    let name = format!(
        ".stage-{}-{}",
        std::process::id(),
        crate::persistence::next_id()
    );
    let stage = Stage(crate::tool_files::private_dir(root, &name)?);
    for (path, bytes) in files {
        let parts = path.split('/').collect::<Vec<_>>();
        let mut parent = stage.0.clone();
        for part in &parts[..parts.len() - 1] {
            parent = crate::tool_files::private_dir(&parent, part)?;
        }
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        use std::io::Write;
        let mut file = options
            .open(parent.join(parts[parts.len() - 1]))
            .map_err(|_| "market_storage")?;
        file.write_all(&bytes).map_err(|_| "market_storage")?;
        file.sync_all().map_err(|_| "market_storage")?;
    }
    Ok(stage)
}
fn storage(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(crate::tool_files::storage_root(app)?.join("marketplace.json"))
}
#[tauri::command]
pub async fn marketplace_request(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    action: Action,
) -> Result<Value, String> {
    if !matches!(window.label(), "main" | "settings") {
        return Err("widget_permission_denied".into());
    }
    let state = app.state::<MarketService>().inner().clone();
    let path = storage(&app)?;
    match action {
        Action::Config {} => return Ok(json!({"config":read_trust(&path)?.config})),
        Action::Cancel {} => {
            state.clear()?;
            return Ok(json!({"cancelled":true}));
        }
        Action::Configure { config } => {
            state.clear()?;
            let _guard = state.inner.lock().map_err(|_| "market_busy")?;
            save_config(&path, config.clone())?;
            return Ok(json!({"config":config}));
        }
        _ => {}
    }
    let _operation = state.operation.try_lock().map_err(|_| "market_busy")?;
    let config = read_trust(&path)?.config;
    let (send, receive) = tokio::sync::oneshot::channel();
    let epoch = {
        let mut inner = state.inner.lock().map_err(|_| "market_busy")?;
        inner.cancel = Some(send);
        inner.epoch
    };
    let work = async {
        match action {
            Action::Refresh {} => {
                let catalog = catalog(&path, &config).await?;
                let mut inner = state.check(epoch)?;
                inner.preview = None;
                Ok(
                    json!({"entries":catalog.entries,"revision":catalog.revision,"expiresAt":catalog.expires_at}),
                )
            }
            Action::Prepare { id, version } => {
                let catalog = catalog(&path, &config).await?;
                state.check(epoch)?.preview = None;
                let entry = catalog
                    .entries
                    .iter()
                    .find(|e| e.id == id && e.version == version)
                    .ok_or("market_changed")?
                    .clone();
                let bytes =
                    crate::widget_network::market_download(&entry.package_url, PACKAGE_LIMIT)
                        .await?;
                let (manifest, _) = unpack(&bytes, &entry, catalog.publisher(&entry)?)?;
                let token = format!(
                    "{:x}-{:x}-{:x}",
                    std::process::id(),
                    now()?,
                    crate::persistence::next_id()
                );
                state.check(epoch)?.preview = Some(Preview {
                    token: token.clone(),
                    bytes,
                    entry,
                    config: config.clone(),
                    created: now()?,
                });
                Ok(json!({"token":token,"manifest":manifest}))
            }
            Action::Install { token } => {
                let preview = state
                    .check(epoch)?
                    .preview
                    .take()
                    .filter(|p| {
                        p.token == token
                            && p.config == config
                            && now().is_ok_and(|n| n >= p.created && n - p.created <= 120)
                    })
                    .ok_or("market_changed")?;
                // Refresh again: a package removed or re-signed since review must be reviewed again.
                let catalog = catalog(&path, &config).await?;
                let entry = catalog
                    .entries
                    .iter()
                    .find(|e| **e == preview.entry)
                    .ok_or("market_changed")?;
                let (manifest, files) = unpack(&preview.bytes, entry, catalog.publisher(entry)?)?;
                let work_state = state.clone();
                let work_app = app.clone();
                let work_path = path.clone();
                let work_config = config.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    // Serialize revocation against the actual commit, not only the download.
                    let _guard = work_state.check(epoch)?;
                    let installed = crate::widget_repository::with_snapshot(&work_path, |data| {
                        let trust = trust_from(data)?;
                        let watermark = trust
                            .watermarks
                            .get(&work_config.identity())
                            .ok_or("market_changed")?;
                        if trust.config != work_config || watermark.revision != catalog.revision {
                            return Err("market_changed".into());
                        }
                        catalog.validate(now()?)?;
                        let root = crate::tool_files::private_dir(
                            &crate::tool_files::storage_root(&work_app)?,
                            "market-staging",
                        )?;
                        crate::widget_repository::cleanup_staging(&root)?;
                            let stage = materialize(&root, files)?;
                        crate::widgets::install_checked(
                            &work_app,
                            stage.0.clone(),
                            Some((&manifest.id, &manifest.version, &manifest.permissions)),
                        )
                    })?;
                    Ok(json!({"manifest":installed}))
                })
                .await
                .map_err(|_| "market_storage".to_string())?
            }
            _ => Err("market_invalid".into()),
        }
    };
    let result = tokio::select! {result=work=>result,_=receive=>Err("market_cancelled".into())};
    if let Ok(mut inner) = state.inner.lock() {
        if inner.epoch == epoch {
            inner.cancel = None;
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use ring::{
        rand::SystemRandom,
        signature::{Ed25519KeyPair, KeyPair},
    };
    fn keys() -> Ed25519KeyPair {
        let doc = Ed25519KeyPair::generate_pkcs8(&SystemRandom::new()).unwrap();
        Ed25519KeyPair::from_pkcs8(doc.as_ref()).unwrap()
    }
    fn signed(value: &Value, key: &Ed25519KeyPair) -> Vec<u8> {
        let bytes = serde_json::to_vec(value).unwrap();
        serde_json::to_vec(&json!({"payload":B64.encode(&bytes),"signature":B64.encode(key.sign(&bytes).as_ref())})).unwrap()
    }
    fn fixture() -> (Ed25519KeyPair, Value, Entry) {
        let key = keys();
        let manifest = json!({"id":"org.example.notes","version":"1.0.0","name":"Notes","description":"Reviewed offline widget","author":"Example","type":"community","category":"utility","permissions":["storage"],"entry":"index.html","icon":"icon.svg","defaultEnabled":false,"defaultSize":{"width":240,"height":160}});
        let package = json!({"schemaVersion":1,"id":"org.example.notes","version":"1.0.0","files":[{"path":"widget.json","data":B64.encode(serde_json::to_vec(&manifest).unwrap())},{"path":"index.html","data":B64.encode(b"<p>Local</p>")},{"path":"icon.svg","data":B64.encode(b"<svg/>")}]});
        let entry = Entry {
            id: "org.example.notes".into(),
            version: "1.0.0".into(),
            name: "Notes".into(),
            description: "Reviewed offline widget".into(),
            publisher: "example".into(),
            permissions: vec!["storage".into()],
            package_url: "https://example.com/packages/test.pwx".into(),
            sha256: hash(&signed(&package, &key)),
        };
        (key, package, entry)
    }
    fn cat(key: &Ed25519KeyPair, entry: Entry, time: u64) -> Catalog {
        Catalog {
            schema_version: 1,
            revision: 1,
            issued_at: time,
            expires_at: time + 3600,
            publishers: vec![Publisher {
                id: "example".into(),
                key: B64.encode(key.public_key().as_ref()),
            }],
            entries: vec![entry],
        }
    }
    #[test]
    fn node_generated_fixture_verifies_with_independent_root_and_publisher_keys() {
        let fixture: Value =
            serde_json::from_str(include_str!("../tests/fixtures/market-interop.json")).unwrap();
        let bytes = serde_json::to_vec(&fixture["catalog"]).unwrap();
        let (catalog, _): (Catalog, _) =
            verified(&bytes, fixture["root"].as_str().unwrap(), CATALOG_LIMIT).unwrap();
        catalog.validate(1_800_000_100).unwrap();
        let entry = &catalog.entries[0];
        let bytes = serde_json::to_vec(&fixture["package"]).unwrap();
        // The digest binds the distributed JSON bytes, including key order. Node emits payload then signature.
        let envelope: Envelope = serde_json::from_value(fixture["package"].clone()).unwrap();
        let exact = format!(
            "{{\"payload\":\"{}\",\"signature\":\"{}\"}}",
            envelope.payload, envelope.signature
        );
        assert_eq!(hash(exact.as_bytes()), entry.sha256);
        assert!(unpack(exact.as_bytes(), entry, catalog.publisher(entry).unwrap()).is_ok());
        assert!(
            verified::<Package>(&bytes, fixture["root"].as_str().unwrap(), PACKAGE_LIMIT).is_err()
        );
    }
    #[test]
    fn signatures_bind_exact_bytes_publisher_and_reviewed_manifest() {
        let (key, mut package, mut entry) = fixture();
        let public = B64.encode(key.public_key().as_ref());
        let bytes = signed(&package, &key);
        assert!(unpack(&bytes, &entry, &public).is_ok());
        assert!(unpack(&bytes, &entry, &B64.encode(keys().public_key().as_ref())).is_err());
        let mut altered = bytes.clone();
        altered.push(b' ');
        assert_eq!(
            unpack(&altered, &entry, &public).unwrap_err(),
            "market_digest"
        );
        entry.permissions = vec!["network".into()];
        assert_eq!(
            unpack(&bytes, &entry, &public).unwrap_err(),
            "market_manifest"
        );
        entry.permissions = vec!["storage".into()];
        let mut manifest: Value = serde_json::from_slice(
            &B64.decode(package["files"][0]["data"].as_str().unwrap())
                .unwrap(),
        )
        .unwrap();
        manifest["type"] = json!("official");
        package["files"][0]["data"] = json!(B64.encode(serde_json::to_vec(&manifest).unwrap()));
        let bytes = signed(&package, &key);
        entry.sha256 = hash(&bytes);
        assert_eq!(
            unpack(&bytes, &entry, &public).unwrap_err(),
            "market_manifest"
        );
        let root = keys();
        assert!(verified::<Catalog>(
            &signed(&json!({}), &key),
            &B64.encode(root.public_key().as_ref()),
            CATALOG_LIMIT
        )
        .is_err());
    }
    #[test]
    fn rejects_traversal_case_collisions_native_files_and_resource_bombs() {
        let (key, package, entry) = fixture();
        let public = B64.encode(key.public_key().as_ref());
        for path in [
            "../escape.js",
            "/absolute.js",
            "a//b.js",
            ".secret.json",
            "a/./b.js",
            "a\\b.js",
            "plugin.dylib",
            "file.exe",
            "index.HTML",
            "a/../../b.js",
            "https://example.com/a.js",
        ] {
            let mut pkg = package.clone();
            pkg["files"][1]["path"] = json!(path);
            let bytes = signed(&pkg, &key);
            let mut e = entry.clone();
            e.sha256 = hash(&bytes);
            assert!(unpack(&bytes, &e, &public).is_err(), "{path}");
        }
        let mut pkg = package.clone();
        pkg["files"]
            .as_array_mut()
            .unwrap()
            .push(json!({"path":"INDEX.html","data":""}));
        let bytes = signed(&pkg, &key);
        let mut e = entry.clone();
        e.sha256 = hash(&bytes);
        assert_eq!(unpack(&bytes, &e, &public).unwrap_err(), "market_path");
        let mut pkg = package;
        pkg["files"][1]["data"] = json!(B64.encode(vec![0; FILE_LIMIT + 1]));
        let bytes = signed(&pkg, &key);
        e.sha256 = hash(&bytes);
        assert_eq!(unpack(&bytes, &e, &public).unwrap_err(), "market_limit");
    }
    #[test]
    fn catalog_requires_fresh_root_review_and_excludes_native_authority() {
        let (key, _, entry) = fixture();
        let time = now().unwrap();
        let mut c = cat(&key, entry, time);
        assert!(c.validate(time).is_ok());
        c.entries[0].permissions = vec!["input".into()];
        assert_eq!(c.validate(time).unwrap_err(), "market_permission");
        c.entries[0].permissions.clear();
        c.entries[0].id = "com.pinwall.window-tools".into();
        assert!(c.validate(time).is_err());
        c.entries.clear();
        c.expires_at = time;
        assert_eq!(c.validate(time).unwrap_err(), "market_expired");
        c.expires_at = time + TTL + 1;
        assert!(c.validate(time).is_err());
        c.expires_at = time + 3600;
        c.issued_at = time + 301;
        assert!(c.validate(time).is_err());
        for url in [
            "http://example.com/a",
            "https://127.0.0.1/a",
            "https://[::1]/a",
            "https://user@example.com/a",
            "https://192.168.1.1/a",
            "https://example.com:8443/a",
        ] {
            assert!(crate::widget_network::market_url(url).is_err());
        }
    }
    #[test]
    fn watermark_survives_disable_and_key_changes_and_preserves_corrupt_state() {
        let root = std::env::temp_dir().join(format!(
            "pinwall-market-{}-{}",
            std::process::id(),
            crate::persistence::next_id()
        ));
        fs::create_dir(&root).unwrap();
        let path = root.join("trust.json");
        let (key, _, entry) = fixture();
        let config = Config {
            enabled: true,
            catalog_url: "https://example.com/catalog.json".into(),
            root_key: B64.encode(key.public_key().as_ref()),
        };
        save_config(&path, config.clone()).unwrap();
        let mut c = cat(&key, entry, now().unwrap());
        c.revision = 7;
        accept_catalog(&path, &config, &c, "seven").unwrap();
        c.revision = 6;
        assert_eq!(
            accept_catalog(&path, &config, &c, "six").unwrap_err(),
            "market_rollback"
        );
        c.revision = 7;
        assert_eq!(
            accept_catalog(&path, &config, &c, "different").unwrap_err(),
            "market_rollback"
        );
        save_config(&path, Config::default()).unwrap();
        save_config(&path, config.clone()).unwrap();
        assert_eq!(
            accept_catalog(&path, &config, &c, "different").unwrap_err(),
            "market_rollback"
        );
        accept_catalog(&path, &config, &c, "seven").unwrap();
        fs::write(&path, b"{broken").unwrap();
        assert!(save_config(&path, config).is_err());
        assert!(path.with_extension("json.corrupt-backup").exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn revocation_invalidates_staged_authorization_without_running_operations() {
        let s = MarketService::default();
        let epoch = s.inner.lock().unwrap().epoch;
        s.clear().unwrap();
        assert!(s.check(epoch).is_err());
        assert!(serde_json::from_value::<Action>(
            json!({"method":"install","token":"a","path":"/tmp/evil"})
        )
        .is_err());
    }
    #[test]
    fn verified_files_materialize_privately_and_cleanup_after_failure() {
        let (key, package, entry) = fixture();
        let (_, files) = unpack(
            &signed(&package, &key),
            &entry,
            &B64.encode(key.public_key().as_ref()),
        )
        .unwrap();
        let root = std::env::temp_dir().join(format!(
            "pinwall-market-stage-{}",
            crate::persistence::next_id()
        ));
        fs::create_dir(&root).unwrap();
        let stage = materialize(&root, files).unwrap();
        assert_eq!(
            crate::widgets::read_manifest(&stage.0).unwrap().id,
            entry.id
        );
        let path = stage.0.clone();
        drop(stage);
        assert!(!path.exists());
        fs::remove_dir_all(root).unwrap();
    }
}
