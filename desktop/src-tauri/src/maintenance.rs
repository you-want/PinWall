//! Optional maintenance: opaque native plans and fixed Homebrew commands. No shell or elevation.
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
use std::{path::PathBuf,sync::{Arc,Mutex,atomic::{AtomicU64,Ordering}},time::{Duration,Instant}};
use tauri::Manager;
pub const WIDGET_ID:&str="com.pinwall.maintenance";
const MAX_OUTPUT:usize=1024*1024;
#[derive(Clone,Default)]
pub struct MaintenanceService{operations:Arc<Mutex<()>>,generation:Arc<AtomicU64>,brew_plan:Arc<Mutex<Option<BrewPlan>>>,#[cfg(target_os="macos")]child:Arc<Mutex<Option<std::process::Child>>>}
#[derive(Clone)]struct BrewPlan{token:String,formula:Formula,program:PathBuf,created:Instant}
#[derive(Clone,Debug,Serialize,PartialEq)]struct Formula{name:String,version:String}
#[derive(Debug,Deserialize,Serialize)]
#[serde(tag="method",rename_all="camelCase",deny_unknown_fields)]
pub enum Action{Apps{},Caches{},Processes{},Restore{},Prepare{token:String,caches:bool,preferences:bool},Execute{plan:String},PrepareProcess{token:String,force:bool},Signal{plan:String},BrewList{},BrewPrepare{name:String},BrewExecute{plan:String}}
fn formula_name(name:&str)->bool{!name.is_empty()&&name.len()<=128&&name.as_bytes()[0].is_ascii_alphanumeric()&&name.bytes().all(|c|c.is_ascii_alphanumeric()||matches!(c,b'@'|b'+'|b'.'|b'_'|b'-'))}
fn validate(action:&Action)->Result<(),String>{let token=match action{Action::Prepare{token,..}|Action::PrepareProcess{token,..}=>Some(token),Action::Execute{plan}|Action::Signal{plan}|Action::BrewExecute{plan}=>Some(plan),Action::BrewPrepare{name}=>return if formula_name(name){Ok(())}else{Err("maintenance_invalid".into())},_=>None};if token.is_some_and(|v|v.is_empty()||v.len()>64||!v.bytes().all(|c|c.is_ascii_hexdigit()||c==b'-')){return Err("maintenance_invalid".into());}Ok(())}
fn parse_formulae(output:&[u8])->Result<Vec<Formula>,String>{if output.len()>MAX_OUTPUT{return Err("maintenance_limit".into());}let text=std::str::from_utf8(output).map_err(|_|"maintenance_brew_failed")?;let mut result=Vec::new();for line in text.lines().filter(|l|!l.trim().is_empty()){let mut columns=line.split_whitespace();let name=columns.next().ok_or("maintenance_brew_failed")?;if !formula_name(name){return Err("maintenance_brew_failed".into());}let version=columns.collect::<Vec<_>>().join(" ");if version.is_empty()||version.len()>256||!version.bytes().all(|c|c.is_ascii_graphic()||c==b' ')||result.iter().any(|f:&Formula|f.name==name){return Err("maintenance_brew_failed".into());}result.push(Formula{name:name.into(),version});if result.len()>1000{return Err("maintenance_limit".into());}}Ok(result)}
#[cfg(target_os="macos")]
fn epoch()->u64{unsafe extern "C"{fn pinwall_maintenance_generation()->u64;}unsafe{pinwall_maintenance_generation()}}
#[cfg(not(target_os="macos"))]
fn epoch()->u64{0}
fn brew_program()->Result<PathBuf,String>{
    for path in ["/opt/homebrew/bin/brew","/usr/local/bin/brew"]{let Ok(path)=std::fs::canonicalize(path)else{continue};if ["/opt/homebrew/Homebrew/bin/brew","/opt/homebrew/bin/brew","/usr/local/Homebrew/bin/brew"].iter().any(|expected|path==PathBuf::from(expected))&&std::fs::metadata(&path).is_ok_and(|m|m.is_file()){return Ok(path);}}
    Err("maintenance_brew_missing".into())
}
impl MaintenanceService{
    pub fn uninstall(&self)->Result<(),String>{self.clear()?;
        #[cfg(target_os="macos")]unsafe{unsafe extern "C"{fn pinwall_maintenance_forget();}pinwall_maintenance_forget();}Ok(())
    }
    fn check(&self,generation:u64)->Result<(),String>{if self.generation.load(Ordering::SeqCst)==generation{Ok(())}else{Err("tool_cancelled".into())}}
    pub fn clear(&self)->Result<(),String>{self.generation.fetch_add(1,Ordering::SeqCst);#[cfg(target_os="macos")]unsafe{unsafe extern "C"{fn pinwall_maintenance_clear();}pinwall_maintenance_clear();}*self.brew_plan.lock().map_err(|_|"maintenance_unavailable")?=None;self.terminate()}
    fn terminate(&self)->Result<(),String>{#[cfg(target_os="macos")]{let mut guard=self.child.lock().map_err(|_|"maintenance_unavailable")?;if let Some(mut child)=guard.take(){if child.try_wait().map_err(|_|"maintenance_unavailable")?.is_none()&&unsafe{libc::kill(-(child.id() as i32),libc::SIGKILL)}!=0{*guard=Some(child);return Err("maintenance_unavailable".into());}child.wait().map_err(|_|"maintenance_unavailable")?;}}Ok(())}
    #[cfg(target_os="macos")]
    fn brew(&self,program:&std::path::Path,args:&[&str],generation:u64)->Result<Vec<u8>,String>{
        use std::{io::Read,os::fd::AsRawFd,process::{Command,Stdio},os::unix::process::CommandExt};
        self.check(generation)?;let mut stdout={let mut guard=self.child.lock().map_err(|_|"maintenance_unavailable")?;self.check(generation)?;
            let mut child=Command::new(program).process_group(0).args(args).env("HOMEBREW_NO_AUTO_UPDATE","1").env("HOMEBREW_NO_ANALYTICS","1").env("HOMEBREW_NO_ENV_HINTS","1").env("HOMEBREW_NO_INSTALL_CLEANUP","1").stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().map_err(|_|"maintenance_brew_failed")?;
            let stdout=child.stdout.take();*guard=Some(child);stdout.ok_or("maintenance_brew_failed")?};
        let fd=stdout.as_raw_fd();if unsafe{libc::fcntl(fd,libc::F_SETFL,libc::O_NONBLOCK)}<0{self.terminate()?;return Err("maintenance_brew_failed".into());}
        let started=Instant::now();let result:Result<Vec<u8>,String>=(||{let mut output=Vec::new();loop{
            self.check(generation)?;if started.elapsed()>Duration::from_secs(120){return Err("maintenance_timeout".into());}
            let mut buffer=[0u8;8192];loop{match stdout.read(&mut buffer){Ok(0)=>break,Ok(count)=>{output.extend_from_slice(&buffer[..count]);if output.len()>MAX_OUTPUT{return Err("maintenance_limit".into());}},Err(e)if e.kind()==std::io::ErrorKind::WouldBlock=>break,Err(_)=>return Err("maintenance_brew_failed".into())}}
            let status={let mut guard=self.child.lock().map_err(|_|"maintenance_unavailable")?;guard.as_mut().ok_or("tool_cancelled")?.try_wait().map_err(|_|"maintenance_brew_failed")?};
            if let Some(status)=status{if !status.success(){return Err("maintenance_brew_failed".into());}return Ok(output);}std::thread::sleep(Duration::from_millis(50));
        }})();let cleanup=self.terminate();result.and_then(|output|{cleanup?;Ok(output)})
    }
    #[cfg(not(target_os="macos"))]
    fn brew(&self,_:&std::path::Path,_:&[&str],_:u64)->Result<Vec<u8>,String>{Err("desktop_unsupported".into())}
}
#[tauri::command]
pub async fn widget_maintenance_request(window:tauri::WebviewWindow,app:tauri::AppHandle,action:Action)->Result<Value,String>{
    crate::metrics::require_main(window.label())?;crate::widgets::verify_native_tool(&app,WIDGET_ID)?;validate(&action)?;
    let state=app.state::<MaintenanceService>().inner().clone();let generation=state.generation.load(Ordering::SeqCst);let epoch=epoch();
    tauri::async_runtime::spawn_blocking(move||{let _guard=state.operations.try_lock().map_err(|_|"maintenance_busy")?;state.check(generation)?;
        match action{
            Action::BrewList{}=>{let program=brew_program()?;let formulae=parse_formulae(&state.brew(&program,&["list","--formula","--versions"],generation)?)?;Ok(json!({"items":formulae}))},
            Action::BrewPrepare{name}=>{let program=brew_program()?;let formulae=parse_formulae(&state.brew(&program,&["list","--formula","--versions"],generation)?)?;let formula=formulae.into_iter().find(|f|f.name==name).ok_or("maintenance_changed")?;
                let token=format!("{}-{}",std::process::id(),crate::persistence::next_id());*state.brew_plan.lock().map_err(|_|"maintenance_unavailable")?=Some(BrewPlan{token:token.clone(),formula:formula.clone(),program,created:Instant::now()});Ok(json!({"kind":"brew","plan":token,"name":formula.name,"version":formula.version}))},
            Action::BrewExecute{plan}=>{let current=state.brew_plan.lock().map_err(|_|"maintenance_unavailable")?.take().filter(|p|p.token==plan&&p.created.elapsed()<Duration::from_secs(120)).ok_or("maintenance_expired")?;
                if brew_program()?!=current.program{return Err("maintenance_changed".into());}let installed=parse_formulae(&state.brew(&current.program,&["list","--formula","--versions"],generation)?)?;if !installed.contains(&current.formula){return Err("maintenance_changed".into());}state.check(generation)?;
                state.brew(&current.program,&["uninstall","--formula",&current.formula.name],generation)?;Ok(json!({"kind":"brewRemoved","name":current.formula.name}))},
            action=>{let mut request=serde_json::to_value(action).map_err(|_|"maintenance_invalid")?;request["domain"]=json!("maintenance");request["epoch"]=json!(epoch);let value=crate::desktop_tools::native(&request)?;state.check(generation)?;Ok(value)}
        }
    }).await.map_err(|_|"maintenance_unavailable".to_string())?
}
#[cfg(test)]mod tests{use super::*;
#[test]fn rejects_arbitrary_paths_commands_and_unbounded_identities(){for value in [json!({"method":"apps","path":"/"}),json!({"method":"execute","plan":"a","command":"rm"}),json!({"method":"signal","pid":1}),json!({"method":"brewExecute","name":"test"})]{assert!(serde_json::from_value::<Action>(value).is_err());}for name in ["--force","a;echo x","../x","a/b","a b",""]{assert!(!formula_name(name));}assert!(formula_name("python@3.13"));assert!(validate(&Action::Execute{plan:"../escape".into()}).is_err());}
#[test]fn formula_inventory_is_bounded_and_pins_exact_versions(){assert_eq!(parse_formulae(b"ffmpeg 7.1_2\npython@3.13 3.13.1 3.13.2\n").unwrap().len(),2);for bytes in [b"foo\n".as_slice(),b"--force 1\n",b"foo 1\nfoo 2\n",b"foo \xff\n"]{assert!(parse_formulae(bytes).is_err());}}
#[cfg(target_os="macos")]
#[test]fn native_boundaries_exclude_system_nested_paths_and_self_without_side_effects(){unsafe extern "C"{fn pinwall_maintenance_boundaries_test()->i32;fn pinwall_maintenance_file_fixture_test()->i32;}assert_eq!(unsafe{pinwall_maintenance_boundaries_test()},1);assert_eq!(unsafe{pinwall_maintenance_file_fixture_test()},1);}
#[test]fn clearing_invalidates_queued_work(){let service=MaintenanceService::default();let generation=service.generation.load(Ordering::SeqCst);service.clear().unwrap();assert!(service.check(generation).is_err());}
#[cfg(target_os="macos")]
#[test]
#[ignore="Read-only installed application and current-user process inventory; no signals, Trash or brew"]
fn native_inventory_smoke(){
    for method in ["apps","processes"]{let value=crate::desktop_tools::native(&json!({"domain":"maintenance","method":method,"epoch":epoch()})).unwrap();assert!(value["truncated"].is_boolean());assert!(value["canRestore"].is_boolean());let items=value["items"].as_array().unwrap();assert!(items.len()<=250);for item in items{assert!(item["token"].as_str().is_some_and(|t|t.len()==36));assert!(item["name"].is_string());if method=="processes"{assert!(item["pid"].as_u64().unwrap()>1);}}}
}

}
