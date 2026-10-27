//! Private native-tool storage and exports; no caller-supplied storage paths.
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};
use tauri::Manager;

pub(crate) fn private_dir(parent: &Path, name: &str) -> Result<PathBuf, String> {
    let path = parent.join(name);
    if !path.exists() {
        let mut builder = fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        if let Err(error) = builder.create(&path) {
            if error.kind() != std::io::ErrorKind::AlreadyExists {
                return Err("tool_io_failed".into());
            }
        }
    }
    let metadata = fs::symlink_metadata(&path).map_err(|_| "tool_io_failed")?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("tool_unsafe_path".into());
    }
    path.canonicalize().map_err(|_| "tool_io_failed".into())
}

pub(crate) fn storage_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let root = app.path().app_data_dir().map_err(|_| "tool_io_failed")?;
    fs::create_dir_all(&root).map_err(|_| "tool_io_failed")?;
    let metadata = fs::symlink_metadata(&root).map_err(|_| "tool_io_failed")?;
    if metadata.file_type().is_symlink() {
        return Err("tool_unsafe_path".into());
    }
    private_dir(
        &root.canonicalize().map_err(|_| "tool_io_failed")?,
        "native-tools",
    )
}

pub(crate) fn read_bounded(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let metadata = fs::symlink_metadata(path).map_err(|_| "tool_io_failed")?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("tool_unsafe_path".into());
    }
    if metadata.len() > limit {
        return Err("tool_too_large".into());
    }
    let mut data = Vec::new();
    fs::File::open(path)
        .map_err(|_| "tool_io_failed")?
        .take(limit + 1)
        .read_to_end(&mut data)
        .map_err(|_| "tool_io_failed")?;
    if data.len() as u64 > limit {
        return Err("tool_too_large".into());
    }
    Ok(data)
}

pub(crate) fn export_destination(app: &tauri::AppHandle, path: &Path) -> Result<PathBuf, String> {
    let path = crate::image_tools::safe_path(path)?;
    let root = app.path().app_data_dir().map_err(|_| "tool_io_failed")?;
    if root.canonicalize().is_ok_and(|root| path.starts_with(root)) {
        return Err("tool_unsafe_path".into());
    }
    Ok(path)
}

/// A bounded stream is copied into a private sibling, then atomically replaces the chosen target.
#[cfg(test)]
pub(crate) fn atomic_export<R: Read>(path: &Path, reader: R, limit: u64) -> Result<u64, String> {
    atomic_export_cancellable(path, reader, limit, || false)
}
pub(crate) fn atomic_export_cancellable<R: Read>(
    path: &Path,
    mut reader: R,
    limit: u64,
    cancelled: impl Fn() -> bool,
) -> Result<u64, String> {
    let path = crate::image_tools::safe_path(path)?;
    let temp = path.with_file_name(format!(
        ".pinwall-export-{}-{}.tmp",
        std::process::id(),
        crate::persistence::next_id()
    ));
    let result = (|| -> Result<u64, String> {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp).map_err(|_| "tool_io_failed")?;
        let mut size = 0u64;
        let mut buffer = [0u8; 64 * 1024];
        loop {
            if cancelled() {
                return Err("tool_cancelled".into());
            }
            let count = reader.read(&mut buffer).map_err(|_| "tool_io_failed")?;
            if count == 0 {
                break;
            }
            size += count as u64;
            if size > limit {
                return Err("tool_too_large".into());
            }
            file.write_all(&buffer[..count])
                .map_err(|_| "tool_io_failed")?;
        }
        file.flush().map_err(|_| "tool_io_failed")?;
        file.sync_all().map_err(|_| "tool_io_failed")?;
        drop(file);
        if cancelled() {
            return Err("tool_cancelled".into());
        }
        fs::rename(&temp, &path).map_err(|_| "tool_io_failed")?;
        Ok(size)
    })();
    if result.is_err() && temp.exists() && fs::remove_file(&temp).is_err() {
        eprintln!("[NativeTools] Export temporary file cleanup failed");
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn oversize_exports_leave_destination_intact_and_no_temporary_files() {
        let root = std::env::temp_dir().join(format!(
            "pinwall-tool-files-{}-{}",
            std::process::id(),
            crate::persistence::next_id()
        ));
        fs::create_dir_all(&root).unwrap();
        let out = root.join("out");
        fs::write(&out, b"old").unwrap();
        assert!(atomic_export(&out, &b"too long"[..], 2).is_err());
        assert_eq!(fs::read(&out).unwrap(), b"old");
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        let polls = std::sync::atomic::AtomicUsize::new(0);
        assert!(
            matches!(atomic_export_cancellable(&out, &b"private copy"[..], 100,
            || polls.fetch_add(1,std::sync::atomic::Ordering::SeqCst)>=1),Err(code) if code=="tool_cancelled")
        );
        assert_eq!(fs::read(&out).unwrap(), b"old");
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        atomic_export(&out, &b"new"[..], 3).unwrap();
        assert_eq!(fs::read(&out).unwrap(), b"new");
        #[cfg(unix)]
        {
            let link = root.join("linked");
            std::os::unix::fs::symlink(&root, &link).unwrap();
            assert!(private_dir(&root, "linked").is_err());
        }
        fs::remove_dir_all(root).unwrap();
    }
}
