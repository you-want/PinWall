//! Optional host-owned audio, media and window tools. No arbitrary scripts or paths.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex, atomic::{AtomicU64, Ordering}};
use tauri::Manager;
pub const AUDIO_ID: &str = "com.pinwall.music";
pub const WINDOWS_ID: &str = "com.pinwall.window-tools";
#[derive(Clone, Default)]
pub struct DesktopService {
    lock: Arc<Mutex<()>>,
    generation: Arc<AtomicU64>,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(tag="method", rename_all="camelCase", deny_unknown_fields)]
pub enum AudioAction {
    List {},
    Default { device: u32, direction: Direction },
    Volume { device: u32, direction: Direction, value: f64 },
    Mute { device: u32, direction: Direction, muted: bool },
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all="lowercase")]
pub enum Direction { Input, Output }
#[derive(Debug, Deserialize, Serialize)]
#[serde(tag="method", rename_all="camelCase", deny_unknown_fields)]
pub enum MediaAction {
    Players {},
    Info { player: Player },
    Control { player: Player, action: MediaControl },
}
#[derive(Debug, Deserialize, Serialize)]
pub enum Player {
    #[serde(rename="com.apple.Music")] Music,
    #[serde(rename="com.spotify.client")] Spotify,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all="camelCase")]
pub enum MediaControl { Play, Pause, Toggle, Next, Previous }
#[derive(Debug, Deserialize, Serialize)]
#[serde(tag="method", rename_all="camelCase", deny_unknown_fields)]
pub enum WindowAction {
    List {}, Permission {}, Release {}, DockStart {}, DockStop {}, DockStatus {},
    Focus { token: String }, Preview { token: String }, Restore { token: String },
    Layout { token: String, screen: u32, layout: Layout },
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all="camelCase")]
pub enum Layout { Left, Right, Top, Bottom, QuarterTopLeft, QuarterTopRight, QuarterBottomLeft, QuarterBottomRight, Maximize, Center }
fn validate_window(action: &WindowAction) -> Result<(),String> {
    let token=match action { WindowAction::List{}|WindowAction::Permission{}|WindowAction::Release{}|WindowAction::DockStart{}|WindowAction::DockStop{}|WindowAction::DockStatus{}=>return Ok(()), WindowAction::Focus{token}|WindowAction::Preview{token}|WindowAction::Restore{token}|WindowAction::Layout{token,..}=>token };
    if token.len()!=36 || !token.bytes().all(|c|c.is_ascii_hexdigit()||c==b'-') {return Err("desktop_invalid_action".into());}
    Ok(())
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(tag="method", rename_all="camelCase", deny_unknown_fields)]
pub enum RouteAction {
    List {}, StopAll {},
    Start { process: u32, pid: u32, device: u32, gain: f64 },
    Stop { token: String }, Gain { token: String, gain: f64 },
}
fn validate_route(action: &RouteAction) -> Result<(),String> {
    let gain=match action {RouteAction::Start{process,pid,device,gain}=>{if *process==0||*pid<=1||*pid>i32::MAX as u32||*device==0{return Err("desktop_invalid_action".into());}Some(*gain)},RouteAction::Gain{gain,..}=>Some(*gain),_=>None};
    if gain.is_some_and(|v|!v.is_finite()||!(0.0..=1.0).contains(&v)) {return Err("desktop_invalid_action".into());}
    if let RouteAction::Stop{token}|RouteAction::Gain{token,..}=action {if token.len()!=36||!token.bytes().all(|c|c.is_ascii_hexdigit()||c==b'-'){return Err("desktop_invalid_action".into());}}
    Ok(())
}
#[cfg(target_os="macos")]
fn route_generation()->u64 {unsafe extern "C" {fn pinwall_routes_generation()->u64;}unsafe{pinwall_routes_generation()}}
#[cfg(not(target_os="macos"))]
fn route_generation()->u64 {0}
fn validate_audio(action: &AudioAction) -> Result<(), String> {
    if let AudioAction::Volume { value, .. } = action {
        if !value.is_finite() || !(0.0..=1.0).contains(value) { return Err("desktop_invalid_action".into()); }
    }
    Ok(())
}
#[cfg(target_os="macos")]
pub(crate) fn native(value: &Value) -> Result<Value, String> {
    use std::ffi::{CStr, CString};
    unsafe extern "C" {
        fn pinwall_desktop_request(json: *const std::ffi::c_char) -> *mut std::ffi::c_char;
        fn pinwall_desktop_free(value: *mut std::ffi::c_char);
    }
    let input=CString::new(value.to_string()).map_err(|_| "desktop_invalid_action")?;
    // The window registry belongs to the main thread; audio routes have their own native mutex.
    // The C wrapper catches exceptions
    // and returns an owned, bounded NUL-terminated UTF-8 JSON allocation.
    let value=unsafe {
        let pointer=pinwall_desktop_request(input.as_ptr());
        if pointer.is_null() { return Err("desktop_unavailable".into()); }
        let decoded=serde_json::from_slice::<Value>(CStr::from_ptr(pointer).to_bytes());
        pinwall_desktop_free(pointer);
        decoded.map_err(|_| "desktop_unavailable")?
    };
    if let Some(error)=value.get("error").and_then(Value::as_str) { return Err(error.to_owned()); }
    Ok(value)
}
#[cfg(not(target_os="macos"))]
pub(crate) fn native(_: &Value) -> Result<Value,String> { Err("desktop_unsupported".into()) }
impl DesktopService {
    async fn request(&self, mut action: Value, domain: &'static str) -> Result<Value,String> {
        let generation=self.generation.load(Ordering::SeqCst); let state=self.clone();
        action["domain"]=json!(domain);
        if domain=="routes" {action["epoch"]=json!(route_generation());}
        #[cfg(target_os="macos")]
        if domain=="windows" {unsafe extern "C" {fn pinwall_windows_generation()->u64;}action["epoch"]=json!(unsafe{pinwall_windows_generation()});}
        tauri::async_runtime::spawn_blocking(move || {
            let _guard=state.lock.lock().map_err(|_| "desktop_unavailable")?;
            if generation!=state.generation.load(Ordering::SeqCst) { return Err("tool_cancelled".into()); }
            native(&action)
        }).await.map_err(|_| "desktop_unavailable".to_string())?
    }
    pub fn clear(&self) -> Result<(),String> { self.clear_target("all") }
    pub fn clear_visible(&self)->Result<(),String>{self.clear_target("audio")?;self.clear_target("windows")}
    pub fn clear_widget(&self,widget_id:&str)->Result<(),String>{self.clear_target(if widget_id==AUDIO_ID {"audio"} else {"windows"})}
    fn clear_target(&self,_target:&str) -> Result<(),String> {
        self.generation.fetch_add(1,Ordering::SeqCst);
        // Clear must never wait for a worker that is dispatching to the main thread.
        // Window references and taps are session-owned; device preferences are user-owned.
        #[cfg(target_os="macos")]
        { native(&json!({"domain":"clear","method":"clear","target":_target}))?; }
        Ok(())
    }
}
#[tauri::command]
pub async fn widget_audio_request(window:tauri::WebviewWindow,app:tauri::AppHandle,action:AudioAction)->Result<Value,String>{
    crate::metrics::require_main(window.label())?;crate::widgets::verify_native_tool(&app,AUDIO_ID)?;
    validate_audio(&action)?;
    app.state::<DesktopService>().request(serde_json::to_value(action).map_err(|_|"desktop_invalid_action")?,"audio").await
}
#[tauri::command]
pub async fn widget_media_request(window:tauri::WebviewWindow,app:tauri::AppHandle,action:MediaAction)->Result<Value,String>{
    crate::metrics::require_main(window.label())?;crate::widgets::verify_native_tool(&app,AUDIO_ID)?;
    app.state::<DesktopService>().request(serde_json::to_value(action).map_err(|_|"desktop_invalid_action")?,"media").await
}
#[tauri::command]
pub async fn widget_audio_route_request(window:tauri::WebviewWindow,app:tauri::AppHandle,action:RouteAction)->Result<Value,String>{
    crate::metrics::require_main(window.label())?;crate::widgets::verify_native_tool(&app,AUDIO_ID)?;validate_route(&action)?;
    app.state::<DesktopService>().request(serde_json::to_value(action).map_err(|_|"desktop_invalid_action")?,"routes").await
}
#[tauri::command]
pub async fn widget_window_request(window:tauri::WebviewWindow,app:tauri::AppHandle,action:WindowAction)->Result<Value,String>{
    crate::metrics::require_main(window.label())?;crate::widgets::verify_native_tool(&app,WINDOWS_ID)?;
    validate_window(&action)?;
    app.state::<DesktopService>().request(serde_json::to_value(action).map_err(|_|"desktop_invalid_action")?,"windows").await
}
#[tauri::command]
pub async fn widget_notification_request(window:tauri::WebviewWindow,app:tauri::AppHandle,widget_id:String,title:String,body:String)->Result<Value,String>{
    crate::metrics::require_main(window.label())?;
    crate::widgets::require_widget_permission(&app,&widget_id,"notify")?;
    if title.trim().is_empty()||title.len()>512||body.len()>8192 {return Err("widget_notification_invalid".into());}
    static SENT: std::sync::OnceLock<Mutex<std::collections::HashMap<String,std::time::Instant>>> = std::sync::OnceLock::new();
    {
        let mut sent=SENT.get_or_init(Default::default).lock().map_err(|_|"widget_notification_failed")?;
        sent.retain(|_,time|time.elapsed().as_secs()<60);
        if sent.len()>=100 || sent.get(&widget_id).is_some_and(|time|time.elapsed().as_secs()<5) {return Err("widget_notification_limit".into());}
        sent.insert(widget_id.clone(),std::time::Instant::now());
    }
    // Does not replace the app's active core reminder. Success means accepted by macOS,
    // whose notification preferences/Focus mode ultimately control visible delivery.
    tauri::async_runtime::spawn_blocking(move||native(&json!({"domain":"notify","widgetId":widget_id,"title":title,"body":body}))).await.map_err(|_|"widget_notification_failed".to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn audio_rejects_out_of_range_numbers_and_injected_actions() {
        for value in [-1.0,1.1,f64::NAN,f64::INFINITY] {
            assert!(validate_audio(&AudioAction::Volume{device:1,direction:Direction::Output,value}).is_err());
        }
        assert!(validate_audio(&AudioAction::Volume{device:1,direction:Direction::Output,value:0.5}).is_ok());
        for value in [json!({"method":"default","device":1,"direction":"both"}),json!({"method":"list","path":"/tmp/x"}),json!({"method":"volume","device":-1,"direction":"output","value":0.5})] {
            assert!(serde_json::from_value::<AudioAction>(value).is_err());
        }
    }
    #[test]
    fn media_only_accepts_known_players_and_fixed_commands() {
        for value in [json!({"method":"control","player":"com.apple.Music","action":"quit"}),json!({"method":"info","player":"Finder"}),json!({"method":"players","script":"anything"})] {
            assert!(serde_json::from_value::<MediaAction>(value).is_err());
        }
        assert!(serde_json::from_value::<MediaAction>(json!({"method":"control","player":"com.spotify.client","action":"next"})).is_ok());
    }
    #[test]
    fn window_actions_reject_arbitrary_handles_layouts_and_paths(){
        assert!(validate_window(&WindowAction::Focus{token:"../x".into()}).is_err());
        assert!(serde_json::from_value::<WindowAction>(json!({"method":"layout","token":"00000000-0000-4000-8000-000000000001","screen":1,"layout":"fullscreen"})).is_err());
        assert!(serde_json::from_value::<WindowAction>(json!({"method":"preview","token":"00000000-0000-4000-8000-000000000001","path":"/tmp/x"})).is_err());
    }
    #[cfg(target_os="macos")]
    #[test]
    fn layouts_use_visible_display_bounds_with_negative_origins(){
        unsafe extern "C" {fn pinwall_window_geometry_test()->i32;}
        assert_eq!(unsafe{pinwall_window_geometry_test()},1);
        unsafe extern "C" {fn pinwall_dock_geometry_test()->i32;}
        assert_eq!(unsafe{pinwall_dock_geometry_test()},1);
    }
    #[cfg(target_os="macos")]
    #[test]
    fn revocation_rejects_queued_routes_before_they_touch_audio(){
        let epoch=route_generation();
        native(&json!({"domain":"clear","target":"audio"})).unwrap();
        assert_eq!(native(&json!({"domain":"routes","method":"list","epoch":epoch})).unwrap_err(),"tool_cancelled");
    }
    #[test]
    fn routes_reject_unbounded_gains_and_injected_process_actions(){
        for gain in [-0.1,1.1,f64::NAN] {assert!(validate_route(&RouteAction::Start{process:10,pid:100,device:1,gain}).is_err());}
        assert!(validate_route(&RouteAction::Start{process:10,pid:1,device:1,gain:0.5}).is_err());
        assert!(serde_json::from_value::<RouteAction>(json!({"method":"start","process":1,"pid":10,"device":1,"gain":0.5,"captureAll":true})).is_err());
    }
    #[cfg(target_os="macos")]
    #[test]
    fn synthetic_route_resampling_gain_and_underflow_are_bounded(){
        unsafe extern "C" {fn pinwall_route_dsp_test()->i32;}
        assert_eq!(unsafe{pinwall_route_dsp_test()},1);
    }
    #[cfg(target_os="macos")]
    #[test]
    #[ignore="Read-only CoreAudio device smoke; never switches or captures audio"]
    fn native_audio_devices_smoke() {
        let result=native(&json!({"domain":"audio","method":"list"})).unwrap();
        assert!(result["devices"].is_array());
        assert!(result["devices"].as_array().unwrap().len()<=128);
        for device in result["devices"].as_array().unwrap(){for key in ["isDefault","canVolume","canMute"]{assert!(device[key].is_boolean(),"{key} must be a JSON boolean");}assert!(device["muted"].is_null()||device["muted"].is_boolean());}
    }
}
