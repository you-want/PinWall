//! Bounded package replacement and versioned, atomic per-widget data transactions.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};

pub static PACKAGES: Mutex<()> = Mutex::new(());
static STORAGE: Mutex<()> = Mutex::new(());
const MAX_DATA: u64 = 1024 * 1024;
const MAX_PACKAGE: u64 = 32 * 1024 * 1024;
const MAX_FILES: usize = 256;

fn directory(path: &Path) -> Result<PathBuf, String> {
    let metadata = fs::symlink_metadata(path).map_err(|_| "widget_io")?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("widget_unsafe_path".into());
    }
    path.canonicalize().map_err(|_| "widget_io".into())
}
fn remove_owned(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(m) if m.is_dir() && !m.file_type().is_symlink() => {
            fs::remove_dir_all(path).map_err(|_| "widget_io".into())
        }
        Ok(_) => Err("widget_unsafe_path".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("widget_io".into()),
    }
}
fn copy_tree(
    source: &Path,
    destination: &Path,
    depth: usize,
    files: &mut usize,
    bytes: &mut u64,
) -> Result<(), String> {
    if depth > 12 {
        return Err("widget_package_limit".into());
    }
    directory(source)?;
    fs::create_dir(destination).map_err(|_| "widget_io")?;
    for entry in fs::read_dir(source).map_err(|_| "widget_io")? {
        let entry = entry.map_err(|_| "widget_io")?;
        if entry.file_name() == ".git" || entry.file_name() == "node_modules" {
            continue;
        }
        let metadata = fs::symlink_metadata(entry.path()).map_err(|_| "widget_io")?;
        if metadata.file_type().is_symlink() {
            return Err("widget_unsafe_path".into());
        }
        if metadata.is_dir() {
            *files += 1;
            if *files > MAX_FILES {
                return Err("widget_package_limit".into());
            }
            copy_tree(
                &entry.path(),
                &destination.join(entry.file_name()),
                depth + 1,
                files,
                bytes,
            )?;
        } else if metadata.is_file() {
            *files += 1;
            if *files > MAX_FILES || metadata.len() > MAX_PACKAGE.saturating_sub(*bytes) {
                return Err("widget_package_limit".into());
            }
            let input = fs::File::open(entry.path()).map_err(|_| "widget_io")?;
            let mut options = fs::OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut output = options
                .open(destination.join(entry.file_name()))
                .map_err(|_| "widget_io")?;
            let copied = std::io::copy(
                &mut input.take(MAX_PACKAGE.saturating_sub(*bytes) + 1),
                &mut output,
            )
            .map_err(|_| "widget_io")?;
            *bytes += copied;
            if *bytes > MAX_PACKAGE {
                return Err("widget_package_limit".into());
            }
            output.flush().map_err(|_| "widget_io")?;
            output.sync_all().map_err(|_| "widget_io")?;
        } else {
            return Err("widget_unsafe_path".into());
        }
    }
    Ok(())
}
pub fn recover(root: &Path, id: &str) -> Result<(), String> {
    let current = root.join(id);
    let previous = root.join(format!(".previous-{id}"));
    if !current.exists() && fs::symlink_metadata(&previous).is_ok() {
        directory(&previous)?;
        fs::rename(previous, current).map_err(|_| "widget_recovery_failed")?;
    }
    Ok(())
}
pub fn previous(root: &Path, id: &str) -> PathBuf {
    root.join(format!(".previous-{id}"))
}

/// Validate the complete staged package before touching the last working version.
pub fn install(
    root: &Path,
    source: &Path,
    id: &str,
    validate: impl Fn(&Path) -> Result<(), String>,
) -> Result<(), String> {
    let source = directory(source)?;
    let root = directory(root)?;
    let current = root.join(id);
    if source == current || source.starts_with(&current) || root.starts_with(&source) {
        return Err("widget_unsafe_path".into());
    }
    recover(&root, id)?;
    let stage = root.join(format!(
        ".stage-{}-{}",
        std::process::id(),
        crate::persistence::next_id()
    ));
    let result = (|| {
        copy_tree(&source, &stage, 0, &mut 0, &mut 0)?;
        validate(&stage)?;
        let backup = previous(&root, id);
        if fs::symlink_metadata(&current).is_ok() {
            directory(&current)?;
            remove_owned(&backup)?;
            fs::rename(&current, &backup).map_err(|_| "widget_io")?;
        }
        if fs::rename(&stage, &current).is_err() {
            if backup.exists() && fs::rename(&backup, &current).is_err() {
                return Err("widget_recovery_failed".into());
            }
            return Err("widget_io".into());
        }
        Ok(())
    })();
    if stage.exists() && remove_owned(&stage).is_err() {
        eprintln!("[Widget] Staging cleanup failed");
    }
    result
}
pub fn uninstall(root: &Path, id: &str) -> Result<(), String> {
    remove_owned(&root.join(id))?;
    remove_owned(&previous(root, id))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DataFile {
    schema_version: u32,
    revision: u64,
    data: HashMap<String, Value>,
}
fn valid_value(value: &Value, depth: usize) -> bool {
    if depth > 20 {
        return false;
    }
    match value {
        Value::Array(values) => values.iter().all(|v| valid_value(v, depth + 1)),
        Value::Object(values) => values.iter().all(|(k, v)| {
            !matches!(k.as_str(), "__proto__" | "constructor" | "prototype")
                && valid_value(v, depth + 1)
        }),
        _ => true,
    }
}
fn validate_data(data: &HashMap<String, Value>) -> Result<(), String> {
    if data.len() > 256
        || data.iter().any(|(k, v)| {
            k.is_empty()
                || k.len() > 256
                || matches!(k.as_str(), "__proto__" | "constructor" | "prototype")
                || !valid_value(v, 0)
        })
    {
        return Err("widget_storage_invalid".into());
    }
    if serde_json::to_vec(data)
        .map_err(|_| "widget_storage_invalid")?
        .len() as u64
        > MAX_DATA
    {
        return Err("widget_storage_limit".into());
    }
    Ok(())
}
fn load_data(path: &Path) -> Result<DataFile, String> {
    if fs::symlink_metadata(path).is_err_and(|e| e.kind() == std::io::ErrorKind::NotFound) {
        return Ok(DataFile {
            schema_version: 1,
            revision: 0,
            data: HashMap::new(),
        });
    }
    let bytes = crate::tool_files::read_bounded(path, MAX_DATA + 4096)?;
    let parsed = (|| {
        let value: Value = serde_json::from_slice(&bytes).map_err(|_| "widget_storage_corrupt")?;
        // Legacy plugin maps may contain a user key called schemaVersion: only recognize complete envelopes.
        let file = if value.get("data").is_some_and(Value::is_object)
            && value.get("revision").is_some()
            && value.get("schemaVersion").is_some()
        {
            if value["schemaVersion"].as_u64().is_some_and(|n| n > 1) {
                return Err("widget_storage_future".into());
            }
            let file: DataFile =
                serde_json::from_value(value).map_err(|_| "widget_storage_corrupt")?;
            if file.schema_version != 1 || file.revision > 9_007_199_254_740_991 {
                return Err("widget_storage_corrupt".into());
            }
            file
        } else {
            DataFile {
                schema_version: 1,
                revision: 0,
                data: serde_json::from_value(value).map_err(|_| "widget_storage_corrupt")?,
            }
        };
        validate_data(&file.data).map_err(|_| "widget_storage_corrupt")?;
        Ok(file)
    })();
    if parsed
        .as_ref()
        .is_err_and(|code: &String| code == "widget_storage_corrupt")
    {
        crate::persistence::preserve_corrupt(path)?;
    }
    parsed
}
#[derive(Deserialize)]
#[serde(tag = "method", rename_all = "camelCase", deny_unknown_fields)]
pub enum Mutation {
    Set { key: String, value: Value },
    Remove { key: String },
    Clear {},
}
pub fn read(path: &Path) -> Result<HashMap<String, Value>, String> {
    let _lock = STORAGE.lock().map_err(|_| "widget_storage_busy")?;
    load_data(path).map(|file| file.data)
}
pub fn mutate(path: &Path, mutation: Mutation) -> Result<(), String> {
    transaction(path, |data| {
        match mutation {
            Mutation::Set { key, value } => {
                data.insert(key, value);
            }
            Mutation::Remove { key } => {
                data.remove(&key);
            }
            Mutation::Clear {} => data.clear(),
        };
        Ok(())
    })
}
pub fn replace(path: &Path, replacement: HashMap<String, Value>) -> Result<(), String> {
    transaction(path, |data| {
        *data = replacement;
        Ok(())
    })
}
fn transaction(
    path: &Path,
    change: impl FnOnce(&mut HashMap<String, Value>) -> Result<(), String>,
) -> Result<(), String> {
    let _lock = STORAGE.lock().map_err(|_| "widget_storage_busy")?;
    let mut file = load_data(path)?;
    change(&mut file.data)?;
    validate_data(&file.data)?;
    file.revision = file
        .revision
        .checked_add(1)
        .filter(|v| *v <= 9_007_199_254_740_991)
        .ok_or("widget_storage_limit")?;
    crate::persistence::write_json(
        path,
        &serde_json::to_value(file).map_err(|_| "widget_storage_invalid")?,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn root() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "pinwall-repository-{}-{}",
            std::process::id(),
            crate::persistence::next_id()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }
    #[test]
    fn failed_staging_preserves_working_package_and_previous_recovers_after_interruption() {
        let root = root();
        let packages = root.join("packages");
        let source = root.join("source");
        fs::create_dir(&packages).unwrap();
        fs::create_dir(&source).unwrap();
        fs::write(source.join("index.html"), b"v1").unwrap();
        install(&packages, &source, "com.test.tool", |_| Ok(())).unwrap();
        fs::write(source.join("index.html"), b"v2").unwrap();
        assert!(install(&packages, &source, "com.test.tool", |_| Err(
            "invalid".into()
        ))
        .is_err());
        assert_eq!(
            fs::read(packages.join("com.test.tool/index.html")).unwrap(),
            b"v1"
        );
        install(&packages, &source, "com.test.tool", |_| Ok(())).unwrap();
        assert_eq!(
            fs::read(previous(&packages, "com.test.tool").join("index.html")).unwrap(),
            b"v1"
        );
        fs::remove_dir_all(packages.join("com.test.tool")).unwrap();
        recover(&packages, "com.test.tool").unwrap();
        assert_eq!(
            fs::read(packages.join("com.test.tool/index.html")).unwrap(),
            b"v1"
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn package_budgets_and_symlinks_fail_before_switching() {
        let root = root();
        let packages = root.join("packages");
        let source = root.join("source");
        fs::create_dir(&packages).unwrap();
        fs::create_dir(&source).unwrap();
        fs::File::create(source.join("bomb"))
            .unwrap()
            .set_len(MAX_PACKAGE + 1)
            .unwrap();
        assert!(install(&packages, &source, "com.test.tool", |_| Ok(())).is_err());
        assert!(!packages.join("com.test.tool").exists());
        #[cfg(unix)]
        {
            fs::remove_file(source.join("bomb")).unwrap();
            std::os::unix::fs::symlink(&root, source.join("escape")).unwrap();
            assert!(install(&packages, &source, "com.test.tool", |_| Ok(())).is_err());
        }
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn legacy_migration_and_concurrent_mutations_keep_unrelated_values() {
        let root = root();
        let path = root.join("data.json");
        fs::write(&path, br#"{"legacy":"kept"}"#).unwrap();
        assert_eq!(read(&path).unwrap()["legacy"], "kept");
        std::thread::scope(|scope| {
            for n in 0..12 {
                let path = &path;
                scope.spawn(move || {
                    mutate(
                        path,
                        Mutation::Set {
                            key: format!("key{n}"),
                            value: Value::from(n),
                        },
                    )
                    .unwrap()
                });
            }
        });
        assert_eq!(read(&path).unwrap().len(), 13);
        let file: DataFile = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(file.schema_version, 1);
        assert_eq!(file.revision, 12);
        assert!(mutate(
            &path,
            Mutation::Set {
                key: "__proto__".into(),
                value: Value::Null
            }
        )
        .is_err());
        assert_eq!(read(&path).unwrap().len(), 13);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn corruption_is_backed_up_and_future_versions_never_overwritten() {
        let root = root();
        let path = root.join("data.json");
        fs::write(&path, b"broken").unwrap();
        assert!(read(&path).is_err());
        assert_eq!(
            fs::read(path.with_extension("json.corrupt-backup")).unwrap(),
            b"broken"
        );
        assert!(mutate(&path, Mutation::Clear {}).is_err());
        let future = br#"{"schemaVersion":99,"revision":1,"data":{},"newField":true}"#;
        fs::write(&path, future).unwrap();
        assert!(
            matches!(mutate(&path,Mutation::Clear{}),Err(code)if code=="widget_storage_future")
        );
        assert_eq!(fs::read(&path).unwrap(), future);
        fs::remove_dir_all(root).unwrap();
    }
}
