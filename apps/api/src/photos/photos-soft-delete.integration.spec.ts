import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DataSource } from 'typeorm';
import sharp from 'sharp';
import { createDatabaseOptions } from '../database/database-options.js';
import { CreateProjectsAndPhotos1792368000000 } from '../database/migrations/1792368000000-create-projects-and-photos.js';
import { HttpExceptionFilter } from '../http/http-exception.filter.js';
import { requestLog } from '../http/request-log.middleware.js';
import { Photo } from './entities/photo.entity.js';
import { PhotosModule } from './photos.module.js';

// Opt in with disposable local PostgreSQL/S3Mock services. Ordinary unit CI skips this suite.
const databaseUrl = process.env.PHOTO_INTEGRATION_DATABASE_URL;
const endpoint = process.env.PHOTO_INTEGRATION_S3_ENDPOINT;
const integration = databaseUrl || endpoint ? describe : describe.skip;
const bucket = 'doc-home-soft-delete-test';
const projectId = randomUUID();
const otherProjectId = randomUUID();
const photoId = randomUUID();
const key = `projects/${projectId}/photos/${photoId}.png`;
const createdAt = '2026-10-19T01:02:03.000Z';
let database: DataSource;
let s3: S3Client;
let app: INestApplication | undefined;
let origin: string;
let original: Buffer;
let deletionTime: number;

integration('photo soft deletion against PostgreSQL and S3Mock', () => {
  beforeAll(async () => {
    if (!databaseUrl || !endpoint) throw new Error('Both PHOTO_INTEGRATION_DATABASE_URL and PHOTO_INTEGRATION_S3_ENDPOINT are required');
    const db = new URL(databaseUrl);
    const storage = new URL(endpoint);
    if (!['localhost', '127.0.0.1'].includes(db.hostname)
      || !db.pathname.startsWith('/doc_home_soft_delete')
      || !['localhost', '127.0.0.1'].includes(storage.hostname)) {
      throw new Error('Use a disposable local doc_home_soft_delete* database and local S3Mock');
    }
    s3 = new S3Client({
      endpoint, region: 'us-east-1', forcePathStyle: true, maxAttempts: 1,
      credentials: { accessKeyId: 'local-test', secretAccessKey: 'local-test' },
    });
    await s3.send(new HeadBucketCommand({ Bucket: bucket }), { abortSignal: AbortSignal.timeout(10_000) });
    original = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#0f766e' } }).png().toBuffer();
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: original, ContentType: 'image/png' }));

    // Seed a pre-migration row, then apply the additive migration through the real runner.
    const baseline = new DataSource({ ...createDatabaseOptions(databaseUrl), migrations: [CreateProjectsAndPhotos1792368000000] });
    await baseline.initialize();
    try {
      await baseline.runMigrations();
      await baseline.query('INSERT INTO projects(id,name,address) VALUES ($1,$2,$3),($4,$5,$6)',
        [projectId, 'Integration project', 'Test address', otherProjectId, 'Other project', 'Other address']);
      await baseline.query(`INSERT INTO photos(id,project_id,original_name,storage_key,mime_type,size_bytes,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [photoId, projectId, 'existing.png', key, 'image/png', original.length, createdAt]);
    } finally { await baseline.destroy(); }
    database = new DataSource(createDatabaseOptions(databaseUrl));
    await database.initialize();
    await database.runMigrations();
    const module = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, ignoreEnvVars: true, load: [() => ({
        S3_ENDPOINT: endpoint, S3_REGION: 'us-east-1', S3_BUCKET: bucket,
        S3_ACCESS_KEY_ID: 'local-test', S3_SECRET_ACCESS_KEY: 'local-test',
      })] }),
      TypeOrmModule.forRoot(createDatabaseOptions(databaseUrl)),
      PhotosModule,
    ] }).compile();
    app = module.createNestApplication({ logger: false });
    app.use(requestLog);
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    if (database?.isInitialized) await database.destroy();
    s3?.destroy();
  });

  it('preserves existing IDs, metadata, bytes and active visibility during migration', async () => {
    const record = await database.getRepository(Photo).findOneByOrFail({ id: photoId });
    expect(record).toMatchObject({ id: photoId, projectId, storageKey: key, originalName: 'existing.png', deletedAt: null });
    expect(record.createdAt.toISOString()).toBe(createdAt);
    const response = await fetch(`${origin}/projects/${projectId}/photos`);
    expect(response.status).toBe(200);
    const list = await response.text();
    expect(list).toContain(photoId);
    expect(list).not.toContain('deletedAt');
    expect(list).not.toContain('storageKey');
    const content = await fetch(`${origin}/projects/${projectId}/photos/${photoId}/content`);
    expect(content.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.from(await content.arrayBuffer())).toEqual(original);
  });

  it('rejects wrong-project deletion/content access while leaving the photo active', async () => {
    for (const [method, suffix] of [['DELETE', ''], ['GET', '/content']] as const) {
      const response = await fetch(`${origin}/projects/${otherProjectId}/photos/${photoId}${suffix}`, { method });
      expect(response.status).toBe(404);
    }
    expect((await database.getRepository(Photo).findOneByOrFail({ id: photoId })).deletedAt).toBeNull();
  });

  it('keeps upload and resized preview working after the migration', async () => {
    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(original)], { type: 'image/png' }), 'new.png');
    const upload = await fetch(`${origin}/projects/${projectId}/photos`, { method: 'POST', body: form });
    expect(upload.status).toBe(201);
    const saved = await database.getRepository(Photo).findOneByOrFail({ projectId, originalName: 'new.png' });
    const preview = await fetch(`${origin}/projects/${projectId}/photos/${saved.id}/content?w=16&h=16`);
    expect(preview.status).toBe(200);
    expect(await sharp(Buffer.from(await preview.arrayBuffer())).metadata()).toMatchObject({ width: 16, height: 12 });
  });

  it('handles concurrent and repeated deletion without changing the first timestamp', async () => {
    const url = `${origin}/projects/${projectId}/photos/${photoId}`;
    const replies = await Promise.all([fetch(url, { method: 'DELETE' }), fetch(url, { method: 'DELETE' })]);
    for (const reply of replies) { expect(reply.status).toBe(204); expect(await reply.text()).toBe(''); }
    const first = await database.getRepository(Photo).findOneOrFail({ where: { id: photoId }, withDeleted: true });
    expect(first.deletedAt).toBeInstanceOf(Date);
    deletionTime = first.deletedAt!.getTime();
    await setTimeout(20);
    expect((await fetch(url, { method: 'DELETE' })).status).toBe(204);
    const repeated = await database.getRepository(Photo).findOneOrFail({ where: { id: photoId }, withDeleted: true });
    expect(repeated.deletedAt?.getTime()).toBe(deletionTime);
  });

  it('hides deleted originals/previews/list entries but retains metadata and exact object bytes', async () => {
    const list = await fetch(`${origin}/projects/${projectId}/photos`);
    expect(list.status).toBe(200);
    const body = await list.text();
    expect(body).not.toContain(photoId);
    expect(body).toContain('new.png');
    for (const query of ['', '?w=16', '?w=16&h=16']) {
      expect((await fetch(`${origin}/projects/${projectId}/photos/${photoId}/content${query}`)).status).toBe(404);
    }
    expect((await fetch(`${origin}/projects/${otherProjectId}/photos/${photoId}`, { method: 'DELETE' })).status).toBe(404);
    expect((await fetch(`${origin}/projects/${projectId}/photos/${randomUUID()}`, { method: 'DELETE' })).status).toBe(404);
    const retained = await database.getRepository(Photo).findOneOrFail({ where: { id: photoId }, withDeleted: true });
    expect(retained).toMatchObject({ id: photoId, storageKey: key, sizeBytes: original.length });
    expect(retained.deletedAt?.getTime()).toBe(deletionTime);
    const stored = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    expect(Buffer.from(await stored.Body!.transformToByteArray())).toEqual(original);
  });

  it('refuses a rollback that would silently expose deleted records', async () => {
    await expect(database.undoLastMigration()).rejects.toThrow('Cannot revert photo soft deletion while deleted rows exist');
    expect((await database.getRepository(Photo).findOneOrFail({ where: { id: photoId }, withDeleted: true })).deletedAt?.getTime()).toBe(deletionTime);
    expect((await fetch(`${origin}/projects/${projectId}/photos/${photoId}/content`)).status).toBe(404);
  });

  it('can revert and reapply on disposable data after explicitly clearing deletion markers', async () => {
    await app!.close();
    app = undefined;
    // Test-only SQL fixture change; this does not add an application restore endpoint.
    await database.getRepository(Photo).update({ id: photoId }, { deletedAt: null });
    await database.undoLastMigration();
    const columns = await database.query<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='photos'`,
    );
    expect(columns.some(column => column.column_name === 'deleted_at')).toBe(false);
    await database.runMigrations();
    expect((await database.getRepository(Photo).findOneByOrFail({ id: photoId })).storageKey).toBe(key);
    expect(await database.getRepository(Photo).countBy({ projectId })).toBe(2);
    const stored = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    expect(Buffer.from(await stored.Body!.transformToByteArray())).toEqual(original);
  });
});
