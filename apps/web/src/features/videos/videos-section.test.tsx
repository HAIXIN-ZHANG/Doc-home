import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VideosSection } from './videos-section';
import { parseStatus, parseVideo, sendMissingParts } from './video-api';
import type { UploadStatus, VideoAsset } from './video-api';
const project='92772849-3041-4c81-9c8d-25ba55b409fa',id='92772849-3041-4c81-9c8d-25ba55b409fb',assetId='92772849-3041-4c81-9c8d-25ba55b409fc';
const hash='1'.repeat(64), chunk=5*1024*1024;
const video: VideoAsset={id:assetId,projectId:project,type:'video',name:'walkthrough.mp4',mimeType:'video/mp4',sizeBytes:3,createdAt:'2026-10-20T00:00:00Z',contentUrl:`/projects/${project}/assets/${assetId}/content`};
const base: UploadStatus={uploadId:id,state:'CREATED',fileName:'walkthrough.mp4',fileSizeBytes:3,expectedSha256:hash,chunkSizeBytes:chunk,totalParts:1,receivedParts:[],receivedBytes:0,uploadPercent:0,expiresAt:'2026-10-21T00:00:00Z',assetAvailable:false,asset:null,error:null};
const transferred: UploadStatus={...base,state:'UPLOADING',receivedParts:[{partNumber:0,sizeBytes:3,sha256:hash}],receivedBytes:3,uploadPercent:100};
const response=(body:unknown,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body}) as Response;
const fetchMock=jest.fn<typeof fetch>(), originalFetch=globalThis.fetch;
beforeEach(()=>{globalThis.fetch=fetchMock;fetchMock.mockReset();localStorage.clear();Object.defineProperty(crypto,'subtle',{configurable:true,value:{digest:jest.fn<()=>Promise<ArrayBuffer>>().mockResolvedValue(new Uint8Array(32).fill(17).buffer)}});});
afterEach(()=>{globalThis.fetch=originalFetch;});
function mount(initialVideos:VideoAsset[]=[]) {const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});return render(<QueryClientProvider client={client}><VideosSection projectId={project} initialVideos={initialVideos}/></QueryClientProvider>);}
function choose(name='walkthrough.mp4',size=3) {
  const file=new File([new Uint8Array(size)],name,{type:'video/mp4'});
  Object.defineProperty(file,'arrayBuffer',{value:async()=>new Uint8Array(size).buffer});
  fireEvent.change(screen.getByLabelText('Choose video'),{target:{files:[file]}});return file;
}
describe('video UI and protocol',()=>{
  it('uses initial videos without a duplicate request and exposes native playback/error feedback',async()=>{
    mount([video]);expect(fetchMock).not.toHaveBeenCalled();
    const player=screen.getByLabelText(video.name);expect(player).toHaveAttribute('controls');expect(player).toHaveAttribute('playsinline');expect(player).not.toHaveAttribute('autoplay');
    fireEvent.error(player);expect(screen.getByRole('alert')).toHaveTextContent('could not be played');
  });
  it('rejects an oversized file before session creation',async()=>{
    mount();await userEvent.click(screen.getByRole('button',{name:'+ Add video'}));choose('large.mp4',20*1024*1024+1);
    await userEvent.click(screen.getByRole('button',{name:'Upload video'}));expect(await screen.findByText('Choose a nonempty MP4 up to 20 MiB.')).toBeVisible();expect(fetchMock).not.toHaveBeenCalled();
  });
  it('keeps transferred and published states separate and hiding controls retains the task',async()=>{
    fetchMock.mockResolvedValueOnce(response(base,201)).mockResolvedValueOnce(response({},201)).mockResolvedValueOnce(response(transferred))
      .mockResolvedValueOnce(response({...transferred,state:'PROCESSING'},202)).mockResolvedValueOnce(response({...transferred,state:'PROCESSING'}));
    mount();await userEvent.click(screen.getByRole('button',{name:'+ Add video'}));choose();await userEvent.click(screen.getByRole('button',{name:'Upload video'}));
    expect(await screen.findByText('100% transferred · Finalizing video…')).toBeVisible();expect(screen.getByText('No videos yet. Upload a project walkthrough.')).toBeVisible();
    await userEvent.click(screen.getAllByRole('button',{name:'Hide upload'})[0]);expect(screen.getByLabelText('Video upload task')).toBeVisible();
    expect(JSON.parse(localStorage.getItem(`doc-home:video-upload:v1:${project}`)!)).toEqual({version:1,uploadId:id});
  });
  it('queries persisted status first and rejects a different reselected file by hash',async()=>{
    localStorage.setItem(`doc-home:video-upload:v1:${project}`,JSON.stringify({version:1,uploadId:id}));
    const original={...base,expectedSha256:'0'.repeat(64)};fetchMock.mockResolvedValue(response(original));
    mount();await screen.findByLabelText('Video upload task');expect(fetchMock).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button',{name:'Resume upload'}));choose();await userEvent.click(screen.getByRole('button',{name:'Resume video upload'}));
    expect(await screen.findByText('This is a different file. Select the original video to resume.')).toBeVisible();
    expect(fetchMock.mock.calls.every(([,init])=>!init?.method)).toBe(true);
  });
  it('retains the recovered upload ID when initial status lookup fails',async()=>{
    localStorage.setItem(`doc-home:video-upload:v1:${project}`,JSON.stringify({version:1,uploadId:id}));
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response(base));
    mount();await userEvent.click(await screen.findByRole('button',{name:'Check upload status'}));await screen.findByLabelText('Video upload task');
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/projects/${project}/uploads/${id}`);
  });
  it('keeps a failed PUT resumable and checks status before an explicit retry',async()=>{
    fetchMock.mockResolvedValueOnce(response(base,201)).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response(base));
    mount();await userEvent.click(screen.getByRole('button',{name:'+ Add video'}));choose();await userEvent.click(screen.getByRole('button',{name:'Upload video'}));
    expect(await screen.findByRole('button',{name:'Check upload status'})).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(3);expect(fetchMock.mock.calls[2][1]?.method).toBeUndefined();
    expect(screen.getByRole('button',{name:'Resume video upload'})).toBeDisabled();
  });
  it('publishes a card only after READY plus a successful authoritative list refresh',async()=>{
    fetchMock.mockResolvedValueOnce(response(base,201)).mockResolvedValueOnce(response({},201)).mockResolvedValueOnce(response(transferred))
      .mockResolvedValueOnce(response({...transferred,state:'READY',assetAvailable:true,asset:video},200))
      .mockResolvedValueOnce(response({...transferred,state:'READY',assetAvailable:true,asset:video}))
      .mockResolvedValueOnce(response({project:{id:project},assets:[video]}));
    mount();await userEvent.click(screen.getByRole('button',{name:'+ Add video'}));choose();await userEvent.click(screen.getByRole('button',{name:'Upload video'}));
    expect(await screen.findByLabelText(video.name)).toBeVisible();expect(screen.getByRole('button',{name:'Dismiss upload'})).toBeVisible();
  });
  it('updates a completed task after confirmed soft deletion without recreating a card',async()=>{
    localStorage.setItem(`doc-home:video-upload:v1:${project}`,JSON.stringify({version:1,uploadId:id}));
    fetchMock.mockResolvedValueOnce(response({...transferred,state:'READY',assetAvailable:true,asset:video}))
      .mockResolvedValueOnce(response({project:{id:project},assets:[video]}))
      .mockResolvedValueOnce(response({},204)).mockResolvedValueOnce(response({project:{id:project},assets:[]}));
    mount([video]);await screen.findByText('Video added.',{exact:true});
    await userEvent.click(screen.getByRole('button',{name:`Delete video ${video.name}`}));await userEvent.click(screen.getByRole('button',{name:'Confirm delete'}));
    expect(await screen.findByText('This video has been deleted.')).toBeVisible();expect(screen.queryByLabelText(video.name)).not.toBeInTheDocument();
  });
  it('does not remove a card after an uncertain delete and requires list reconciliation',async()=>{
    fetchMock.mockRejectedValueOnce(new Error('reply lost'));mount([video]);
    await userEvent.click(screen.getByRole('button',{name:`Delete video ${video.name}`}));await userEvent.click(screen.getByRole('button',{name:'Confirm delete'}));
    await screen.findByRole('button',{name:'Refresh videos'});expect(screen.getByLabelText(video.name)).toBeVisible();expect(screen.getByRole('button',{name:'Confirm delete'})).toBeDisabled();
  });
  it('rejects malformed manifests and foreign content URLs',()=>{
    expect(()=>parseStatus({...base,receivedParts:[{partNumber:0,sizeBytes:1,sha256:hash}]},project)).toThrow();
    expect(()=>parseVideo({...video,contentUrl:'https://elsewhere.example/video'},project)).toThrow();
    expect(()=>parseStatus({...base,assetAvailable:true},project)).toThrow();
  });
  it('never exceeds two parallel PUTs and skips confirmed parts',async()=>{
    let concurrent=0,max=0;
    fetchMock.mockImplementation(async()=>{concurrent++;max=Math.max(max,concurrent);await new Promise(resolve=>setTimeout(resolve,1));concurrent--;return response({},201);});
    const task={...base,fileSizeBytes:chunk*3,totalParts:3,receivedParts:[{partNumber:1,sizeBytes:chunk,sha256:hash}],receivedBytes:chunk,uploadPercent:33};
    await sendMissingParts(project,task,new File([new Uint8Array(chunk*3)],'file.mp4'),new AbortController().signal,async()=>{});
    expect(max).toBe(2);expect(fetchMock).toHaveBeenCalledTimes(2);expect(fetchMock.mock.calls.map(([url])=>url)).toEqual([`/api/projects/${project}/uploads/${id}/parts/0`,`/api/projects/${project}/uploads/${id}/parts/2`]);
  });
  it('cancels a recovered incomplete session without publishing an asset',async()=>{
    localStorage.setItem(`doc-home:video-upload:v1:${project}`,JSON.stringify({version:1,uploadId:id}));
    fetchMock.mockResolvedValueOnce(response(base)).mockResolvedValueOnce(response({...base,state:'CANCELED'})).mockResolvedValueOnce(response({...base,state:'CANCELED'}));
    mount();await screen.findByLabelText('Video upload task');await waitFor(()=>expect(screen.getByRole('button',{name:'Cancel upload'})).toBeEnabled());
    await userEvent.click(screen.getByRole('button',{name:'Cancel upload'}));expect(await screen.findByText('Upload canceled.')).toBeVisible();expect(screen.queryByLabelText(video.name)).not.toBeInTheDocument();
  });
});
