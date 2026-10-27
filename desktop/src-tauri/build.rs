fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("src/native/desktop_tools.m")
            .file("src/native/audio_routes.m")
            .flag("-fobjc-arc")
            .flag("-std=gnu11")
            .flag("-mmacosx-version-min=10.13")
            .compile("pinwall_desktop_tools");
        for framework in ["Foundation", "AppKit", "CoreAudio", "ApplicationServices", "AudioToolbox"] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
        println!("cargo:rustc-link-arg=-Wl,-weak_framework,ScreenCaptureKit");
        println!("cargo:rustc-link-arg=-Wl,-weak_framework,UserNotifications");
        println!("cargo:rerun-if-changed=src/native/desktop_tools.m");
        println!("cargo:rerun-if-changed=src/native/audio_routes.m");
    }
    tauri_build::build()
}
