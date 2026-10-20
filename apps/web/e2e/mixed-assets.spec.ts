import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const project='39f7c890-a5aa-4a74-8a3a-7fba28ac58b6';
const route=`/projects/${project}/photos`,assets=`/api/projects/${project}/assets`,storageKey=`doc-home:video-upload:v1:${project}`;
const landscape=process.env.VIDEO_TEST_FILE!,portrait=process.env.PORTRAIT_VIDEO_TEST_FILE!;
let errors: string[]=[],consoleErrors: string[]=[];
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{
  for(const file of [landscape,portrait]) {expect(path.isAbsolute(file)).toBe(true);expect((await stat(file)).size).toBeGreaterThan(0);expect((await stat(file)).size).toBeLessThanOrEqual(20*1024*1024);}
  expect((await stat(landscape)).size).toBeGreaterThan(5*1024*1024); // Exercise more than one part.
});
test.beforeEach(async({page})=>{errors=[];consoleErrors=[];page.on('console',message=>{if(message.type()==='error') consoleErrors.push(message.text());});page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());});
test.afterEach(async({page},info)=>{
  await page.screenshot({path:info.outputPath('screen.png'),fullPage:true});
  expect(errors).toEqual([]);expect(await page.locator('nextjs-portal').count()).toBe(0);
  await info.attach('console-errors',{body:Buffer.from(consoleErrors.join('\n')),contentType:'text/plain'});
  // These resource errors are deliberately exercised by interruption, missing-session and deletion tests.
  expect(consoleErrors.filter(message=>!/^Failed to load resource: (net::ERR_FAILED|the server responded with a status of (404|410)\b)/.test(message))).toEqual([]);
});
async function selectAndUpload(page: Page,file: string) {
  await page.getByRole('button',{name:'+ Add video'}).click();
  await page.getByLabel('Choose video',{exact:true}).setInputFiles(file);
  await page.getByRole('button',{name:'Upload video',exact:true}).click();
}
async function playPauseSeek(page: Page,index: number) {
  const player=page.locator('video').nth(index);await player.scrollIntoViewIfNeeded();
  await player.evaluate(async (video: HTMLVideoElement)=>{video.muted=true;await video.play();});
  await expect.poll(()=>player.evaluate((video: HTMLVideoElement)=>video.currentTime)).toBeGreaterThan(0.1);
  await player.evaluate((video: HTMLVideoElement)=>{video.pause();video.currentTime=Math.min(5,video.duration/2);});
  await expect.poll(()=>player.evaluate((video: HTMLVideoElement)=>!video.seeking)).toBe(true);
  expect(await player.evaluate((video: HTMLVideoElement)=>video.error)).toBeNull();expect(await player.evaluate((video: HTMLVideoElement)=>video.paused)).toBe(true);
}
test('links and real PNG/JPEG preserve existing project workflows',async({page})=>{
  await page.goto(route);await expect(page).toHaveTitle('Doc-home');await expect(page.getByRole('heading',{name:'Riverside House'})).toBeVisible();
  await page.getByRole('button',{name:'+ Add link'}).click();
  const form=page.getByRole('form',{name:'Add project link'});
  await form.getByLabel('URL',{exact:true}).fill('ftp://example.com/reference');await form.getByRole('button',{name:'Add link',exact:true}).click();
  await expect(page.locator('section[aria-labelledby="links-heading"]').getByRole('alert')).toContainText('HTTP');
  await form.getByLabel('Name (optional)').fill('E2E survey');await form.getByLabel('URL',{exact:true}).fill('https://example.com/Survey?Key=Value#Part');await form.getByRole('button',{name:'Add link',exact:true}).click();
  const link=page.getByRole('link',{name:'E2E survey (opens in a new tab)'});await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel','noopener noreferrer');
  await page.getByRole('button',{name:'+ Add link'}).click();await form.getByLabel('URL',{exact:true}).fill('https://example.com/reference');await form.getByRole('button',{name:'Add link',exact:true}).click();
  await expect(page.getByRole('link',{name:'https://example.com/reference (opens in a new tab)'})).toBeVisible();
  for(const file of ['test.png','test.jpg']) {
    await page.getByLabel('Choose photo',{exact:true}).setInputFiles(path.join(process.env.E2E_OUTPUT_DIR!,file));
    await page.getByRole('button',{name:'Upload photo',exact:true}).click();await expect(page.getByRole('heading',{name:file,exact:true})).toBeVisible();
    await expect(page.getByLabel('Choose photo',{exact:true})).toBeEnabled();
  }
  await page.reload();await expect(page.getByRole('list',{name:'Project photos'}).locator('li')).toHaveCount(2);
  const mixed=await (await page.request.get(assets)).json();expect(mixed.assets.map((item:{type:string})=>item.type)).toEqual(expect.arrayContaining(['photo','link']));expect(JSON.stringify(mixed)).not.toContain('storageKey');
});
test('landscape MP4 stores, finalizes, plays and serves exact ranges',async({page})=>{
  await page.goto(route);await page.getByRole('button',{name:'+ Add video'}).click();
  await page.getByLabel('Choose video',{exact:true}).setInputFiles({name:'too-large.mp4',mimeType:'video/mp4',buffer:Buffer.alloc(20*1024*1024+1)});
  await page.getByRole('button',{name:'Upload video',exact:true}).click();await expect(page.getByText('Choose a nonempty MP4 up to 20 MiB.')).toBeVisible();
  await page.getByLabel('Choose video',{exact:true}).setInputFiles(landscape);await page.getByRole('button',{name:'Upload video',exact:true}).click();
  await expect(page.getByText('100% transferred · Finalizing video…').or(page.getByText('Video added.',{exact:true}))).toBeVisible();await expect(page.locator('video')).toHaveCount(1);
  await playPauseSeek(page,0);expect(await page.locator('video').evaluate((video: HTMLVideoElement)=>video.videoWidth>video.videoHeight)).toBe(true);
  const source=(await page.locator('video').getAttribute('src'))!;
  const range=await page.request.get(source,{headers:{Range:'bytes=100-199'}});expect(range.status()).toBe(206);expect(await range.body()).toEqual((await readFile(landscape)).subarray(100,200));
  const invalid=await page.request.get(source,{headers:{Range:'bytes=999999999-'}});expect(invalid.status()).toBe(416);
  await page.reload();await expect(page.locator('video')).toHaveCount(1);
});
test('failed part survives refresh, rejects wrong file, resumes and cancels explicitly',async({page})=>{
  await page.goto(route);let failed=false;
  await page.route('**/uploads/*/parts/1',async route=>{if(!failed){failed=true;await route.abort('failed');}else await route.continue();});
  await selectAndUpload(page,landscape);await expect(page.getByRole('button',{name:'Check upload status'})).toBeVisible();
  const before=Number(await page.getByRole('progressbar',{name:'Acknowledged video upload'}).getAttribute('value'));expect(before).toBeGreaterThan(0);expect(before).toBeLessThan(100);
  await page.unroute('**/uploads/*/parts/1');await page.reload();await expect(page.getByLabel('Video upload task')).toBeVisible();
  await page.getByRole('button',{name:'Resume upload',exact:true}).click();await page.getByLabel('Choose video',{exact:true}).setInputFiles({name:'wrong.mp4',mimeType:'video/mp4',buffer:Buffer.from('wrong file')});
  await page.getByRole('button',{name:'Resume video upload'}).click();await expect(page.getByText('This is a different file. Select the original video to resume.')).toBeVisible();
  await page.getByLabel('Choose video',{exact:true}).setInputFiles(landscape);await page.getByRole('button',{name:'Resume video upload'}).click();await expect(page.locator('video')).toHaveCount(2);
  await page.getByRole('button',{name:'Dismiss upload'}).click();
  await page.route('**/uploads/*/parts/*',route=>route.abort('failed'));await selectAndUpload(page,landscape);await expect(page.getByRole('button',{name:'Check upload status'})).toBeVisible();
  await page.unroute('**/uploads/*/parts/*');await page.getByRole('button',{name:'Cancel upload'}).click();await expect(page.getByText('Upload canceled.')).toBeVisible();await expect(page.locator('video')).toHaveCount(2);
  await page.getByRole('button',{name:'Dismiss upload'}).click();
  await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({version:1,uploadId:'92772849-3041-4c81-9c8d-25ba55b409fa'})),storageKey);
  await page.reload();await expect(page.getByText('This upload no longer exists. Choose a video to start a new upload.')).toBeVisible();
  expect(await page.evaluate(key=>localStorage.getItem(key),storageKey)).toBeNull();await expect(page.getByRole('button',{name:'+ Add video'})).toBeEnabled();
});
test('portrait playback, responsive mixed view, deletions and no resurrection',async({page},info)=>{
  await page.goto(route);await selectAndUpload(page,portrait);await expect(page.locator('video')).toHaveCount(3);
  const list=page.getByRole('list',{name:'Project videos'}),player=list.locator('video').first();await playPauseSeek(page,0);
  expect(await player.evaluate((video: HTMLVideoElement)=>video.videoHeight>video.videoWidth)).toBe(true);
  const source=(await player.getAttribute('src'))!;
  const upload=JSON.parse((await page.evaluate(key=>localStorage.getItem(key),storageKey))!) as {uploadId:string};
  for(const width of [1440,834,390,320]) {
    await page.setViewportSize({width,height:width<768?844:1000});
    const size=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));expect(size.scroll).toBe(size.client);
    await page.screenshot({path:info.outputPath(`mixed-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});await player.scrollIntoViewIfNeeded();
  await player.screenshot({path:info.outputPath('portrait-player.png')});
  await list.locator('li').first().getByRole('button',{name:/Delete video/}).click();await list.getByRole('button',{name:'Confirm delete'}).click();await expect(page.locator('video')).toHaveCount(2);
  await expect(page.getByText('This video has been deleted.')).toBeVisible();expect((await page.request.get(source)).status()).toBe(404);
  const repeat=await page.request.post(`/api/projects/${project}/uploads/${upload.uploadId}/complete`);expect(repeat.status()).toBe(410);expect(await repeat.json()).toMatchObject({code:'ASSET_DELETED'});
  await page.getByRole('button',{name:'Delete link E2E survey'}).click();await expect(page.getByRole('link',{name:'E2E survey (opens in a new tab)'})).toHaveCount(0);
  await page.getByRole('button',{name:'Delete test.png',exact:true}).click();await expect(page.getByRole('heading',{name:'test.png',exact:true})).toHaveCount(0);
  await page.reload();await expect(page.locator('video')).toHaveCount(2);await expect(page.getByRole('heading',{name:'test.jpg',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'https://example.com/reference (opens in a new tab)'})).toBeVisible();
  // Verify the player error state without replacing its source or fetching an external resource.
  await page.locator('video').first().dispatchEvent('error');await expect(page.locator('section[aria-labelledby="videos-heading"]').getByRole('alert')).toContainText('could not be played');
});
