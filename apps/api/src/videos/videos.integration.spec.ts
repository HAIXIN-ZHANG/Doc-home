import { readFile } from 'node:fs/promises';
import { VideoWorker } from './video-worker.js';
import { StorageService } from '../storage/storage.service.js';
import { StorageModule } from '../storage/storage.module.js';
import { AssetsModule } from '../assets/assets.module.js';
import { AssetsController } from '../assets/assets.controller.js';
import { PhotosModule } from '../photos/photos.module.js';
import { FileDetail } from '../assets/file-detail.entity.js';
import { VideoUpload } from '../assets/upload.entity.js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createDatabaseOptions } from '../database/database-options.js';
import { VideosModule } from './videos.module.js';
import { HttpExceptionFilter } from '../http/http-exception.filter.js';
import { CHUNK_BYTES, sha256 } from './video-policy.js';
import { UploadsService } from './uploads.service.js';
const databaseUrl = process.env.PHOTO_INTEGRATION_DATABASE_URL;
const endpoint = process.env.PHOTO_INTEGRATION_S3_ENDPOINT;
const integration = databaseUrl && endpoint ? describe : describe.skip;
const project = randomUUID(), other = randomUUID();
let db: DataSource, app: INestApplication, origin: string;
async function start() {
  const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal:true,ignoreEnvFile:true,ignoreEnvVars:true,load:[() => ({
    S3_ENDPOINT:endpoint,S3_REGION:'us-east-1',S3_BUCKET:'doc-home-soft-delete-test',S3_ACCESS_KEY_ID:'local-test',S3_SECRET_ACCESS_KEY:'local-test',
  })] }),TypeOrmModule.forRoot(createDatabaseOptions(databaseUrl)),VideosModule,StorageModule,PhotosModule,AssetsModule], controllers:[AssetsController] })
    .overrideProvider(VideoWorker).useFactory({factory:(database: DataSource, uploads: UploadsService) => {
      const worker = new VideoWorker(database, uploads); jest.spyOn(worker,'onModuleInit').mockImplementation(() => {}); return worker;
    }, inject:[DataSource,UploadsService]}).compile();
  app = module.createNestApplication({logger:false}); app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  await app.listen(0,'127.0.0.1'); origin = await app.getUrl();
}
const url = (id = '', scope = project) => `${origin}/projects/${scope}/uploads${id ? `/${id}` : ''}`;
async function create(bytes: Buffer) {
  const response = await fetch(url(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:'sample.mp4',fileSizeBytes:bytes.length,mimeType:'video/mp4',expectedSha256:sha256(bytes)})});
  expect(response.status).toBe(201); return await response.json() as { uploadId:string };
}
async function put(id: string, index: number, bytes: Buffer) {
  return fetch(`${url(id)}/parts/${index}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:new Uint8Array(bytes)});
}
function sample() {
  const box = (type: string, length: number) => { const value = Buffer.alloc(length); value.writeUInt32BE(length); value.write(type,4); return value; };
  return Buffer.concat([box('ftyp',16),box('moov',8),box('mdat',8)]);
}
async function processUpload(bytes: Buffer) {
  const {uploadId:id}=await create(bytes);
  for(let offset=0,index=0;offset<bytes.length;offset+=CHUNK_BYTES,index++) expect((await put(id,index,bytes.subarray(offset,offset+CHUNK_BYTES))).status).toBe(201);
  expect((await fetch(`${url(id)}/complete`,{method:'POST'})).status).toBe(202); return id;
}
async function status(id: string) { return await (await fetch(url(id))).json() as {state:string;assetAvailable:boolean;asset:{id:string;contentUrl:string}|null;error:{code:string}|null}; }
integration('video protocol PostgreSQL/S3Mock',() => {
  beforeAll(async () => {
    if (!databaseUrl || !endpoint || !new URL(databaseUrl).pathname.startsWith('/doc_home_soft_delete') || !['127.0.0.1','localhost'].includes(new URL(databaseUrl).hostname) || !['127.0.0.1','localhost'].includes(new URL(endpoint).hostname)) throw new Error('Disposable local test services required');
    db = new DataSource(createDatabaseOptions(databaseUrl)); await db.initialize(); await db.runMigrations();
    await db.query('INSERT INTO projects(id,name,address) VALUES ($1,$2,$3),($4,$5,$6)',[project,'Video test','Test',other,'Other','Test']); await start();
  },30_000);
  afterAll(async () => { await app?.close(); if (db?.isInitialized) await db.destroy(); });
  it('persists out-of-order parts, identical retries, exact progress and restart recovery',async () => {
    const bytes = Buffer.alloc(CHUNK_BYTES+11,7), { uploadId:id } = await create(bytes);
    expect((await put(id,1,bytes.subarray(CHUNK_BYTES))).status).toBe(201);
    expect((await put(id,1,bytes.subarray(CHUNK_BYTES))).status).toBe(200);
    expect((await put(id,1,Buffer.alloc(11,8))).status).toBe(409);
    expect((await put(id,0,Buffer.alloc(10))).status).toBe(400);
    expect((await fetch(`${url(id)}/complete`,{method:'POST'})).status).toBe(409);
    expect((await fetch(url(id,other))).status).toBe(404);
    expect((await fetch(url(id))).status).toBe(200);
    await app.close(); await start();
    expect(await (await fetch(url(id))).json()).toMatchObject({state:'UPLOADING',receivedBytes:11,receivedParts:[{partNumber:1}],uploadPercent:0});
    expect((await put(id,0,bytes.subarray(0,CHUNK_BYTES))).status).toBe(201);
    expect(await (await fetch(url(id))).json()).toMatchObject({receivedBytes:bytes.length,uploadPercent:100,asset:null});
    expect((await fetch(url(id),{method:'DELETE'})).status).toBe(200);
    expect((await put(id,0,bytes.subarray(0,CHUNK_BYTES))).status).toBe(409);
    await app.get(UploadsService).cleanup();
  });
  it('serializes cancel/part and cancel/complete races without revival',async () => {
    const bytes = Buffer.alloc(10,1), {uploadId:id} = await create(bytes);
    await put(id,0,bytes);
    const results = await Promise.all([fetch(url(id),{method:'DELETE'}),fetch(`${url(id)}/complete`,{method:'POST'})]);
    const status = await (await fetch(url(id))).json() as { state:string };
    expect(['CANCELED','PROCESSING','FAILED']).toContain(status.state);
    expect(results.map(r=>r.status).filter(s=>s===409)).toHaveLength(1);
    if (status.state === 'PROCESSING') await db.query("UPDATE video_uploads SET state='FAILED' WHERE id=$1",[id]);
    await app.get(UploadsService).cleanup();
  });
  it('expires incomplete sessions and rejects late parts',async () => {
    const {uploadId:id} = await create(Buffer.alloc(1)); await db.query("UPDATE video_uploads SET expires_at=now()-interval '1 second' WHERE id=$1",[id]);
    expect(await (await fetch(url(id))).json()).toMatchObject({state:'EXPIRED'});
    expect((await put(id,0,Buffer.alloc(1))).status).toBe(409); await app.get(UploadsService).cleanup();
  });
  it('enforces admission and receive byte limits',async () => {
    const ids: string[]=[];
    for(let index=0;index<4;index++) ids.push((await create(Buffer.alloc(1))).uploadId);
    const busy = await fetch(url(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:'f.mp4',fileSizeBytes:1,mimeType:'video/mp4',expectedSha256:'0'.repeat(64)})});
    expect(busy.status).toBe(429);
    expect((await put(ids[0],0,Buffer.alloc(CHUNK_BYTES+1))).status).toBe(413);
    for(const id of ids) await fetch(url(id),{method:'DELETE'});
    await app.get(UploadsService).cleanup();
  });
  it('publishes once, supports Range/416 and preserves the tombstone across complete retries',async () => {
    const bytes=sample(), id=await processUpload(bytes);
    expect(await status(id)).toMatchObject({state:'PROCESSING',asset:null});
    await app.get(VideoWorker).tick();
    const ready=await status(id); expect(ready).toMatchObject({state:'READY',assetAvailable:true});
    const content=`${origin}${ready.asset!.contentUrl}`;
    expect(Buffer.from(await (await fetch(content)).arrayBuffer())).toEqual(bytes);
    const range=await fetch(content,{headers:{Range:'bytes=2-12'}}); expect(range.status).toBe(206);
    expect(range.headers.get('content-range')).toBe(`bytes 2-12/${bytes.length}`); expect(Buffer.from(await range.arrayBuffer())).toEqual(bytes.subarray(2,13));
    const suffix=await fetch(content,{headers:{Range:'bytes=-4'}}); expect(suffix.status).toBe(206); expect(Buffer.from(await suffix.arrayBuffer())).toEqual(bytes.subarray(-4));
    const invalid=await fetch(content,{headers:{Range:'bytes=999999-'}}); expect(invalid.status).toBe(416); expect(invalid.headers.get('content-range')).toBe(`bytes */${bytes.length}`);
    expect((await fetch(`${url(id)}/complete`,{method:'POST'})).status).toBe(200);
    expect(await db.getRepository(FileDetail).countBy({uploadId:id})).toBe(1);
    expect((await fetch(`${origin}/projects/${other}/assets/${ready.asset!.id}/content`)).status).toBe(404);
    expect((await fetch(`${origin}/projects/${project}/assets/${ready.asset!.id}`,{method:'DELETE'})).status).toBe(204);
    expect((await fetch(content)).status).toBe(404);
    expect(await status(id)).toMatchObject({state:'READY',assetAvailable:false,asset:null});
    const deleted=await fetch(`${url(id)}/complete`,{method:'POST'}); expect(deleted.status).toBe(410); expect(await deleted.json()).toMatchObject({code:'ASSET_DELETED'});
    const file=await db.getRepository(FileDetail).findOneByOrFail({uploadId:id});
    expect(await app.get(StorageService).getPhoto(file.storageKey,bytes.length)).toEqual(bytes);
  });
  it('rejects malformed MP4 and checksum mismatches without publishing',async () => {
    for(const corruptHash of [false,true]) {
      const bytes=Buffer.from('not a video'),id=await processUpload(bytes);
      if(corruptHash) await db.query("UPDATE video_uploads SET sha256=$2 WHERE id=$1",[id,'0'.repeat(64)]);
      await app.get(VideoWorker).tick(); expect(await status(id)).toMatchObject({state:'FAILED',asset:null,error:{code:'INVALID_VIDEO'}});
      expect(await db.getRepository(FileDetail).countBy({uploadId:id})).toBe(0);
    }
  });
  it('recovers queued processing after app restart',async () => {
    const id=await processUpload(sample()); await app.close(); await start(); await app.get(VideoWorker).tick();
    expect(await status(id)).toMatchObject({state:'READY',assetAvailable:true});
  });
  it('retries transient storage failures at most twice with a persisted delay',async () => {
    const id=await processUpload(sample());
    const storage=app.get(StorageService), read=jest.spyOn(storage,'getPhoto').mockRejectedValue(new Error('temporary storage outage'));
    try {
      await app.get(VideoWorker).tick();
      const waiting=await db.getRepository(VideoUpload).findOneByOrFail({id}); expect(waiting.attempts).toBe(1); expect(waiting.nextAttemptAt).toBeInstanceOf(Date);
      await app.get(VideoWorker).tick(); expect((await db.getRepository(VideoUpload).findOneByOrFail({id})).attempts).toBe(1);
      await db.query("UPDATE video_uploads SET next_attempt_at=now()-interval '1 second' WHERE id=$1",[id]);
      await app.get(VideoWorker).tick(); expect(await status(id)).toMatchObject({state:'FAILED',error:{code:'PROCESSING_FAILED'}});
      await app.get(VideoWorker).tick(); expect(read).toHaveBeenCalledTimes(2);
    } finally { read.mockRestore(); }
  });
  it('recovers timed-out attempts after restart and fences exhausted work',async () => {
    const id=await processUpload(sample());
    await db.query("UPDATE video_uploads SET attempts=1,attempt_deadline=now()-interval '1 second' WHERE id=$1",[id]);
    await app.close(); await start(); await app.get(VideoWorker).tick(); expect(await status(id)).toMatchObject({state:'READY'});
    const exhausted=await processUpload(sample()); await db.query("UPDATE video_uploads SET attempts=2,attempt_deadline=now()-interval '1 second' WHERE id=$1",[exhausted]);
    await app.get(VideoWorker).tick(); expect(await status(exhausted)).toMatchObject({state:'FAILED'});
  });
  it('retains retryable cleanup manifests after storage deletion failure',async () => {
    const {uploadId:id}=await create(sample()); await put(id,0,sample()); await fetch(url(id),{method:'DELETE'});
    const remove=jest.spyOn(app.get(StorageService),'deletePhoto').mockRejectedValueOnce(new Error('temporary outage'));
    try { await app.get(VideoWorker).tick(); expect((await db.getRepository(VideoUpload).findOneByOrFail({id})).cleanupDone).toBe(false); }
    finally { remove.mockRestore(); }
    await app.get(VideoWorker).tick(); expect((await db.getRepository(VideoUpload).findOneByOrFail({id})).cleanupDone).toBe(true);
  });
  it('reconciles a lost database commit acknowledgement without duplicating or deleting the original',async () => {
    const id=await processUpload(sample());
    const database=app.get(DataSource), original=database.transaction.bind(database);
    let calls=0;
    const transaction=jest.spyOn(database,'transaction').mockImplementation(async (...args: Parameters<DataSource['transaction']>) => {
      calls++; const result=await original(...args);
      if(calls===2) throw new Error('commit reply lost'); return result;
    });
    try { await app.get(VideoWorker).tick(); } finally { transaction.mockRestore(); }
    await app.get(VideoWorker).tick(); expect(await status(id)).toMatchObject({state:'READY',assetAvailable:true});
    expect(await db.getRepository(FileDetail).countBy({uploadId:id})).toBe(1);
    const file=await db.getRepository(FileDetail).findOneByOrFail({uploadId:id}); expect(await app.get(StorageService).getPhoto(file.storageKey,32)).toEqual(sample());
  });
  it('uploads the opt-in real local sample without putting private media in Git',async () => {
    if(!process.env.VIDEO_TEST_FILE) return;
    const bytes=await readFile(process.env.VIDEO_TEST_FILE),id=await processUpload(bytes); await app.get(VideoWorker).tick();
    expect(await status(id)).toMatchObject({state:'READY',assetAvailable:true});
    const file=await db.getRepository(FileDetail).findOneByOrFail({uploadId:id}); expect(await app.get(StorageService).getPhoto(file.storageKey,bytes.length)).toEqual(bytes);
  },30_000);

});
