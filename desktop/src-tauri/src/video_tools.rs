//! User-selected local video snapshots and explicit silent primary-display recording.
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
use std::{fs,path::PathBuf,sync::{Arc,Mutex,atomic::{AtomicBool,AtomicU64,Ordering}},time::{Duration,Instant}};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
pub const WIDGET_ID:&str="com.pinwall.video-tools";
const MAX_BYTES:u64=512*1024*1024;
#[derive(Clone,Default)]
pub struct VideoService { operation:Arc<Mutex<()>>,selected:Arc<Mutex<Option<Arc<Selected>>>>,generation:Arc<AtomicU64>,recording:Arc<AtomicBool>,stopping:Arc<AtomicBool>,#[cfg(target_os="macos")]child:Arc<Mutex<Option<std::process::Child>>> }
struct JobDir(PathBuf);
impl Drop for JobDir {fn drop(&mut self){if fs::remove_dir_all(&self.0).is_err(){eprintln!("[VideoTools] Private temporary cleanup failed");}}}
struct Selected {dir:JobDir,path:PathBuf,original:Option<PathBuf>,created:Instant,info:VideoInfo}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct VideoInfo {token:String,duration:f64,width:u32,height:u32,has_audio:bool,bytes:u64}
#[derive(Clone,Debug,Deserialize,Serialize)]
#[serde(rename_all="lowercase")]
pub enum Format {Mp4,Mov}
impl Format {fn extension(&self)->&'static str{match self{Self::Mp4=>"mp4",Self::Mov=>"mov"}}}
#[derive(Debug,Deserialize)]
#[serde(tag="method",rename_all="camelCase",deny_unknown_fields)]
pub enum Action {Select{},Status{},Cancel{},StopRecording{},Record{seconds:u32},Export{token:String,start:f64,end:f64,resolution:u32,muted:bool,format:Format},SaveRecording{token:String}}
fn validate(action:&Action)->Result<(),String>{match action{
    Action::Record{seconds} if !(1..=300).contains(seconds)=>Err("video_limit".into()),
    Action::Export{token,start,end,resolution,..}=>{if token.is_empty()||token.len()>64||!token.bytes().all(|v|v.is_ascii_digit()||v==b'-')||!start.is_finite()||!end.is_finite()||*start<0.0||end-start<0.1||end-start>600.0||![480,720,1080].contains(resolution){Err("video_invalid_range".into())}else{Ok(())}},
    _=>Ok(())}}
#[cfg(target_os="macos")]
fn native_epoch()->u64{unsafe extern "C"{fn pinwall_video_generation()->u64;}unsafe{pinwall_video_generation()}}
#[cfg(not(target_os="macos"))]
fn native_epoch()->u64{0}
impl VideoService {
    pub fn clear(&self)->Result<(),String>{self.generation.fetch_add(1,Ordering::SeqCst);#[cfg(target_os="macos")]unsafe{unsafe extern "C"{fn pinwall_video_clear();}pinwall_video_clear();}self.terminate()?;*self.selected.lock().map_err(|_|"video_unavailable")?=None;Ok(())}
    fn check(&self,generation:u64)->Result<(),String>{if generation!=self.generation.load(Ordering::SeqCst){Err("tool_cancelled".into())}else{Ok(())}}
    fn terminate(&self)->Result<(),String>{
        #[cfg(target_os="macos")]{let mut guard=self.child.lock().map_err(|_|"video_unavailable")?;if let Some(mut child)=guard.take(){if child.try_wait().map_err(|_|"video_unavailable")?.is_none()&&child.kill().is_err(){*guard=Some(child);return Err("video_unavailable".into());}child.wait().map_err(|_|"video_unavailable")?;}}
        self.recording.store(false,Ordering::SeqCst);Ok(())
    }
    fn selected(&self,token:&str)->Result<Arc<Selected>,String>{self.selected.lock().map_err(|_|"video_unavailable")?.as_ref().filter(|s|s.info.token==token&&s.created.elapsed()<Duration::from_secs(600)).cloned().ok_or("video_expired".into())}
    fn job(&self,app:&tauri::AppHandle)->Result<JobDir,String>{
        // This method only runs under the operation lock. Drop the old snapshot first.
        *self.selected.lock().map_err(|_|"video_unavailable")?=None;
        let root=crate::tool_files::private_dir(&crate::tool_files::storage_root(app)?,"video-tools")?;
        for entry in fs::read_dir(&root).map_err(|_|"tool_io_failed")?{let entry=entry.map_err(|_|"tool_io_failed")?;if !entry.file_name().to_string_lossy().starts_with("job-"){continue;}let metadata=fs::symlink_metadata(entry.path()).map_err(|_|"tool_io_failed")?;if metadata.is_dir()&&!metadata.file_type().is_symlink(){fs::remove_dir_all(entry.path()).map_err(|_|"tool_io_failed")?;}}
        Ok(JobDir(crate::tool_files::private_dir(&root,&format!("job-{}-{}",std::process::id(),crate::persistence::next_id()))?))
    }
    fn adopt(&self,dir:JobDir,path:PathBuf,original:Option<PathBuf>,generation:u64,epoch:u64)->Result<Value,String>{
        let bytes=fs::metadata(&path).map_err(|_|"video_invalid")?.len();if bytes==0||bytes>MAX_BYTES{return Err("video_limit".into());}
        let result=crate::desktop_tools::native(&json!({"domain":"video","method":"inspect","path":path,"epoch":epoch}))?;
        let info=VideoInfo{token:format!("{}-{}",std::process::id(),crate::persistence::next_id()),duration:result["duration"].as_f64().ok_or("video_invalid")?,width:result["width"].as_u64().and_then(|v|u32::try_from(v).ok()).ok_or("video_invalid")?,height:result["height"].as_u64().and_then(|v|u32::try_from(v).ok()).ok_or("video_invalid")?,has_audio:result["hasAudio"].as_bool().ok_or("video_invalid")?,bytes};
        let mut selected=self.selected.lock().map_err(|_|"video_unavailable")?;self.check(generation)?;*selected=Some(Arc::new(Selected{dir,path,original,created:Instant::now(),info:info.clone()}));Ok(json!({"kind":"selected","video":info}))
    }
    #[cfg(target_os="macos")]
    fn record(&self,app:&tauri::AppHandle,seconds:u32,generation:u64,epoch:u64)->Result<Value,String>{
        crate::desktop_tools::native(&json!({"domain":"video","method":"capturePermission","epoch":epoch}))?;
        let dir=self.job(app)?;let path=dir.0.join("recording.mov");self.check(generation)?;
        {let mut child=self.child.lock().map_err(|_|"video_unavailable")?;self.check(generation)?;self.stopping.store(false,Ordering::SeqCst);
            *child=Some(std::process::Command::new("/usr/sbin/screencapture").args(["-v","-m","-x","-V",&seconds.to_string()]).arg(&path).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).spawn().map_err(|_|"video_record_failed")?);self.recording.store(true,Ordering::SeqCst);}
        let begun=Instant::now();let mut stopping_at=None;let result:Result<(),String>=(||{loop{
            self.check(generation)?;if self.stopping.load(Ordering::SeqCst)&&stopping_at.is_none(){stopping_at=Some(Instant::now());}
            if begun.elapsed()>Duration::from_secs(seconds as u64+15)||stopping_at.is_some_and(|t:Instant|t.elapsed()>Duration::from_secs(10)){return Err("video_timeout".into());}
            if fs::metadata(&path).is_ok_and(|m|m.len()>MAX_BYTES){return Err("video_limit".into());}
            let status={let mut guard=self.child.lock().map_err(|_|"video_unavailable")?;guard.as_mut().ok_or("tool_cancelled")?.try_wait().map_err(|_|"video_record_failed")?};
            if let Some(status)=status{if !status.success()&&!self.stopping.load(Ordering::SeqCst){return Err("video_record_failed".into());}break;}
            std::thread::sleep(Duration::from_millis(100));
        }Ok(())})();
        let cleanup=self.terminate();result?;cleanup?;self.check(generation)?;self.adopt(dir,path,None,generation,epoch)
    }
}
fn open_source(path:&std::path::Path)->Result<fs::File,String>{
    let mut options=fs::OpenOptions::new();options.read(true);
    #[cfg(target_os="macos")]{use std::os::unix::fs::OpenOptionsExt;options.custom_flags(libc::O_NOFOLLOW|libc::O_NONBLOCK);}
    let file=options.open(path).map_err(|_|"tool_unsafe_path")?;let metadata=file.metadata().map_err(|_|"tool_io_failed")?;
    if !metadata.is_file(){return Err("tool_unsafe_path".into());}if metadata.len()>MAX_BYTES{return Err("video_limit".into());}Ok(file)
}
#[tauri::command]
pub async fn widget_video_request(window:tauri::WebviewWindow,app:tauri::AppHandle,action:Action)->Result<Value,String>{
    crate::metrics::require_main(window.label())?;crate::widgets::verify_native_tool(&app,WIDGET_ID)?;validate(&action)?;
    let state=app.state::<VideoService>().inner().clone();let generation=state.generation.load(Ordering::SeqCst);let epoch=native_epoch();
    tauri::async_runtime::spawn_blocking(move||{
        if matches!(action,Action::Cancel{}){state.clear()?;return Ok(json!({"kind":"cancelled"}));}
        if matches!(action,Action::Status{}){let native=crate::desktop_tools::native(&json!({"domain":"video","method":"status"}))?;return Ok(json!({"kind":"status","recording":state.recording.load(Ordering::SeqCst),"busy":native["busy"],"progress":native["progress"]}));}
        if matches!(action,Action::StopRecording{}){
            #[cfg(target_os="macos")]{let mut child=state.child.lock().map_err(|_|"video_unavailable")?;if let Some(child)=child.as_mut(){if child.try_wait().map_err(|_|"video_record_failed")?.is_none(){let pid=i32::try_from(child.id()).map_err(|_|"video_unavailable")?;if unsafe{libc::kill(pid,libc::SIGINT)}!=0{return Err("video_record_failed".into());}state.stopping.store(true,Ordering::SeqCst);}}else{state.generation.fetch_add(1,Ordering::SeqCst);}}
            return Ok(json!({"kind":"stopping"}));
        }
        let _guard=state.operation.try_lock().map_err(|_|"video_busy")?;state.check(generation)?;
        match action {
            Action::Select{}=>{
                let Some(file)=app.dialog().file().add_filter("MP4 / MOV / M4V",&["mp4","mov","m4v"]).blocking_pick_file() else{return Ok(json!({"kind":"cancelled"}));};state.check(generation)?;
                let original=crate::image_tools::safe_path(&file.into_path().map_err(|_|"tool_unsafe_path")?)?;
                let extension=original.extension().and_then(|v|v.to_str()).unwrap_or("").to_ascii_lowercase();if !["mp4","mov","m4v"].contains(&extension.as_str()){return Err("video_format".into());}
                let metadata=fs::symlink_metadata(&original).map_err(|_|"tool_io_failed")?;if !metadata.is_file()||metadata.len()>MAX_BYTES{return Err("video_limit".into());}
                let dir=state.job(&app)?;let path=dir.0.join(format!("input.{extension}"));let input=open_source(&original)?;
                crate::tool_files::atomic_export_cancellable(&path,input,MAX_BYTES,||state.check(generation).is_err())?;
                state.adopt(dir,path,Some(original),generation,epoch)
            },
            Action::Record{seconds}=>{
                #[cfg(target_os="macos")]{state.record(&app,seconds,generation,epoch)}
                #[cfg(not(target_os="macos"))]{let _=seconds;Err("desktop_unsupported".into())}
            },
            Action::Export{token,start,end,resolution,muted,format}=>{
                let selected=state.selected(&token)?;if end>selected.info.duration+0.001{return Err("video_invalid_range".into());}
                let extension=format.extension();let Some(file)=app.dialog().file().set_file_name(format!("pinwall-video.{extension}")).add_filter(extension,&[extension]).blocking_save_file()else{return Ok(json!({"kind":"cancelled"}));};state.check(generation)?;
                let destination=crate::tool_files::export_destination(&app,&file.into_path().map_err(|_|"tool_unsafe_path")?)?;
                if selected.original.as_ref()==Some(&destination){return Err("video_original".into());}if destination.extension().and_then(|v|v.to_str()).is_none_or(|v|!v.eq_ignore_ascii_case(extension)){return Err("video_format".into());}
                let output=selected.dir.0.join(format!("export-{}.{extension}",crate::persistence::next_id()));
                let result=(||{crate::desktop_tools::native(&json!({"domain":"video","method":"export","path":selected.path,"output":output,"start":start,"end":end,"resolution":resolution.to_string(),"muted":muted,"format":extension,"epoch":epoch}))?;state.check(generation)?;
                    let bytes=crate::tool_files::atomic_export_cancellable(&destination,fs::File::open(&output).map_err(|_|"video_export_failed")?,MAX_BYTES,||state.check(generation).is_err())?;Ok(json!({"kind":"exported","bytes":bytes}))})();
                if output.exists()&&fs::remove_file(output).is_err(){eprintln!("[VideoTools] Export temporary cleanup failed");}result
            },
            Action::SaveRecording{token}=>{
                let selected=state.selected(&token)?;if selected.original.is_some(){return Err("video_invalid".into());}
                let Some(file)=app.dialog().file().set_file_name("pinwall-recording.mov").add_filter("MOV",&["mov"]).blocking_save_file()else{return Ok(json!({"kind":"cancelled"}));};state.check(generation)?;
                let destination=crate::tool_files::export_destination(&app,&file.into_path().map_err(|_|"tool_unsafe_path")?)?;
                if destination.extension().and_then(|v|v.to_str()).is_none_or(|v|!v.eq_ignore_ascii_case("mov")){return Err("video_format".into());}
                let bytes=crate::tool_files::atomic_export_cancellable(&destination,fs::File::open(&selected.path).map_err(|_|"video_expired")?,MAX_BYTES,||state.check(generation).is_err())?;Ok(json!({"kind":"exported","bytes":bytes}))
            },
            _=>Err("video_invalid".into()),
        }
    }).await.map_err(|_|"video_unavailable".to_string())?
}
#[cfg(test)]mod tests{use super::*;
#[test]fn rejects_paths_scripts_and_unbounded_work(){for action in [json!({"method":"select","path":"/tmp/private"}),json!({"method":"record","seconds":30,"audio":true}),json!({"method":"export","token":"t","start":0,"end":1,"resolution":720,"muted":true,"format":"shell"})]{assert!(serde_json::from_value::<Action>(action).is_err());}for seconds in [0,301,u32::MAX]{assert!(validate(&Action::Record{seconds}).is_err());}for(start,end,resolution)in[(0.0,0.01,720),(-1.0,5.0,720),(0.0,601.0,720),(0.0,1.0,800),(f64::NAN,1.0,720)]{assert!(validate(&Action::Export{token:"1-2".into(),start,end,resolution,muted:true,format:Format::Mp4}).is_err());}}
#[test]fn clear_invalidates_queued_work_and_tokens(){let service=VideoService::default();let generation=service.generation.load(Ordering::SeqCst);service.clear().unwrap();assert_eq!(service.check(generation).unwrap_err(),"tool_cancelled");assert!(service.selected("old").is_err());}
#[cfg(target_os="macos")]
#[test]
#[ignore="Encodes only generated color frames in a private temporary directory; no screen/audio capture"]
fn native_synthetic_video_trim_export_and_cancellation(){
    use std::ffi::CString;
    let root=std::env::temp_dir().join(format!("pinwall-video-test-{}-{}",std::process::id(),crate::persistence::next_id()));fs::create_dir(&root).unwrap();let dir=JobDir(root);let source=dir.0.join("fixture.mov");
    unsafe extern "C"{fn pinwall_video_fixture(path:*const std::ffi::c_char)->i32;}
    let path=CString::new(source.to_str().unwrap()).unwrap();assert_eq!(unsafe{pinwall_video_fixture(path.as_ptr())},1);
    let epoch=native_epoch();let info=crate::desktop_tools::native(&json!({"domain":"video","method":"inspect","path":source,"epoch":epoch})).unwrap();assert_eq!(info["width"],320);assert_eq!(info["height"],240);assert_eq!(info["hasAudio"],false);assert!((info["duration"].as_f64().unwrap()-2.0).abs()<0.1);
    let output=dir.0.join("trimmed.mp4");crate::desktop_tools::native(&json!({"domain":"video","method":"export","path":source,"output":output,"epoch":epoch,"start":0.5,"end":1.5,"resolution":"480","muted":true,"format":"mp4"})).unwrap();
    let trimmed=crate::desktop_tools::native(&json!({"domain":"video","method":"inspect","path":output,"epoch":epoch})).unwrap();assert!((trimmed["duration"].as_f64().unwrap()-1.0).abs()<0.1);assert!(fs::metadata(output).unwrap().len()>0);
    VideoService::default().clear().unwrap();assert_eq!(crate::desktop_tools::native(&json!({"domain":"video","method":"inspect","path":source,"epoch":epoch})).unwrap_err(),"tool_cancelled");
}

}
