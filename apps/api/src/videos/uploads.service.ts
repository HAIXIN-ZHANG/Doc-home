import { Asset } from '../assets/asset.entity.js';
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { Project } from '../projects/entities/project.entity.js';
import { VideoUpload } from '../assets/upload.entity.js';
import { UploadPart } from './upload-part.entity.js';
import { StorageService } from '../storage/storage.service.js';
import { CHUNK_BYTES, partLength, sha256 } from './video-policy.js';
import { CreateUploadDto } from './create-upload.dto.js';
export const pendingStates = ['CREATED', 'UPLOADING'] as const;
@Injectable()
export class UploadsService {
  readonly logger = new Logger(UploadsService.name);
  receiving = 0;
  constructor(readonly database: DataSource, readonly storage: StorageService) {}
  async create(projectId: string, dto: CreateUploadDto) {
    return this.database.transaction(async manager => {
      // Admission is serialized across requests. Deployment remains one API/worker instance.
      await manager.query('SELECT pg_advisory_xact_lock(1792627200)');
      if (!await manager.existsBy(Project, { id: projectId })) throw new NotFoundException('Project not found');
      const rows = await manager.query<{ count: string; bytes: string }[]>(`SELECT count(*)::text AS count, COALESCE(sum(size_bytes*2),0)::text AS bytes FROM video_uploads WHERE state IN ('CREATED','UPLOADING','PROCESSING') OR cleanup_done=false`);
      if (Number(rows[0].count) >= 4 || Number(rows[0].bytes) + dto.fileSizeBytes * 2 > 160 * 1024 * 1024) throw new HttpException('Upload capacity is busy. Try again shortly.', 429);
      const upload = await manager.save(VideoUpload, manager.create(VideoUpload, { id: randomUUID(), projectId, name: dto.fileName.trim(), sizeBytes: dto.fileSizeBytes, sha256: dto.expectedSha256, state: 'CREATED', expiresAt: new Date(Date.now() + 86400_000) }));
      return this.statusBody(upload, []);
    });
  }
  async locked(manager: EntityManager, projectId: string, id: string) {
    const upload = await manager.findOne(VideoUpload, { where: { id, projectId }, lock: { mode: 'pessimistic_write' } });
    if (!upload) throw new NotFoundException('Upload not found');
    return upload;
  }
  async expire(upload: VideoUpload, manager: EntityManager) {
    if (pendingStates.some(state => state === upload.state) && upload.expiresAt.getTime() <= Date.now()) {
      upload.state = 'EXPIRED'; await manager.save(upload);
    }
  }
  async get(projectId: string, id: string) {
    return this.database.transaction(async manager => {
      const item = await this.locked(manager, projectId, id);
      await this.expire(item, manager);
      const parts = await manager.find(UploadPart, { where: { uploadId: id } });
      // Keep publication blocked until the state and acknowledged-part snapshot are read.
      return this.statusBody(item, parts, manager);
    });
  }
  async statusBody(upload: VideoUpload, parts: UploadPart[], manager = this.database.manager) {
    const asset = upload.state === 'READY' ? await manager.findOne(Asset,{ where: { projectId: upload.projectId, type: 'video', file: { uploadId: upload.id } }, relations: { file: true } }) : null;
    const receivedParts = parts.sort((a,b) => a.partNumber-b.partNumber).map(part => ({ partNumber: part.partNumber, sizeBytes: part.sizeBytes, sha256: part.sha256 }));
    // Terminal cleanup removes manifests; completed transfer remains historically 100%.
    const receivedBytes = upload.state === 'READY' ? upload.sizeBytes : parts.reduce((sum, part) => sum + part.sizeBytes, 0);
    return { uploadId: upload.id, state: upload.state, fileSizeBytes: upload.sizeBytes, expectedSha256: upload.sha256, fileName: upload.name,
      chunkSizeBytes: CHUNK_BYTES, totalParts: Math.ceil(upload.sizeBytes/CHUNK_BYTES), receivedParts, receivedBytes,
      uploadPercent: Math.floor(receivedBytes/upload.sizeBytes*100), expiresAt: upload.expiresAt.toISOString(),
      assetAvailable: !!asset, asset: asset ? { id: asset.id, projectId: asset.projectId, name: asset.name, type: 'video' as const, createdAt: asset.createdAt.toISOString(), mimeType: 'video/mp4' as const, sizeBytes: asset.file!.sizeBytes, contentUrl: `/projects/${asset.projectId}/assets/${asset.id}/content` } : null, error: upload.errorCode ? { code: upload.errorCode, message: upload.errorCode === 'INVALID_VIDEO' ? 'File checksum or MP4 structure is invalid.' : 'Video processing failed. Start a new upload.' } : null };
  }
  async registerPart(projectId: string, id: string, partNumber: number, bytes: Buffer) {
    const upload = await this.database.getRepository(VideoUpload).findOneBy({ id, projectId });
    if (!upload) throw new NotFoundException('Upload not found');
    if (bytes.length !== partLength(upload.sizeBytes, partNumber)) throw new BadRequestException('Part byte length does not match the session');
    const hash = sha256(bytes);
    const existing = await this.database.getRepository(UploadPart).findOneBy({ uploadId: id, partNumber });
    // Immutable unique keys prevent simultaneous conflicting PUTs from overwriting bytes.
    const key = `uploads/${id}/parts/${partNumber}-${randomUUID()}`;
    if (!existing && (!pendingStates.some(state => state === upload.state) || upload.expiresAt.getTime() <= Date.now())) {
      await this.get(projectId, id); throw new ConflictException('Upload no longer accepts parts');
    }
    if (!existing) {
      try { await this.storage.putPhoto(key, bytes, 'application/octet-stream'); }
      catch (error) {
        // A timed-out PUT may still have stored bytes; retain its identity for reconciliation.
        this.logger.warn({ uploadId: id, partNumber, key, event: 'part_storage_write_unconfirmed' });
        throw error;
      }
    }
    let registered = false;
    try {
      return await this.database.transaction(async manager => {
        const current = await this.locked(manager, projectId, id);
        // Expiry is committed by status/worker; a late request cannot register bytes.
        if (!pendingStates.some(state => state === current.state) || current.expiresAt.getTime() <= Date.now()) throw new ConflictException('Upload no longer accepts parts');
        const saved = await manager.findOneBy(UploadPart, { uploadId: id, partNumber });
        if (saved) {
          if (saved.sha256 !== hash || saved.sizeBytes !== bytes.length) throw new ConflictException('Part already contains different bytes');
          return { created: false };
        }
        if (existing) throw new ConflictException('Upload part is no longer available');
        await manager.save(UploadPart, manager.create(UploadPart, { uploadId: id, partNumber, storageKey: key, sizeBytes: bytes.length, sha256: hash }));
        current.state = 'UPLOADING'; await manager.save(current); registered = true;
        return { created: true };
      });
    } finally {
      // A failed COMMIT may have succeeded. Reconcile ownership before any cleanup.
      if (!existing) {
        try {
          const saved = await this.database.getRepository(UploadPart).findOneBy({ uploadId: id, partNumber });
          if (saved?.storageKey !== key) await this.storage.deletePhoto(key);
        } catch { this.logger.warn({ uploadId: id, partNumber, key, registered, event: 'part_cleanup_requires_reconciliation' }); }
      }
    }
  }
  async cancel(projectId: string, id: string) {
    await this.database.transaction(async manager => {
      const item = await this.locked(manager, projectId, id); await this.expire(item, manager);
      if (item.state === 'CANCELED' || item.state === 'EXPIRED') return;
      if (!pendingStates.some(state => state === item.state)) throw new ConflictException('This upload cannot be canceled');
      item.state = 'CANCELED'; await manager.save(item);
    });
    return this.get(projectId, id);
  }
  async complete(projectId: string, id: string) {
    return this.database.transaction(async manager => {
      const item = await this.locked(manager, projectId, id);
      if (item.state === 'READY' || item.state === 'PROCESSING') return item.state;
      if (!pendingStates.some(state => state === item.state) || item.expiresAt.getTime() <= Date.now()) throw new ConflictException('Upload cannot be completed');
      const parts = await manager.find(UploadPart, { where: { uploadId: id }, order: { partNumber: 'ASC' } });
      if (parts.length !== Math.ceil(item.sizeBytes/CHUNK_BYTES) || parts.some((part,index) => part.partNumber !== index || part.sizeBytes !== partLength(item.sizeBytes,index))) throw new ConflictException('All parts must be confirmed first');
      item.state = 'PROCESSING'; await manager.save(item); return item.state;
    });
  }
  async expirePending() {
    await this.database.getRepository(VideoUpload).createQueryBuilder().update().set({ state: 'EXPIRED' }).where('state IN (:...states) AND expires_at <= CURRENT_TIMESTAMP', { states: [...pendingStates] }).execute();
  }
  async cleanup() {
    const uploads = await this.database.getRepository(VideoUpload).find({ where: { state: In(['READY','FAILED','CANCELED','EXPIRED']), cleanupDone: false }, take: 4 });
    for (const upload of uploads) {
      const parts = await this.database.getRepository(UploadPart).findBy({ uploadId: upload.id });
      for (const part of parts) {
        await this.storage.deletePhoto(part.storageKey);
        await this.database.getRepository(UploadPart).delete({ uploadId: upload.id, partNumber: part.partNumber });
      }
      await this.database.getRepository(VideoUpload).update(upload.id, { cleanupDone: true });
    }
  }
}
