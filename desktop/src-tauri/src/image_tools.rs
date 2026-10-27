//! Host-owned image selection, bounded local processing and Vision OCR.
use base64::Engine;
use image::{DynamicImage, ImageDecoder, ImageEncoder};
use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

pub const OCR_ID: &str = "com.pinwall.ocr-note";
pub const IMAGE_ID: &str = "com.pinwall.image-tools";
const MAX_FILE_BYTES: usize = 20 * 1024 * 1024;
const MAX_PIXELS: u64 = 16_000_000;
static NEXT_ID: AtomicU64 = AtomicU64::new(1);
fn next_id() -> u64 {
    NEXT_ID.fetch_add(1, Ordering::Relaxed)
}

fn require_main(label: &str) -> Result<(), String> {
    if label == "main" {
        Ok(())
    } else {
        Err("tool_permission_denied".into())
    }
}
fn validate_dimensions(width: u32, height: u32) -> Result<(), String> {
    if width == 0
        || height == 0
        || width > 8192
        || height > 8192
        || u64::from(width) * u64::from(height) > MAX_PIXELS
    {
        Err("image_too_large".into())
    } else {
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    Png,
    Jpeg,
    Webp,
}
impl OutputFormat {
    fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
            Self::Webp => "webp",
        }
    }
}
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExportOptions {
    pub width: u32,
    pub height: u32,
    pub format: OutputFormat,
    pub quality: u8,
}
impl ExportOptions {
    fn validate(&self) -> Result<(), String> {
        validate_dimensions(self.width, self.height)?;
        if !(1..=100).contains(&self.quality) {
            return Err("image_invalid_options".into());
        }
        Ok(())
    }
}

pub(crate) fn decode_image(bytes: &[u8]) -> Result<DynamicImage, String> {
    if bytes.len() > MAX_FILE_BYTES {
        return Err("image_too_large".into());
    }
    let mut reader = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| "image_invalid")?;
    if !matches!(
        reader.format(),
        Some(image::ImageFormat::Png | image::ImageFormat::Jpeg | image::ImageFormat::WebP)
    ) {
        return Err("image_invalid".into());
    }
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    let mut decoder = reader.into_decoder().map_err(|_| "image_invalid")?;
    let (width, height) = decoder.dimensions();
    validate_dimensions(width, height)?;
    let orientation = decoder.orientation().map_err(|_| "image_invalid")?;
    let mut image = DynamicImage::from_decoder(decoder).map_err(|_| "image_invalid")?;
    image.apply_orientation(orientation);
    Ok(image)
}

pub(crate) fn encode_image(image: &DynamicImage, options: &ExportOptions) -> Result<Vec<u8>, String> {
    options.validate()?;
    let resized = image
        .resize_exact(
            options.width,
            options.height,
            image::imageops::FilterType::Lanczos3,
        )
        .to_rgba8();
    let mut bytes = Vec::new();
    match options.format {
        OutputFormat::Png => image::codecs::png::PngEncoder::new_with_quality(
            &mut bytes,
            image::codecs::png::CompressionType::Best,
            image::codecs::png::FilterType::Adaptive,
        )
        .write_image(
            &resized,
            options.width,
            options.height,
            image::ExtendedColorType::Rgba8,
        ),
        OutputFormat::Webp => image::codecs::webp::WebPEncoder::new_lossless(&mut bytes)
            .write_image(
                &resized,
                options.width,
                options.height,
                image::ExtendedColorType::Rgba8,
            ),
        OutputFormat::Jpeg => {
            // JPEG has no alpha: composite against white rather than turning transparency black.
            let rgb: Vec<u8> = resized
                .pixels()
                .flat_map(|pixel| {
                    let alpha = u16::from(pixel[3]);
                    [0, 1, 2].map(|c| {
                        ((u16::from(pixel[c]) * alpha + 255 * (255 - alpha) + 127) / 255) as u8
                    })
                })
                .collect();
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, options.quality).encode(
                &rgb,
                options.width,
                options.height,
                image::ExtendedColorType::Rgb8,
            )
        }
    }
    .map_err(|_| "image_encode_failed")?;
    Ok(bytes)
}

pub(crate) fn safe_path(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute()
        || path
            .components()
            .any(|p| matches!(p, std::path::Component::ParentDir))
        || std::fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink())
    {
        return Err("image_unsafe_path".into());
    }
    let parent = path
        .parent()
        .ok_or("image_unsafe_path")?
        .canonicalize()
        .map_err(|_| "image_unsafe_path")?;
    Ok(parent.join(path.file_name().ok_or("image_unsafe_path")?))
}

fn write_export(path: &Path, source: &Path, bytes: &[u8]) -> Result<(), String> {
    let path = safe_path(path)?;
    let source = source
        .canonicalize()
        .map_err(|_| "image_source_protected")?;
    if path == source || path.canonicalize().is_ok_and(|p| p == source) {
        return Err("image_source_protected".into());
    }
    let temporary = path.with_file_name(format!(
        ".pinwall-image-{}-{}.tmp",
        std::process::id(),
        next_id()
    ));
    let result = (|| -> std::io::Result<()> {
        let mut options = std::fs::OpenOptions::new();
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
        std::fs::rename(&temporary, &path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result.map_err(|_| "image_save_failed".into())
}

#[derive(Clone)]
struct SelectedImage {
    token: String,
    source: PathBuf,
    image: Arc<DynamicImage>,
    selected: std::time::Instant,
}
#[derive(Default)]
pub struct ImageService {
    busy: Arc<AtomicBool>,
    selected: Mutex<Option<SelectedImage>>,
    generation: AtomicU64,
}
pub(crate) struct ImageGuard(Arc<AtomicBool>);
impl Drop for ImageGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
impl ImageService {
    pub(crate) fn acquire(&self) -> Result<ImageGuard, String> {
        self.busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| "image_busy")?;
        Ok(ImageGuard(self.busy.clone()))
    }
    pub fn clear(&self) -> Result<(), String> {
        self.generation.fetch_add(1, Ordering::SeqCst);
        *self.selected.lock().map_err(|_| "image_unavailable")? = None;
        Ok(())
    }
    fn current(&self, token: &str) -> Result<SelectedImage, String> {
        let selected = self.selected.lock().map_err(|_| "image_unavailable")?;
        selected
            .as_ref()
            .filter(|v| v.token == token && v.selected.elapsed().as_secs() < 600)
            .cloned()
            .ok_or_else(|| "image_expired".into())
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagePreview {
    token: String,
    width: u32,
    height: u32,
    original_bytes: usize,
    preview: String,
}
#[derive(Serialize)]
pub struct ImageExport {
    width: u32,
    height: u32,
    bytes: usize,
    format: OutputFormat,
}

fn select_image(app: &tauri::AppHandle) -> Result<Option<(PathBuf, usize, DynamicImage)>, String> {
    let Some(file) = app
        .dialog()
        .file()
        .add_filter("PNG / JPEG / WebP", &["png", "jpg", "jpeg", "webp"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = safe_path(&file.into_path().map_err(|_| "image_unsafe_path")?)?;
    let metadata = std::fs::symlink_metadata(&path).map_err(|_| "image_unavailable")?;
    if !metadata.is_file() {
        return Err("image_invalid".into());
    }
    if metadata.len() > MAX_FILE_BYTES as u64 {
        return Err("image_too_large".into());
    }
    let mut bytes = Vec::new();
    std::fs::File::open(&path)
        .map_err(|_| "image_unavailable")?
        .take(MAX_FILE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "image_unavailable")?;
    let image = decode_image(&bytes)?;
    Ok(Some((path, bytes.len(), image)))
}

#[tauri::command]
pub async fn select_widget_image(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<Option<ImagePreview>, String> {
    require_main(window.label())?;
    crate::widgets::verify_native_tool(&app, IMAGE_ID)?;
    let service = app.state::<ImageService>();
    let guard = service.acquire()?;
    let generation = service.generation.fetch_add(1, Ordering::SeqCst) + 1;
    *service.selected.lock().map_err(|_| "image_unavailable")? = None;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let Some((source, original_bytes, image)) = select_image(&app)? else {
            return Ok(None);
        };
        let thumb = image.thumbnail(360, 240);
        let preview = encode_image(
            &thumb,
            &ExportOptions {
                width: thumb.width(),
                height: thumb.height(),
                format: OutputFormat::Png,
                quality: 80,
            },
        )?;
        let token = format!("{}-{}", std::process::id(), next_id());
        let result = ImagePreview {
            token: token.clone(),
            width: image.width(),
            height: image.height(),
            original_bytes,
            preview: format!(
                "data:image/png;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(preview)
            ),
        };
        let service = app.state::<ImageService>();
        let mut selected = service.selected.lock().map_err(|_| "image_unavailable")?;
        if service.generation.load(Ordering::SeqCst) != generation {
            return Err("tool_cancelled".into());
        }
        *selected = Some(SelectedImage {
            token,
            source,
            image: Arc::new(image),
            selected: std::time::Instant::now(),
        });
        Ok(Some(result))
    })
    .await
    .map_err(|_| "image_unavailable".to_string())?
}

#[tauri::command]
pub async fn export_widget_image(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    token: String,
    options: ExportOptions,
) -> Result<Option<ImageExport>, String> {
    require_main(window.label())?;
    crate::widgets::verify_native_tool(&app, IMAGE_ID)?;
    options.validate()?;
    let service = app.state::<ImageService>();
    let guard = service.acquire()?;
    let selected = service.current(&token)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("Image", &[options.format.extension()])
            .set_file_name(format!("pinwall-image.{}", options.format.extension()))
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let path = safe_path(&file.into_path().map_err(|_| "image_unsafe_path")?)?;
        let extension = path
            .extension()
            .and_then(|v| v.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if extension != options.format.extension()
            && !(matches!(options.format, OutputFormat::Jpeg) && extension == "jpeg")
        {
            return Err("image_extension_mismatch".into());
        }
        let app_data = app.path().app_data_dir().map_err(|_| "image_unavailable")?;
        if app_data
            .canonicalize()
            .is_ok_and(|root| path.starts_with(root))
        {
            return Err("image_unsafe_path".into());
        }
        let bytes = encode_image(&selected.image, &options)?;
        let service = app.state::<ImageService>();
        // Serialize final validation with disposal so an already cancelled selection cannot save.
        let current = service.selected.lock().map_err(|_| "image_unavailable")?;
        if !current
            .as_ref()
            .is_some_and(|v| v.token == token && v.selected.elapsed().as_secs() < 600)
        {
            return Err("image_expired".into());
        }
        write_export(&path, &selected.source, &bytes)?;
        Ok(Some(ImageExport {
            width: options.width,
            height: options.height,
            bytes: bytes.len(),
            format: options.format,
        }))
    })
    .await
    .map_err(|_| "image_unavailable".to_string())?
}

#[tauri::command]
pub async fn recognize_widget_image(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    require_main(window.label())?;
    crate::widgets::verify_native_tool(&app, OCR_ID)?;
    let guard = app.state::<ImageService>().acquire()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        #[cfg(target_os = "macos")]
        {
            let Some((_, _, image)) = select_image(&app)? else {
                return Ok(None);
            };
            let bytes = encode_image(
                &image,
                &ExportOptions {
                    width: image.width(),
                    height: image.height(),
                    format: OutputFormat::Png,
                    quality: 80,
                },
            )?;
            vision_text(&bytes).map(Some)
        }
        #[cfg(not(target_os = "macos"))]
        {
            Err("ocr_unsupported".into())
        }
    })
    .await
    .map_err(|_| "ocr_unavailable".to_string())?
}

#[cfg(target_os = "macos")]
pub(crate) fn vision_text(bytes: &[u8]) -> Result<String, String> {
    use objc2::{
        msg_send,
        rc::Retained,
        runtime::{AnyClass, AnyObject},
    };
    use objc2_foundation::{NSArray, NSData, NSDictionary, NSError, NSString};
    #[link(name = "Vision", kind = "framework")]
    extern "C" {}
    objc2::rc::autoreleasepool(|_| {
        let request_class = AnyClass::get(c"VNRecognizeTextRequest").ok_or("ocr_unsupported")?;
        let handler_class = AnyClass::get(c"VNImageRequestHandler").ok_or("ocr_unsupported")?;
        let data = NSData::with_bytes(bytes);
        let options = NSDictionary::<NSString, AnyObject>::new();
        let languages = NSArray::from_retained_slice(&[
            NSString::from_str("zh-Hans"),
            NSString::from_str("en-US"),
        ]);
        // SAFETY: selectors and argument/return types follow Vision's public Objective-C API.
        // All objects are retained within this worker's autorelease pool. No callbacks cross threads.
        unsafe {
            let request: Retained<AnyObject> = msg_send![request_class, new];
            let _: () = msg_send![&request, setRecognitionLevel: 0isize]; // VNRequestTextRecognitionLevelAccurate
            let _: () = msg_send![&request, setRecognitionLanguages: &*languages];
            let _: () = msg_send![&request, setUsesLanguageCorrection: true];
            let allocated: objc2::rc::Allocated<AnyObject> = msg_send![handler_class, alloc];
            let handler: Retained<AnyObject> =
                msg_send![allocated, initWithData: &*data, options: &*options];
            let requests = NSArray::from_slice(&[&*request]);
            let mut error: Option<Retained<NSError>> = None;
            let succeeded: bool =
                msg_send![&handler, performRequests: &*requests, error: &mut error];
            if !succeeded {
                return Err("ocr_unavailable".into());
            }
            let observations: Option<Retained<NSArray<AnyObject>>> = msg_send![&request, results];
            let mut lines = Vec::new();
            let mut length = 0usize;
            if let Some(observations) = observations {
                for observation in observations.iter() {
                    let candidates: Retained<NSArray<AnyObject>> =
                        msg_send![&*observation, topCandidates: 1usize];
                    if let Some(candidate) = candidates.firstObject() {
                        let text: Retained<NSString> = msg_send![&*candidate, string];
                        let text = text.to_string();
                        length += text.len() + 1;
                        if length > 64 * 1024 {
                            return Err("ocr_text_too_large".into());
                        }
                        lines.push(text);
                    }
                }
            }
            let text = lines.join("\n");
            if text.trim().is_empty() {
                Err("ocr_no_text".into())
            } else {
                Ok(text)
            }
        }
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    use image::{GenericImageView, ImageFormat, RgbaImage};

    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "Runs local Vision OCR on a synthetic fixture, no dialogs or user files"]
    fn native_ocr_smoke() {
        let text = vision_text(include_bytes!("../testdata/ocr-sample.png")).unwrap();
        assert!(
            text.to_uppercase().contains("PINWALL"),
            "fixture word was not recognized"
        );
        assert!(text.contains("2026"));
    }

    #[test]
    fn rejects_resource_bombs_and_invalid_export_options() {
        for (w, h) in [(0, 1), (9000, 1), (8192, 8192)] {
            assert!(validate_dimensions(w, h).is_err());
        }
        assert!(validate_dimensions(4000, 4000).is_ok());
        for value in [0, 101] {
            assert!(ExportOptions {
                width: 10,
                height: 10,
                format: OutputFormat::Jpeg,
                quality: value
            }
            .validate()
            .is_err());
        }
        assert!(decode_image(b"not an image").is_err());
        assert!(decode_image(&vec![0; MAX_FILE_BYTES + 1]).is_err());
    }

    #[test]
    fn resizing_preserves_requested_dimensions_and_reencodes_pixels() {
        let source = image::DynamicImage::ImageRgba8(RgbaImage::from_pixel(
            40,
            20,
            image::Rgba([255, 0, 0, 0]),
        ));
        for format in [OutputFormat::Png, OutputFormat::Jpeg, OutputFormat::Webp] {
            let bytes = encode_image(
                &source,
                &ExportOptions {
                    width: 20,
                    height: 10,
                    format,
                    quality: 80,
                },
            )
            .unwrap();
            let restored = image::load_from_memory(&bytes).unwrap();
            assert_eq!(restored.dimensions(), (20, 10));
            assert_eq!(
                image::guess_format(&bytes).unwrap(),
                match format {
                    OutputFormat::Png => ImageFormat::Png,
                    OutputFormat::Jpeg => ImageFormat::Jpeg,
                    OutputFormat::Webp => ImageFormat::WebP,
                }
            );
            if matches!(format, OutputFormat::Jpeg) {
                let rgb = restored.to_rgb8();
                assert!(rgb.get_pixel(0, 0).0.iter().all(|v| *v >= 245));
            }
        }
    }

    #[test]
    fn export_is_atomic_and_cannot_replace_the_source_or_follow_a_symlink() {
        let root = std::env::temp_dir().join(format!(
            "pinwall-image-test-{}-{}",
            std::process::id(),
            next_id()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let source = root.join("source.png");
        std::fs::write(&source, b"original").unwrap();
        assert!(write_export(&source, &source, b"new").is_err());
        assert_eq!(std::fs::read(&source).unwrap(), b"original");
        let out = root.join("output.png");
        write_export(&out, &source, b"export").unwrap();
        assert_eq!(std::fs::read(&out).unwrap(), b"export");
        #[cfg(unix)]
        {
            let link = root.join("linked.png");
            std::os::unix::fs::symlink(&source, &link).unwrap();
            assert!(write_export(&link, &source, b"bad").is_err());
        }
        assert_eq!(std::fs::read(&source).unwrap(), b"original");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn permissions_and_tokens_are_bound_to_the_host_tool() {
        assert!(require_main("settings").is_err());
        assert!(require_main("notification").is_err());
        assert!(require_main("main").is_ok());
        let service = ImageService::default();
        assert!(service.acquire().is_ok());
        let guard = service.acquire().unwrap();
        assert!(service.acquire().is_err());
        drop(guard);
        assert!(service.acquire().is_ok());
    }
}
