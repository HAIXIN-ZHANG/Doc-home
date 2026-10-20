export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
export interface VideoAsset { id: string; projectId: string; type: 'video'; name: string; mimeType: 'video/mp4'; sizeBytes: number; contentUrl: string; createdAt: string }
export type UploadState = 'CREATED' | 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED' | 'CANCELED' | 'EXPIRED';
export interface UploadStatus {
  uploadId: string; state: UploadState; fileName: string; fileSizeBytes: number; expectedSha256: string; chunkSizeBytes: number; totalParts: number;
  receivedParts: { partNumber: number; sizeBytes: number; sha256: string }[]; receivedBytes: number; uploadPercent: number; expiresAt: string;
  assetAvailable: boolean; asset: VideoAsset | null; error: {code: string; message: string} | null;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uploadsPath = (project: string, id?: string) => `/api/projects/${encodeURIComponent(project)}/uploads${id ? `/${encodeURIComponent(id)}` : ''}`;
export function parseVideo(value: unknown, project: string): VideoAsset {
  const item=value as Partial<VideoAsset> | null;
  if (!item || !uuid.test(item.id ?? '') || item.projectId!==project || item.type!=='video' || typeof item.name!=='string' || item.mimeType!=='video/mp4' || !Number.isSafeInteger(item.sizeBytes) || item.sizeBytes!<1 || item.sizeBytes!>MAX_VIDEO_BYTES || typeof item.createdAt!=='string' || item.contentUrl!==`/projects/${project}/assets/${item.id}/content`) throw new Error('Invalid video response. Refresh videos.');
  return item as VideoAsset;
}
export function parseVideos(value: unknown, project: string): VideoAsset[] {
  const body=value as {project?:{id?:unknown};assets?:unknown[]};
  if(body?.project?.id!==project || !Array.isArray(body.assets)) throw new Error('Videos could not be refreshed.');
  return body.assets.filter(item => (item as {type?:unknown})?.type==='video').map(item => parseVideo(item,project));
}
export function parseStatus(value: unknown, project: string): UploadStatus {
  const item=value as UploadStatus;
  if(!item || !uuid.test(item.uploadId) || !['CREATED','UPLOADING','PROCESSING','READY','FAILED','CANCELED','EXPIRED'].includes(item.state)
    || typeof item.fileName!=='string' || !Number.isSafeInteger(item.fileSizeBytes) || item.fileSizeBytes<1 || item.fileSizeBytes>MAX_VIDEO_BYTES
    || !/^[a-f0-9]{64}$/.test(item.expectedSha256) || item.chunkSizeBytes!==5*1024*1024 || item.totalParts!==Math.ceil(item.fileSizeBytes/item.chunkSizeBytes)
    || !Array.isArray(item.receivedParts) || !Number.isFinite(item.uploadPercent) || item.uploadPercent<0 || item.uploadPercent>100
    || typeof item.assetAvailable!=='boolean' || typeof item.expiresAt!=='string') throw new Error('Upload status is unknown. Check status again.');
  const seen=new Set<number>(); let received=0;
  for(const part of item.receivedParts) {
    if(!Number.isInteger(part.partNumber) || part.partNumber<0 || part.partNumber>=item.totalParts || seen.has(part.partNumber)
      || part.sizeBytes!==Math.min(item.chunkSizeBytes,item.fileSizeBytes-part.partNumber*item.chunkSizeBytes) || !/^[a-f0-9]{64}$/.test(part.sha256)) throw new Error('Invalid acknowledged part. Check status again.');
    seen.add(part.partNumber);received+=part.sizeBytes;
  }
  if(item.state!=='READY' && (item.receivedBytes!==received || item.uploadPercent!==Math.floor(received/item.fileSizeBytes*100))) throw new Error('Invalid upload progress.');
  if(item.state==='READY' && (item.receivedBytes!==item.fileSizeBytes || item.uploadPercent!==100)) throw new Error('Invalid completed transfer status.');
  if(!item.assetAvailable && item.asset!==null) throw new Error('Invalid active asset status.');
  if(item.error!==null && (typeof item.error?.code!=='string' || typeof item.error?.message!=='string')) throw new Error('Invalid processing error.');
  if(item.assetAvailable && (item.state!=='READY' || !item.asset)) throw new Error('Invalid published video status.');
  if(item.asset) parseVideo(item.asset,project);
  return item;
}
export async function request(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<Response> {
  const response=await fetch(path,{...init,cache:'no-store',signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(35_000)])});
  if(!response.ok) {
    let message='The request could not be confirmed. Check upload status before retrying.';
    try { const body=await response.json() as {message?:unknown}; if(typeof body.message==='string') message=body.message; } catch { /* Keep a useful fallback for proxy failures. */ }
    throw new Error(message);
  }
  return response;
}
export async function getStatus(project: string, id: string, signal?: AbortSignal) {
  const result=parseStatus(await (await request(uploadsPath(project,id),{},signal)).json(),project);
  if(result.uploadId!==id) throw new Error('Upload response does not match this session.');
  return result;
}
export function validateVideoFile(file: File) {
  if(file.size<1 || file.size>MAX_VIDEO_BYTES) throw new Error('Choose a nonempty MP4 up to 20 MiB.');
  if(file.type!=='video/mp4' || !/\.mp4$/i.test(file.name)) throw new Error('Choose an MP4 video.');
  if(file.name.length>255 || /[\u0000-\u001f\u007f]/.test(file.name)) throw new Error('Use a shorter filename without control characters.');
}
export async function fileHash(file: File) {
  const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
}
// A failed/uncertain PUT is never blindly replayed. Both workers settle before the caller reconciles status.
export async function sendMissingParts(project: string, task: UploadStatus, file: File, signal: AbortSignal, confirmed: () => Promise<void>) {
  const acknowledged=new Set(task.receivedParts.map(part=>part.partNumber));
  const remaining=Array.from({length:task.totalParts},(_,index)=>index).filter(index=>!acknowledged.has(index));
  let next=0, failed=false;
  const worker=async () => {
    while(next<remaining.length && !failed) {
      const index=remaining[next++];
      try {
        await request(`${uploadsPath(project,task.uploadId)}/parts/${index}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:file.slice(index*task.chunkSizeBytes,Math.min(file.size,(index+1)*task.chunkSizeBytes))},signal);
        await confirmed();
      } catch(error) { failed=true; throw error; }
    }
  };
  const settled=await Promise.allSettled([worker(),worker()]);
  const failure=settled.find(item=>item.status==='rejected');
  if(failure?.status==='rejected') throw failure.reason;
}
