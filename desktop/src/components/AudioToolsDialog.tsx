import { AudioRoutesPanel } from "./AudioRoutesPanel";
import { useEffect, useRef, useState } from "react";
import { NativeToolDialog, useToolController } from "./NativeToolDialog";
import { useI18n } from "../i18n";
import { audioRequest, mediaPlayers, mediaInfo, mediaControl, type AudioDevice, type AudioAction, type Player, type MediaInfo, type MediaControl } from "../services/widgetDesktop";
import { toolError } from "../services/widgetTools";

export function AudioToolsDialog({onClose}:{onClose:()=>void}) {
  const {t}=useI18n(),controller=useToolController(),running=useRef(false);
  const [devices,setDevices]=useState<AudioDevice[]>([]),[volumes,setVolumes]=useState<Record<string,string>>({});
  const [players,setPlayers]=useState<Player[]>([]),[player,setPlayer]=useState<Player|"">(""),[info,setInfo]=useState<MediaInfo|null>(null);
  const [busy,setBusy]=useState(true),[error,setError]=useState("");
  const apply=(list:AudioDevice[])=>{setDevices(list);setVolumes(Object.fromEntries(list.map(d=>[`${d.id}:${d.direction}`,d.volume===null?"":String(Math.round(d.volume*100))])));};
  useEffect(()=>{const signal=controller.current?.signal;if(!signal)return;setBusy(true);
    void Promise.allSettled([audioRequest({method:"list"},signal),mediaPlayers(signal)]).then(([audio,media])=>{
      if(signal.aborted)return;if(audio.status==="fulfilled")apply(audio.value.devices);else setError(toolError(audio.reason,t));
      if(media.status==="fulfilled"){setPlayers(media.value.players);setPlayer(media.value.players[0]??"");}else setError(toolError(media.reason,t));
      setBusy(false);
    });
  },[controller,t]);
  const run=async(task:(signal:AbortSignal)=>Promise<void>)=>{const signal=controller.current?.signal;if(!signal||signal.aborted||running.current)return;running.current=true;setBusy(true);setError("");
    try{await task(signal);}catch(failure){if(!signal.aborted)setError(toolError(failure,t));}finally{running.current=false;if(!signal.aborted)setBusy(false);}
  };
  const audio=(action:AudioAction)=>void run(async signal=>{const result=await audioRequest(action,signal);if(!signal.aborted)apply(result.devices);});
  const media=(action?:MediaControl)=>void run(async signal=>{if(!player)return;if(action)await mediaControl(player,action,signal);const result=await mediaInfo(player,signal);if(!signal.aborted)setInfo(result);});
  return <NativeToolDialog title={t.audio_title} description={t.audio_description} onClose={onClose}>
    <button className="btn-v2 btn-v2-secondary my-3" disabled={busy} onClick={()=>void run(async signal=>{const [audio,media]=await Promise.all([audioRequest({method:"list"},signal),mediaPlayers(signal)]);if(!signal.aborted){apply(audio.devices);setPlayers(media.players);setPlayer(current=>media.players.includes(current as Player)?current:media.players[0]??"");}})}>{t.desktop_refresh}</button>
    <ul className="space-y-3" aria-label={t.audio_devices}>{devices.map(device=>{const key=`${device.id}:${device.direction}`,percent=Number(volumes[key]);return <li key={key} className="rounded border border-gray-200 p-3">
      <p className="break-all font-medium">{device.name} · {device.direction==="input"?t.audio_input:t.audio_output}{device.isDefault?` · ${t.audio_default}`:""}</p>
      <div className="mt-2 flex flex-wrap items-end gap-2"><button className="btn-v2 btn-v2-secondary" disabled={busy||device.isDefault} onClick={()=>audio({method:"default",device:device.id,direction:device.direction})}>{t.audio_set_default}</button>
        {device.canMute&&<button className="btn-v2 btn-v2-secondary" disabled={busy} aria-pressed={device.muted??false} onClick={()=>audio({method:"mute",device:device.id,direction:device.direction,muted:!device.muted})}>{device.muted?t.audio_unmute:t.audio_mute}</button>}
      </div>
      {device.canVolume?<div className="mt-2 flex flex-wrap items-end gap-2"><label className="text-sm">{t.audio_volume} ({device.name} · {device.direction==="input"?t.audio_input:t.audio_output})<input className="form-input max-w-28" type="number" min={0} max={100} step={1} disabled={busy} value={volumes[key]??""} onChange={event=>setVolumes({...volumes,[key]:event.target.value})}/></label><button className="btn-v2 btn-v2-secondary" disabled={busy||!volumes[key]||!Number.isFinite(percent)||percent<0||percent>100} onClick={()=>audio({method:"volume",device:device.id,direction:device.direction,value:percent/100})}>{t.audio_apply_volume}</button></div>:<p className="mt-2 text-sm text-gray-600">{t.audio_hardware_volume}</p>}
    </li>;})}</ul>
    {!busy&&!devices.length&&<p className="text-sm">{t.audio_no_devices}</p>}
    <AudioRoutesPanel devices={devices}/>
    <h3 className="mt-5 font-medium">{t.audio_media}</h3><p className="my-2 text-sm text-gray-600">{t.audio_media_hint}</p>
    {players.length?<><label className="block text-sm">{t.audio_player}<select className="form-input" disabled={busy} value={player} onChange={e=>{setPlayer(e.target.value as Player);setInfo(null);}}>{players.map(p=><option key={p} value={p}>{p==="com.apple.Music"?"Music":"Spotify"}</option>)}</select></label>
      <div className="my-3 flex flex-wrap gap-2"><button className="btn-v2 btn-v2-secondary" disabled={busy} onClick={()=>media()}>{t.audio_read_media}</button>{(["previous","play","pause","next"] as const).map(action=><button key={action} className="btn-v2 btn-v2-secondary" disabled={busy} onClick={()=>media(action)}>{t[`audio_${action}`]}</button>)}</div>
      {info&&<div role="status" className="break-all text-sm"><p>{info.trackName||t.audio_no_track}</p><p>{info.artistName} · {info.albumName}</p><p>{info.isPlaying?t.audio_playing:t.audio_paused} · {Math.floor(info.position)} / {Math.floor(info.duration)}s</p></div>}
    </>:<p className="text-sm">{t.audio_no_player}</p>}
    {error&&<p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
  </NativeToolDialog>;
}
