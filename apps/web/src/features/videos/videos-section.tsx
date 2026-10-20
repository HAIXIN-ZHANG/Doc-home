'use client';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { css } from '../../../styled-system/css';
import { parseVideos, request } from './video-api';
import type { VideoAsset } from './video-api';
import { useVideoUpload } from './use-video-upload';
function VideoCard({video,disabled,onDelete}: {video:VideoAsset;disabled:boolean;onDelete:()=>void}) {
  const [failed,setFailed]=useState(false),[confirm,setConfirm]=useState(false);
  return <li className={css({rounded:'lg',borderWidth:'1px',borderColor:'border',overflow:'hidden',minW:'0'})}>
    <video controls playsInline preload="metadata" aria-label={video.name} src={`/api${video.contentUrl}`} onError={()=>setFailed(true)}
      className={css({w:'full',aspectRatio:'16 / 9',objectFit:'contain',bg:'black'})} />
    <div className={css({p:'4',display:'flex',flexDirection:'column',gap:'3'})}>
      <h3 className={css({fontWeight:'semibold',overflowWrap:'anywhere'})}>{video.name}</h3>
      <p className={css({textStyle:'small',color:'fg.muted'})}>MP4 · {(video.sizeBytes/1024/1024).toFixed(1)} MiB</p>
      {failed ? <p role="alert">This video could not be played. Your browser may not support its format, or the file may be unavailable.</p>:null}
      {confirm ? <div className={css({display:'flex',flexWrap:'wrap',gap:'3',alignItems:'center'})}>
        <p>Delete this video from the project?</p><Button visual="danger" disabled={disabled} onClick={onDelete}>Confirm delete</Button>
        <Button visual="secondary" disabled={disabled} onClick={()=>setConfirm(false)}>Keep video</Button>
      </div>:<Button visual="danger" disabled={disabled} aria-label={`Delete video ${video.name}`} onClick={()=>setConfirm(true)}>Delete</Button>}
    </div>
  </li>;
}
export function VideosSection({projectId,initialVideos=[]}: {projectId:string;initialVideos?:VideoAsset[]}) {
  const input=useRef<HTMLInputElement>(null);
  const client=useQueryClient(), queryKey=['project-videos',projectId];
  const [open,setOpen]=useState(false),[file,setFile]=useState<File|null>(null),[feedback,setFeedback]=useState(''),[needsRefresh,setNeedsRefresh]=useState(false);
  const query=useQuery({queryKey,initialData:initialVideos,retry:false,refetchOnMount:false,refetchOnWindowFocus:false,
    queryFn:async ({signal})=>parseVideos(await (await request(`/api/projects/${projectId}/assets`,{},signal)).json(),projectId)});
  const upload=useVideoUpload(projectId,()=>query.refetch({throwOnError:true}));
  const deletion=useMutation({retry:false,mutationFn:async (video:VideoAsset)=>{
    await client.cancelQueries({queryKey});
    await request(`/api/projects/${projectId}/assets/${video.id}`,{method:'DELETE'});
    upload.assetDeleted(video.id);
    client.setQueryData<VideoAsset[]>(queryKey,current=>current?.filter(item=>item.id!==video.id)??[]);
    await query.refetch({throwOnError:true});
  }});
  async function remove(video:VideoAsset) {
    setFeedback('');try {await deletion.mutateAsync(video);setFeedback('Video deleted.');}
    catch {setNeedsRefresh(true);setFeedback('The deletion or list refresh could not be confirmed. Refresh videos before trying again.');}
  }
  async function refresh() {
    try {await query.refetch({throwOnError:true});setNeedsRefresh(false);setFeedback('Videos refreshed.');}
    catch {setFeedback('Videos could not be refreshed. Try again.');}
  }
  const task=upload.task, pending=task?.state==='CREATED'||task?.state==='UPLOADING', terminal=task && ['READY','FAILED','CANCELED','EXPIRED'].includes(task.state);
  return <section aria-labelledby="videos-heading" className={css({display:'flex',flexDirection:'column',gap:'4',bg:'bg.surface',borderWidth:'1px',borderColor:'border',rounded:'xl',p:{mobile:'4',tablet:'6'},minW:'0'})}>
    <div className={css({display:'flex',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:'3'})}>
      <h2 id="videos-heading" className={css({textStyle:'heading'})}>Videos <span className={css({textStyle:'small',color:'fg.muted'})}>({query.data.length})</span></h2>
      <Button visual="secondary" disabled={!open && (upload.busy || (!!task && !pending))} onClick={()=>{setOpen(value=>!value);setFile(null);}}>{open?'Hide upload':pending?'Resume upload':'+ Add video'}</Button>
    </div>
    <p className={css({textStyle:'small',color:'fg.muted'})}>MP4 up to 20 MiB. Keep the original file to resume an interrupted upload.</p>
    {open ? <form aria-label="Upload project video" onSubmit={event=>{event.preventDefault();if(file) void upload.upload(file);}} className={css({display:'flex',flexDirection:'column',gap:'3',minW:'0'})}>
      <label htmlFor={`video-file-${projectId}`} className={css({textStyle:'label'})}>Choose video</label>
      <input id={`video-file-${projectId}`} ref={input} type="file" accept="video/mp4,.mp4" disabled={upload.busy || !!terminal}
        onChange={event=>setFile(event.target.files?.[0]??null)} className={css({display:'none'})}/>
      <div className={css({display:'flex',flexWrap:'wrap',gap:'3',alignItems:'center',minW:'0'})}>
        <Button visual="secondary" disabled={upload.busy || !!terminal} aria-describedby={`selected-video-${projectId}`} onClick={()=>input.current?.click()}>Choose file</Button>
        <span id={`selected-video-${projectId}`} aria-live="polite" className={css({textStyle:'small',color:'fg.muted',overflowWrap:'anywhere',minW:'0'})}>{file?.name??'No file selected'}</span>
      </div>
      <div className={css({display:'flex',flexWrap:'wrap',gap:'3'})}>
        <Button type="submit" disabled={!file || upload.busy || upload.unknown || !!terminal || task?.state==='PROCESSING'}>{upload.checking?'Checking your file…':upload.busy?'Uploading…':pending?'Resume video upload':'Upload video'}</Button>
      </div>
    </form>:null}
    {task ? <div aria-label="Video upload task" className={css({bg:'bg.canvas',rounded:'lg',p:'4',display:'flex',flexDirection:'column',gap:'3',minW:'0'})}>
      <p className={css({fontWeight:'semibold',overflowWrap:'anywhere'})}>{task.fileName}</p>
      <p role="status">{upload.unknown?'Upload status unknown':task.state==='PROCESSING'?'100% transferred · Finalizing video…':task.state==='READY'?(task.assetAvailable?'Video added':'Video deleted'):pending?`${task.uploadPercent}% uploaded`:task.state.toLowerCase()}</p>
      {pending ? <progress max={100} value={task.uploadPercent} aria-label="Acknowledged video upload" className={css({w:'full'})}/>:null}
      <div className={css({display:'flex',flexWrap:'wrap',gap:'3'})}>
        {pending ? <Button visual="secondary" onClick={()=>{void upload.cancel();}}>Cancel upload</Button>:null}
        {pending && task.uploadPercent===100 ? <Button disabled={upload.busy||upload.unknown} onClick={()=>{void upload.finish();}}>Finish upload</Button>:null}
        {terminal ? <Button visual="secondary" disabled={upload.busy} onClick={()=>{upload.dismiss();setFile(null);setOpen(false);}}>Dismiss upload</Button>:null}
      </div>
    </div>:null}
    {upload.message ? <p role="status" className={css({textStyle:'small',overflowWrap:'anywhere'})}>{upload.message}</p>:null}
    {upload.unknown ? <Button visual="secondary" disabled={upload.busy} onClick={()=>{void upload.check();}}>Check upload status</Button>:null}
    {feedback ? <p role="status">{feedback}</p>:null}
    {needsRefresh || query.isError ? <Button visual="secondary" disabled={deletion.isPending||query.isFetching} onClick={()=>{void refresh();}}>Refresh videos</Button>:null}
    {query.data.length ? <ul aria-label="Project videos" className={css({display:'grid',gridTemplateColumns:{mobile:'minmax(0,1fr)',tablet:'repeat(2,minmax(0,1fr))'},gap:'4'})}>
      {query.data.map(video=><VideoCard key={video.id} video={video} disabled={deletion.isPending||query.isFetching||needsRefresh} onDelete={()=>{void remove(video);}}/>)}
    </ul>:<p className={css({textStyle:'small',color:'fg.muted'})}>No videos yet. Upload a project walkthrough.</p>}
  </section>;
}
