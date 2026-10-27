//! Explicitly started input enhancements; stored rules never contain observed input.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex, atomic::{AtomicU64,Ordering}};
use tauri::Manager;
pub const WIDGET_ID:&str="com.pinwall.input-tools";
#[derive(Clone,Default)]
pub struct InputService { operations:Arc<Mutex<()>>,generation:Arc<AtomicU64> }
#[derive(Clone,Debug,Deserialize,Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Expansion {id:String,trigger:String,text:String}
#[derive(Clone,Debug,Deserialize,Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Profile {
    reverse_vertical:bool, reverse_horizontal:bool, discrete_only:bool,
    arrow_navigation:bool, text_expansion:bool, excluded_apps:Vec<String>, snippets:Vec<Expansion>,
}
impl Default for Profile {
    fn default()->Self { Self{reverse_vertical:false,reverse_horizontal:false,discrete_only:true,arrow_navigation:false,text_expansion:false,excluded_apps:vec!["com.apple.Terminal".into(),"com.googlecode.iterm2".into(),"com.1password.1password".into(),"com.agilebits.onepassword7".into(),"com.bitwarden.desktop".into(),"com.apple.keychainaccess".into()],snippets:Vec::new()} }
}
fn validate(profile:&Profile)->Result<(),String>{
    if profile.excluded_apps.len()>100||profile.snippets.len()>50{return Err("input_invalid_profile".into());}
    for app in &profile.excluded_apps {if app.len()>128||!app.contains('.')||app.split('.').any(str::is_empty)||!app.bytes().all(|c|c.is_ascii_alphanumeric()||matches!(c,b'.'|b'-'|b'_')){return Err("input_invalid_profile".into());}}
    let mut ids=std::collections::HashSet::new();let mut triggers=std::collections::HashSet::new();
    for snippet in &profile.snippets {
        if snippet.id.is_empty()||snippet.id.len()>64||!snippet.id.bytes().all(|c|c.is_ascii_hexdigit()||c==b'-')||!ids.insert(&snippet.id)||!triggers.insert(&snippet.trigger)||snippet.trigger.len()<2||snippet.trigger.len()>24||!snippet.trigger.starts_with(';')||!snippet.trigger[1..].bytes().all(|c|c.is_ascii_alphanumeric()||c==b'_'||c==b'-')||snippet.text.is_empty()||snippet.text.encode_utf16().count()>256||snippet.text.chars().any(|c|c.is_control()&&c!='\n'&&c!='\t') {return Err("input_invalid_profile".into());}
    }
    Ok(())
}
#[derive(Deserialize)]
#[serde(tag="method",rename_all="camelCase",deny_unknown_fields)]
pub enum Action { Load {}, Save {profile:Profile}, Status {}, Permission {}, Start {}, Stop {} }
impl InputService {
    pub fn clear(&self)->Result<(),String>{
        self.generation.fetch_add(1,Ordering::SeqCst);
        #[cfg(target_os="macos")]
        crate::desktop_tools::native(&json!({"domain":"clear","target":"input"}))?;
        Ok(())
    }
}
fn read_profile(path:&std::path::Path)->Result<Profile,String>{
    let data=crate::widget_repository::read(path)?;
    let value=match data.get("profile"){Some(value)=>serde_json::from_value(value.clone()).map_err(|_|"input_invalid_profile")?,None=>Profile::default()};
    validate(&value)?;Ok(value)
}
#[cfg(target_os="macos")]
fn input_generation()->u64{unsafe extern "C"{fn pinwall_input_generation()->u64;}unsafe{pinwall_input_generation()}}
#[cfg(not(target_os="macos"))]
fn input_generation()->u64{0}
#[tauri::command]
pub async fn widget_input_request(window:tauri::WebviewWindow,app:tauri::AppHandle,action:Action)->Result<Value,String>{
    crate::metrics::require_main(window.label())?;crate::widgets::verify_native_tool(&app,WIDGET_ID)?;
    let state=app.state::<InputService>().inner().clone();let generation=state.generation.load(Ordering::SeqCst);
    let epoch=input_generation();
    let path=crate::tool_files::storage_root(&app)?.join("input-tools.json");
    tauri::async_runtime::spawn_blocking(move||{
        if generation!=state.generation.load(Ordering::SeqCst){return Err("tool_cancelled".into());}
        match action {
            Action::Load{}=>{let _guard=state.operations.lock().map_err(|_|"input_unavailable")?;Ok(json!({"profile":read_profile(&path)?}))},
            Action::Save{profile}=>{
                validate(&profile)?;let _guard=state.operations.lock().map_err(|_|"input_unavailable")?;
                if generation!=state.generation.load(Ordering::SeqCst){return Err("tool_cancelled".into());}
                crate::widget_repository::mutate(&path,crate::widget_repository::Mutation::Set{key:"profile".into(),value:serde_json::to_value(&profile).map_err(|_|"input_invalid_profile")?})?;
                Ok(json!({"profile":profile}))
            },
            Action::Start{}=>{
                let profile={let _guard=state.operations.lock().map_err(|_|"input_unavailable")?;read_profile(&path)?};
                if generation!=state.generation.load(Ordering::SeqCst){return Err("tool_cancelled".into());}
                if !profile.reverse_vertical&&!profile.reverse_horizontal&&!profile.arrow_navigation&&!(profile.text_expansion&&!profile.snippets.is_empty()){return Err("input_no_features".into());}
                crate::desktop_tools::native(&json!({"domain":"input","method":"start","profile":profile,"epoch":epoch}))
            },
            Action::Stop{}=>{state.clear()?;crate::desktop_tools::native(&json!({"domain":"input","method":"status"}))},
            Action::Status{}=>crate::desktop_tools::native(&json!({"domain":"input","method":"status"})),
            Action::Permission{}=>crate::desktop_tools::native(&json!({"domain":"input","method":"permission"})),
        }
    }).await.map_err(|_|"input_unavailable".to_string())?
}
pub fn uninstall(app:&tauri::AppHandle)->Result<(),String>{
    let service=app.state::<InputService>();service.clear()?;
    let _guard=service.operations.lock().map_err(|_|"input_unavailable")?;
    let path=crate::tool_files::storage_root(app)?.join("input-tools.json");
    for path in [path.clone(),path.with_extension("json.corrupt-backup")] {if std::fs::symlink_metadata(&path).is_ok(){std::fs::remove_file(path).map_err(|_|"input_unavailable")?;}}
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn expansion(trigger:&str,text:&str)->Expansion{Expansion{id:"abcdef-123".into(),trigger:trigger.into(),text:text.into()}}
    #[test]
    fn profiles_are_bounded_and_never_accept_observed_input_or_commands(){
        let mut profile=Profile::default();profile.snippets.push(expansion(";sig","本地签名\nText"));assert!(validate(&profile).is_ok());
        for (trigger,text) in [("x","text"),(";a b","text"),(";x","\u{1b}"),(";x","")] {profile.snippets=vec![expansion(trigger,text)];assert!(validate(&profile).is_err());}
        profile.snippets=vec![expansion(";x",&"🙂".repeat(129))];assert!(validate(&profile).is_err());
        assert!(serde_json::from_value::<Action>(json!({"method":"start","script":"anything"})).is_err());
        profile.snippets.clear();profile.excluded_apps.push("../app".into());assert!(validate(&profile).is_err());
    }
    #[test]
    fn duplicate_triggers_and_future_storage_are_rejected(){
        let mut profile=Profile::default();profile.snippets=vec![expansion(";x","One"),Expansion{id:"fedcba".into(),trigger:";x".into(),text:"Two".into()}];assert!(validate(&profile).is_err());
        let root=std::env::temp_dir().join(format!("pinwall-input-rules-{}",crate::persistence::next_id()));std::fs::create_dir(&root).unwrap();let path=root.join("profile.json");
        assert!(read_profile(&path).unwrap().snippets.is_empty());std::fs::write(&path,r#"{"schemaVersion":99,"revision":1,"data":{}}"#).unwrap();assert_eq!(read_profile(&path).unwrap_err(),"widget_storage_future");std::fs::remove_dir_all(root).unwrap();
    }
    #[cfg(target_os="macos")]
    #[test]
    fn synthetic_prefix_state_machine_never_records_normal_typing(){unsafe extern "C" {fn pinwall_input_prefix_test()->i32;fn pinwall_input_scroll_test()->i32;}assert_eq!(unsafe{pinwall_input_prefix_test()},1);assert_eq!(unsafe{pinwall_input_scroll_test()},1);}
}
