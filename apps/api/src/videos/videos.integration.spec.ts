import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
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
  })] }),TypeOrmModule.forRoot(createDatabaseOptions(databaseUrl)),VideosModule] }).compile();
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
});
