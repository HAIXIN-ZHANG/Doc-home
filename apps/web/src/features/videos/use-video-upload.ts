'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fileHash, getStatus, parseStatus, request, sendMissingParts, uploadsPath, validateVideoFile } from './video-api';
import type { UploadStatus } from './video-api';
const resumable=(task: UploadStatus) => task.state==='CREATED' || task.state==='UPLOADING';
export function useVideoUpload(project: string, published: () => Promise<unknown>) {
  const key=`doc-home:video-upload:v1:${project}`;
  const [task,setTask]=useState<UploadStatus|null>(null);
  const [busy,setBusy]=useState(false),[checking,setChecking]=useState(false),[unknown,setUnknown]=useState(false),[message,setMessage]=useState('');
  const recovered=useRef<string|null>(null);
  const current=useRef<UploadStatus|null>(null), operation=useRef<AbortController|null>(null), mounted=useRef(false);
  const callback=useRef(published); useEffect(()=>{callback.current=published;},[published]);
  const remember=useCallback((status: UploadStatus) => {
    current.current=status; recovered.current=status.uploadId; setTask(status);
    try { localStorage.setItem(key,JSON.stringify({version:1,uploadId:status.uploadId})); }
    catch { setMessage('Upload continues, but this browser cannot save recovery information.'); }
  },[key]);
  const run=useCallback(async (work: (signal: AbortSignal)=>Promise<void>) => {
    if(operation.current) return;
    const controller=new AbortController(); operation.current=controller; setBusy(true); setMessage('');
    try { await work(controller.signal); }
    catch(error) { if(!controller.signal.aborted && mounted.current) { setUnknown(true); setMessage(error instanceof Error ? error.message : 'Check upload status before continuing.'); } }
    finally { if(operation.current===controller) { operation.current=null; if(mounted.current) {setBusy(false);setChecking(false);} } }
  },[]);
  const reconcile=useCallback(async (id: string, signal: AbortSignal) => {
    const status=await getStatus(project,id,signal); signal.throwIfAborted(); remember(status); setUnknown(false);
    if(status.state==='READY') { await callback.current(); setMessage(status.assetAvailable?'Video added.':'This video has been deleted.'); }
    else if(status.error) setMessage(status.error.message);
    return status;
  },[project,remember]);
  useEffect(()=>{
    mounted.current=true;
    let id: string|undefined;
    try { const stored=JSON.parse(localStorage.getItem(key)??'null') as {version?:number;uploadId?:string}|null; if(stored?.version===1 && /^[a-f0-9-]{36}$/i.test(stored.uploadId??'')) id=stored!.uploadId; }
    catch { /* Missing/blocked browser storage does not block viewing assets. */ }
    if(id) recovered.current=id;
    if(id) void run(async signal=>{ await reconcile(id!,signal); });
    return ()=>{mounted.current=false;operation.current?.abort();operation.current=null;};
  },[key,reconcile,run]);
  const check=useCallback(()=>run(async signal=>{
    const id=current.current?.uploadId??recovered.current;
    if(id) await reconcile(id,signal);
    else {await callback.current();setUnknown(false);setMessage('Videos refreshed. Review the list before starting again. An unconfirmed session expires automatically.');}
  }),[run,reconcile]);
  useEffect(()=>{
    if(task?.state!=='PROCESSING' || busy || unknown) return;
    const timer=setTimeout(()=>{if(document.visibilityState==='visible') void check();},1000);
    const foreground=()=>{if(document.visibilityState==='visible') void check();};
    document.addEventListener('visibilitychange',foreground);
    return ()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',foreground);};
  },[task,busy,unknown,check]);
  async function upload(file: File) {
    try { validateVideoFile(file); } catch(error) {setMessage((error as Error).message);return;}
    await run(async signal=>{
      let active=current.current ? await reconcile(current.current.uploadId,signal) : null;
      if(active && !resumable(active)) return;
      setChecking(true); const hash=await fileHash(file); signal.throwIfAborted(); setChecking(false);
      if(active && (active.fileSizeBytes!==file.size || active.expectedSha256!==hash)) {setMessage('This is a different file. Select the original video to resume.');return;}
      if(!active) {
        active=parseStatus(await (await request(uploadsPath(project),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:file.name,fileSizeBytes:file.size,mimeType:'video/mp4',expectedSha256:hash})},signal)).json(),project);
        signal.throwIfAborted();remember(active);
      }
      const id=active.uploadId;
      // Serialize progress GETs so an older snapshot cannot move the acknowledged count backwards.
      let progress=Promise.resolve();
      try {
        await sendMissingParts(project,active,file,signal,()=>{progress=progress.then(async ()=>{await reconcile(id,signal);});return progress;});
      } catch(error) { await reconcile(id,signal); throw error; }
      await request(`${uploadsPath(project,id)}/complete`,{method:'POST'},signal);
      await reconcile(id,signal);
    });
  }
  async function finish() {await run(async signal=>{
    if(!current.current) return;
    const active=await reconcile(current.current.uploadId,signal);
    if(!resumable(active)) return;
    await request(`${uploadsPath(project,active.uploadId)}/complete`,{method:'POST'},signal);await reconcile(active.uploadId,signal);
  });}
  async function cancel() {
    if(!current.current) return;
    const id=current.current.uploadId;
    operation.current?.abort();operation.current=null;
    await run(async signal=>{await request(uploadsPath(project,id),{method:'DELETE'},signal);await reconcile(id,signal);setMessage('Upload canceled.');});
  }
  function assetDeleted(assetId: string) {
    if(current.current?.state==='READY' && current.current.asset?.id===assetId) {
      remember({...current.current,assetAvailable:false,asset:null});setMessage('This video has been deleted.');
    }
  }
  function dismiss() {
    if(busy) return;setTask(null);current.current=null;recovered.current=null;setMessage('');setUnknown(false);
    try {localStorage.removeItem(key);} catch { /* Only recovery metadata is stored. */ }
  }
  return {task,busy,checking,unknown,message,upload,check,finish,cancel,dismiss,assetDeleted};
}
