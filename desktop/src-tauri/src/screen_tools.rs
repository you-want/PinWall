//! User-initiated region capture with the fixed Apple tool, local OCR and pixel sampling.
use base64::Engine;
use image::{DynamicImage, GenericImageView};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

pub const WIDGET_ID: &str = "com.pinwall.screen-tools";
#[derive(Clone)]
struct Capture {
    token: String,
    image: Arc<DynamicImage>,
    created: Instant,
}
#[derive(Default)]
pub struct ScreenService {
    selected: Mutex<Option<Capture>>,
    generation: AtomicU64,
    shutting_down: AtomicBool,
    #[cfg(target_os = "macos")]
    process: Arc<Mutex<Option<std::process::Child>>>,
}
impl ScreenService {
    pub fn clear(&self) -> Result<(), String> {
        let mut selected = self.selected.lock().map_err(|_| "tool_unavailable")?;
        self.generation.fetch_add(1, Ordering::SeqCst);
        *selected = None;
        #[cfg(target_os = "macos")]
        terminate_child(&self.process)?;
        Ok(())
    }
    pub fn shutdown(&self) -> Result<(), String> {
        self.shutting_down.store(true, Ordering::SeqCst);
        self.clear()
    }
    fn check_generation(&self, generation: u64) -> Result<(), String> {
        if self.shutting_down.load(Ordering::SeqCst)
            || self.generation.load(Ordering::SeqCst) != generation
        {
            return Err("tool_cancelled".into());
        }
        Ok(())
    }
    fn current(&self, token: &str) -> Result<Capture, String> {
        self.selected
            .lock()
            .map_err(|_| "tool_unavailable")?
            .as_ref()
            .filter(|v| v.token == token && v.created.elapsed() < Duration::from_secs(600))
            .cloned()
            .ok_or("screen_expired".into())
    }
    fn store(&self, generation: u64, image: DynamicImage) -> Result<ScreenPreview, String> {
        let thumb = image.thumbnail(720, 480);
        let bytes = png(&thumb)?;
        let token = format!("{}-{}", std::process::id(), crate::persistence::next_id());
        let preview = ScreenPreview {
            token: token.clone(),
            width: image.width(),
            height: image.height(),
            preview: format!(
                "data:image/png;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(bytes)
            ),
        };
        let mut selected = self.selected.lock().map_err(|_| "tool_unavailable")?;
        if self.generation.load(Ordering::SeqCst) != generation {
            return Err("tool_cancelled".into());
        }
        *selected = Some(Capture {
            token,
            image: Arc::new(image),
            created: Instant::now(),
        });
        Ok(preview)
    }
}
fn png(image: &DynamicImage) -> Result<Vec<u8>, String> {
    crate::image_tools::encode_image(
        image,
        &crate::image_tools::ExportOptions {
            width: image.width(),
            height: image.height(),
            format: crate::image_tools::OutputFormat::Png,
            quality: 80,
        },
    )
}
#[derive(Serialize)]
pub struct ScreenPreview {
    token: String,
    width: u32,
    height: u32,
    preview: String,
}
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ScreenResult {
    Capture {
        image: ScreenPreview,
    },
    Text {
        text: String,
    },
    Color {
        hex: String,
        r: u8,
        g: u8,
        b: u8,
        copied: bool,
    },
    Exported {
        bytes: u64,
    },
    Cancelled {},
}
#[derive(Deserialize)]
#[serde(tag = "method", rename_all = "camelCase", deny_unknown_fields)]
pub enum ScreenAction {
    Capture {},
    Ocr {
        token: String,
    },
    Color {
        token: String,
        x: u32,
        y: u32,
        copy: bool,
    },
    Export {
        token: String,
    },
}
fn pixel(image: &DynamicImage, x: u32, y: u32) -> Result<(String, [u8; 3]), String> {
    if x >= image.width() || y >= image.height() {
        return Err("screen_invalid_pixel".into());
    }
    let value = image.get_pixel(x, y);
    let rgb = [value[0], value[1], value[2]];
    Ok((format!("#{:02X}{:02X}{:02X}", rgb[0], rgb[1], rgb[2]), rgb))
}
trait CaptureProcess {
    fn poll(&mut self) -> Result<Option<bool>, String>;
    fn terminate(&mut self) -> Result<(), String>;
}
fn wait_process(
    process: &mut impl CaptureProcess,
    cancelled: impl Fn() -> bool,
    timeout: Duration,
) -> Result<bool, String> {
    let start = Instant::now();
    loop {
        let reason = if cancelled() {
            Some("tool_cancelled")
        } else if start.elapsed() >= timeout {
            Some("screen_timeout")
        } else {
            None
        };
        if let Some(code) = reason {
            process.terminate()?;
            return Err(code.into());
        }
        match process.poll() {
            Ok(Some(status)) => return Ok(status),
            Ok(None) => {}
            Err(_) => {
                process.terminate()?;
                return Err("screen_capture_failed".into());
            }
        }
        std::thread::sleep(Duration::from_millis(25));
    }
}
#[cfg(target_os = "macos")]
fn terminate_child(process: &Mutex<Option<std::process::Child>>) -> Result<(), String> {
    let mut guard = process.lock().map_err(|_| "screen_capture_failed")?;
    if let Some(mut child) = guard.take() {
        if child
            .try_wait()
            .map_err(|_| "screen_capture_failed")?
            .is_none()
        {
            if child.kill().is_err() {
                *guard = Some(child);
                return Err("screen_capture_failed".into());
            }
        }
        child.wait().map_err(|_| "screen_capture_failed")?;
    }
    Ok(())
}
#[cfg(target_os = "macos")]
struct AppleCapture(Arc<Mutex<Option<std::process::Child>>>);
#[cfg(target_os = "macos")]
impl CaptureProcess for AppleCapture {
    fn poll(&mut self) -> Result<Option<bool>, String> {
        let mut guard = self.0.lock().map_err(|_| "screen_capture_failed")?;
        guard
            .as_mut()
            .ok_or("tool_cancelled")?
            .try_wait()
            .map(|v| v.map(|s| s.success()))
            .map_err(|_| "screen_capture_failed".into())
    }
    fn terminate(&mut self) -> Result<(), String> {
        terminate_child(&self.0)
    }
}
#[cfg(target_os = "macos")]
impl Drop for AppleCapture {
    fn drop(&mut self) {
        if self.terminate().is_err() {
            eprintln!("[ScreenTools] Capture process cleanup failed");
        }
    }
}
#[cfg(target_os = "macos")]
struct HiddenWall {
    window: tauri::WebviewWindow,
    restore: bool,
}
#[cfg(target_os = "macos")]
impl HiddenWall {
    fn hide(window: tauri::WebviewWindow) -> Result<Self, String> {
        let restore = window.is_visible().map_err(|_| "screen_capture_failed")?;
        if restore {
            // A screenshot temporarily hides the wall without CloseRequested.
            // Revoke the same visible-only tools as an explicit hide.
            window.state::<crate::hardware_tools::HardwareService>().clear()?;
            window.state::<crate::display_tools::DisplayService>().clear()?;
            window.hide().map_err(|_| "screen_capture_failed")?;
        }
        Ok(Self { window, restore })
    }
}
#[cfg(target_os = "macos")]
impl Drop for HiddenWall {
    fn drop(&mut self) {
        if self.restore
            && !self
                .window
                .state::<ScreenService>()
                .shutting_down
                .load(Ordering::SeqCst)
        {
            if self.window.show().is_err() {
                eprintln!("[ScreenTools] Wall restore failed");
            } else if self.window.set_focus().is_err() {
                eprintln!("[ScreenTools] Wall focus restore failed");
            }
        }
    }
}
#[cfg(target_os = "macos")]
struct CaptureFile {
    folder: PathBuf,
    path: PathBuf,
}
#[cfg(target_os = "macos")]
impl Drop for CaptureFile {
    fn drop(&mut self) {
        if self.path.exists() && std::fs::remove_file(&self.path).is_err() {
            eprintln!("[ScreenTools] Temporary capture cleanup failed");
        }
        if std::fs::remove_dir(&self.folder).is_err() {
            eprintln!("[ScreenTools] Temporary directory cleanup failed");
        }
    }
}
#[cfg(target_os = "macos")]
fn capture_file(app: &tauri::AppHandle) -> Result<CaptureFile, String> {
    let root =
        crate::tool_files::private_dir(&crate::tool_files::storage_root(app)?, "capture-cache")?;
    // Previous crashed captures are removed only inside this tool's private cache, without following links.
    for entry in std::fs::read_dir(&root)
        .map_err(|_| "tool_io_failed")?
        .take(100)
    {
        let entry = entry.map_err(|_| "tool_io_failed")?;
        if !entry.file_name().to_string_lossy().starts_with("capture-") {
            continue;
        }
        let metadata = std::fs::symlink_metadata(entry.path()).map_err(|_| "tool_io_failed")?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            continue;
        }
        let path = entry.path().join("capture.png");
        if std::fs::symlink_metadata(&path).is_ok() {
            std::fs::remove_file(path).map_err(|_| "tool_io_failed")?;
        }
        std::fs::remove_dir(entry.path()).map_err(|_| "tool_io_failed")?;
    }
    let name = format!(
        "capture-{}-{}",
        std::process::id(),
        crate::persistence::next_id()
    );
    // create_dir is exclusive: pre-existing content is never reused as an output directory.
    let folder = root.join(name);
    let mut builder = std::fs::DirBuilder::new();
    use std::os::unix::fs::DirBuilderExt;
    builder.mode(0o700);
    builder.create(&folder).map_err(|_| "tool_io_failed")?;
    Ok(CaptureFile {
        path: folder.join("capture.png"),
        folder,
    })
}
#[cfg(target_os = "macos")]
fn capture_region(
    window: tauri::WebviewWindow,
    app: &tauri::AppHandle,
    generation: u64,
) -> Result<Option<DynamicImage>, String> {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
        fn CGRequestScreenCaptureAccess() -> bool;
    }
    // SAFETY: documented CoreGraphics functions take no arguments; requested only after a host button click.
    if !unsafe { CGPreflightScreenCaptureAccess() } && !unsafe { CGRequestScreenCaptureAccess() } {
        return Err("screen_permission_denied".into());
    }
    let temp = capture_file(app)?;
    let _hidden = HiddenWall::hide(window)?;
    std::thread::sleep(Duration::from_millis(200));
    let service = app.state::<ScreenService>();
    if service.generation.load(Ordering::SeqCst) != generation {
        return Err("tool_cancelled".into());
    }
    // Fixed executable and arguments. No shell, clipboard output, recording, audio or arbitrary command API.
    let mut process = AppleCapture(service.process.clone());
    {
        let mut slot = service
            .process
            .lock()
            .map_err(|_| "screen_capture_failed")?;
        if service.shutting_down.load(Ordering::SeqCst)
            || service.generation.load(Ordering::SeqCst) != generation
        {
            return Err("tool_cancelled".into());
        }
        let child = std::process::Command::new("/usr/sbin/screencapture")
            .args(["-i", "-s", "-x", "-t", "png"])
            .arg(&temp.path)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|_| "screen_capture_failed")?;
        *slot = Some(child);
    }
    // Recheck after spawn: disable/exit may have arrived between the prior check and launch.
    if service.shutting_down.load(Ordering::SeqCst)
        || service.generation.load(Ordering::SeqCst) != generation
    {
        process.terminate()?;
        return Err("tool_cancelled".into());
    }
    let success = wait_process(
        &mut process,
        || service.generation.load(Ordering::SeqCst) != generation,
        Duration::from_secs(120),
    )?;
    if !temp.path.exists() {
        return if unsafe { CGPreflightScreenCaptureAccess() } {
            Ok(None)
        } else {
            Err("screen_permission_denied".into())
        };
    }
    if !success {
        return Err("screen_capture_failed".into());
    }
    let bytes = crate::tool_files::read_bounded(&temp.path, 20 * 1024 * 1024)?;
    crate::image_tools::decode_image(&bytes).map(Some)
}

#[tauri::command]
pub async fn widget_screen_request(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    action: ScreenAction,
) -> Result<ScreenResult, String> {
    if window.label() != "main" {
        return Err("tool_permission_denied".into());
    }
    crate::widgets::verify_native_tool(&app, WIDGET_ID)?;
    if app
        .state::<ScreenService>()
        .shutting_down
        .load(Ordering::SeqCst)
    {
        return Err("tool_cancelled".into());
    }
    let guard = app.state::<crate::image_tools::ImageService>().acquire()?;
    let service = app.state::<ScreenService>();
    if matches!(action, ScreenAction::Capture {}) {
        service.clear()?;
    }
    // Bind before scheduling: a queued capture cannot start a new session after close/disable.
    let generation = service.generation.load(Ordering::SeqCst);
    service.check_generation(generation)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let service = app.state::<ScreenService>();
        service.check_generation(generation)?;
        match action {
            ScreenAction::Capture {} => {
                #[cfg(target_os = "macos")]
                {
                    let Some(image) = capture_region(window, &app, generation)? else {
                        return Ok(ScreenResult::Cancelled {});
                    };
                    service
                        .store(generation, image)
                        .map(|image| ScreenResult::Capture { image })
                }
                #[cfg(not(target_os = "macos"))]
                {
                    let _ = (window, generation);
                    Err("screen_unsupported".into())
                }
            }
            ScreenAction::Ocr { token } => {
                let capture = service.current(&token)?;
                #[cfg(target_os = "macos")]
                {
                    let text = crate::image_tools::vision_text(&png(&capture.image)?)?;
                    service.current(&token)?;
                    Ok(ScreenResult::Text { text })
                }
                #[cfg(not(target_os = "macos"))]
                {
                    let _ = capture;
                    Err("screen_unsupported".into())
                }
            }
            ScreenAction::Color { token, x, y, copy } => {
                let capture = service.current(&token)?;
                let (hex, [r, g, b]) = pixel(&capture.image, x, y)?;
                if copy {
                    let clipboard = app.state::<crate::clipboard::ClipboardService>();
                    let _read = clipboard.acquire()?;
                    service.check_generation(generation)?;
                    #[cfg(target_os = "macos")]
                    crate::clipboard::write_confirmed_text(&hex)?;
                    #[cfg(not(target_os = "macos"))]
                    return Err("screen_unsupported".into());
                }
                Ok(ScreenResult::Color {
                    hex,
                    r,
                    g,
                    b,
                    copied: copy,
                })
            }
            ScreenAction::Export { token } => {
                let capture = service.current(&token)?;
                let Some(file) = app
                    .dialog()
                    .file()
                    .add_filter("PNG", &["png"])
                    .set_file_name("pinwall-capture.png")
                    .blocking_save_file()
                else {
                    return Ok(ScreenResult::Cancelled {});
                };
                let path = crate::tool_files::export_destination(
                    &app,
                    &file.into_path().map_err(|_| "tool_unsafe_path")?,
                )?;
                if !path
                    .extension()
                    .is_some_and(|v| v.eq_ignore_ascii_case("png"))
                {
                    return Err("image_extension_mismatch".into());
                }
                let bytes = png(&capture.image)?;
                let current = service.selected.lock().map_err(|_| "tool_unavailable")?;
                if !current.as_ref().is_some_and(|v| {
                    v.token == token && v.created.elapsed() < Duration::from_secs(600)
                }) {
                    return Err("screen_expired".into());
                }
                drop(current);
                let generation = service.generation.load(Ordering::SeqCst);
                service.current(&token)?;
                let size = crate::tool_files::atomic_export_cancellable(
                    &path,
                    &bytes[..],
                    80 * 1024 * 1024,
                    || {
                        service.generation.load(Ordering::SeqCst) != generation
                            || capture.created.elapsed() >= Duration::from_secs(600)
                    },
                )?;
                Ok(ScreenResult::Exported { bytes: size })
            }
        }
    })
    .await
    .map_err(|_| "tool_unavailable".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_os = "macos")]
    #[test]
    fn shutdown_kills_and_reaps_its_child_without_screen_access() {
        let service = ScreenService::default();
        let child = std::process::Command::new("/bin/sleep")
            .arg("30")
            .spawn()
            .unwrap();
        let pid = child.id() as libc::pid_t;
        *service.process.lock().unwrap() = Some(child);
        service.shutdown().unwrap();
        assert!(service.process.lock().unwrap().is_none());
        let mut status = 0;
        // SAFETY: pid is the exact child created above; WNOHANG cannot block or signal another process.
        assert_eq!(
            unsafe { libc::waitpid(pid, &mut status, libc::WNOHANG) },
            -1
        );
        assert_eq!(
            std::io::Error::last_os_error().raw_os_error(),
            Some(libc::ECHILD)
        );
    }
    #[test]
    fn pixels_use_original_coordinates_and_reject_outside_points() {
        let mut image = image::RgbaImage::new(4, 2);
        image.put_pixel(3, 1, image::Rgba([12, 34, 56, 255]));
        let image = DynamicImage::ImageRgba8(image);
        assert_eq!(
            pixel(&image, 3, 1).unwrap(),
            ("#0C2238".into(), [12, 34, 56])
        );
        assert!(pixel(&image, 4, 1).is_err());
        assert!(pixel(&image, 0, 2).is_err());
    }
    #[test]
    fn closing_invalidates_capture_tokens_and_late_results() {
        let service = ScreenService::default();
        let queued_generation = service.generation.load(Ordering::SeqCst);
        assert!(service.check_generation(queued_generation).is_ok());
        let preview = service.store(0, DynamicImage::new_rgb8(10, 10)).unwrap();
        assert!(service.current(&preview.token).is_ok());
        assert!(service.current("forged").is_err());
        service.clear().unwrap();
        // A request waiting for a blocking worker must fail before screen/TCC work starts.
        assert!(
            matches!(service.check_generation(queued_generation), Err(code) if code == "tool_cancelled")
        );
        assert!(service.current(&preview.token).is_err());
        assert!(service.store(0, DynamicImage::new_rgb8(10, 10)).is_err());
        service.shutdown().unwrap();
        assert!(service
            .check_generation(service.generation.load(Ordering::SeqCst))
            .is_err());
    }
    struct Fake {
        stopped: usize,
        status: Result<Option<bool>, String>,
    }
    impl CaptureProcess for Fake {
        fn poll(&mut self) -> Result<Option<bool>, String> {
            self.status.clone()
        }
        fn terminate(&mut self) -> Result<(), String> {
            self.stopped += 1;
            Ok(())
        }
    }
    #[test]
    fn cancellation_timeout_and_process_error_terminate_and_reap() {
        let mut process = Fake {
            stopped: 0,
            status: Ok(None),
        };
        assert!(
            matches!(wait_process(&mut process,||true,Duration::from_secs(1)),Err(code)if code=="tool_cancelled")
        );
        assert_eq!(process.stopped, 1);
        assert!(
            matches!(wait_process(&mut process,||false,Duration::ZERO),Err(code)if code=="screen_timeout")
        );
        assert_eq!(process.stopped, 2);
        process.status = Err("private native detail".into());
        assert!(
            matches!(wait_process(&mut process,||false,Duration::from_secs(1)),Err(code)if code=="screen_capture_failed")
        );
        assert_eq!(process.stopped, 3);
        process.status = Ok(Some(true));
        assert_eq!(
            wait_process(&mut process, || false, Duration::from_secs(1)),
            Ok(true)
        );
        assert_eq!(process.stopped, 3);
    }
    #[test]
    fn commands_reject_file_paths_and_unknown_fields() {
        for value in [
            serde_json::json!({"method":"capture","path":"/tmp/out"}),
            serde_json::json!({"method":"color","token":"x","x":-1,"y":0,"copy":false}),
            serde_json::json!({"method":"execute","command":"anything"}),
        ] {
            assert!(serde_json::from_value::<ScreenAction>(value).is_err());
        }
    }
}
