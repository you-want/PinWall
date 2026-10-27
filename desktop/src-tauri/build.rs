fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("src/native/desktop_tools.m")
            .file("src/native/audio_routes.m")
            .file("src/native/input_tools.m")
            .file("src/native/dock_preview.m")
            .file("src/native/video_tools.m")
            .flag("-fobjc-arc")
            .flag("-std=gnu11")
            .flag("-mmacosx-version-min=10.13")
            .compile("pinwall_desktop_tools");
        for framework in ["Foundation", "AppKit", "CoreAudio", "ApplicationServices", "AudioToolbox", "Carbon", "AVFoundation", "CoreMedia", "CoreVideo"] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
        println!("cargo:rustc-link-arg=-Wl,-weak_framework,ScreenCaptureKit");
        println!("cargo:rustc-link-arg=-Wl,-weak_framework,UserNotifications");
        println!("cargo:rerun-if-changed=src/native/desktop_tools.m");
        println!("cargo:rerun-if-changed=src/native/audio_routes.m");
        println!("cargo:rerun-if-changed=src/native/input_tools.m");
        println!("cargo:rerun-if-changed=src/native/dock_preview.m");
        println!("cargo:rerun-if-changed=src/native/video_tools.m");
    }
    tauri_build::build()
}
