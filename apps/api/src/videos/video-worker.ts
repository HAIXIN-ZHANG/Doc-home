import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { Asset } from '../assets/asset.entity.js';
import { FileDetail } from '../assets/file-detail.entity.js';
import { StorageService } from '../storage/storage.service.js';
import { UploadPart } from './upload-part.entity.js';
import { UploadsService } from './uploads.service.js';
import {
  InvalidVideo,
  MAX_VIDEO_BYTES,
  sha256,
  validateMp4,
  MAX_PROCESSING_ATTEMPTS,
  PROCESSING_ATTEMPT_TIMEOUT_MS,
  PROCESSING_RETRY_DELAY_MS,
  UPLOAD_SCAN_INTERVAL_MS,
} from './video-policy.js';
import { VideoUpload } from './video-upload.entity.js';

@Injectable()
export class VideoWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VideoWorker.name);
  private scanTimer?: ReturnType<typeof setInterval>;
  private activeScan?: Promise<void>;
  private isStopping = false;

  constructor(
    private readonly database: DataSource,
    private readonly uploads: UploadsService,
    private readonly storage: StorageService,
  ) {}

  onModuleInit(): void {
    this.scanTimer = setInterval(() => {
      void this.tick();
    }, UPLOAD_SCAN_INTERVAL_MS);
    this.scanTimer.unref();
    void this.tick();
  }

  async onModuleDestroy(): Promise<void> {
    this.isStopping = true;
    clearInterval(this.scanTimer);
    await this.activeScan;
  }

  async tick(): Promise<void> {
    if (this.isStopping || this.activeScan) return;
    this.activeScan = this.scan().catch(() => {
      this.logger.warn({ event: 'video_worker_scan_failed' });
    });
    try {
      await this.activeScan;
    } finally {
      this.activeScan = undefined;
    }
  }

  private async scan(): Promise<void> {
    await this.uploads.expirePendingUploads();
    await this.processNextUpload();
    try {
      await this.uploads.cleanupTemporaryParts();
    } catch {
      this.logger.warn({ event: 'temporary_part_cleanup_will_retry' });
    }
  }

  private async processNextUpload(): Promise<void> {
    const queuedUploads = await this.database.getRepository(VideoUpload).find({
      where: { state: 'PROCESSING' },
      order: { createdAt: 'ASC' },
    });
    for (const upload of queuedUploads) {
      // A lost COMMIT acknowledgement must be reconciled before claiming another attempt.
      const publishedFile = await this.database
        .getRepository(FileDetail)
        .findOneBy({ uploadId: upload.id });
      if (publishedFile) {
        await this.database
          .getRepository(VideoUpload)
          .update({ id: upload.id, state: 'PROCESSING' }, { state: 'READY', errorCode: null });
        continue;
      }
      if (upload.nextAttemptAt && upload.nextAttemptAt.getTime() > Date.now()) continue;
      if (upload.attemptDeadline && upload.attemptDeadline.getTime() > Date.now()) continue;
      if (upload.attempts >= MAX_PROCESSING_ATTEMPTS) {
        await this.database
          .getRepository(VideoUpload)
          .update(
            { id: upload.id, state: 'PROCESSING' },
            { state: 'FAILED', errorCode: 'PROCESSING_FAILED' },
          );
        continue;
      }
      const attempt = await this.claimAttempt(upload);
      if (attempt) await this.finalize(attempt);
      return; // One bounded merge at a time in this single-instance deployment.
    }
  }

  private async claimAttempt(upload: VideoUpload): Promise<VideoUpload | null> {
    return this.database.transaction(async (manager) => {
      const current = await this.uploads.lockUpload(manager, upload.projectId, upload.id);
      if (current.state !== 'PROCESSING' || current.attempts !== upload.attempts) return null;
      current.attempts++;
      current.attemptStartedAt = new Date();
      current.attemptDeadline = new Date(Date.now() + PROCESSING_ATTEMPT_TIMEOUT_MS);
      current.nextAttemptAt = null;
      return manager.save(current);
    });
  }

  private async assembleVideo(upload: VideoUpload, signal: AbortSignal): Promise<Buffer> {
    const parts = await this.database
      .getRepository(UploadPart)
      .find({ where: { uploadId: upload.id }, order: { partNumber: 'ASC' } });
    const chunks: Buffer[] = [];
    for (const part of parts) {
      signal.throwIfAborted();
      const bytes = await this.storage.readObjectBuffer(part.storageKey, part.sizeBytes, signal);
      if (!bytes || bytes.length !== part.sizeBytes || sha256(bytes) !== part.sha256)
        throw new InvalidVideo('Part checksum mismatch');
      chunks.push(bytes);
    }
    const bytes = Buffer.concat(chunks);
    if (
      bytes.length !== upload.sizeBytes ||
      bytes.length > MAX_VIDEO_BYTES ||
      sha256(bytes) !== upload.sha256
    )
      throw new InvalidVideo('File checksum mismatch');
    validateMp4(bytes);
    return bytes;
  }

  private async publishAsset(upload: VideoUpload, storageKey: string): Promise<void> {
    await this.database.transaction(async (manager) => {
      const current = await this.uploads.lockUpload(manager, upload.projectId, upload.id);
      if (
        current.state !== 'PROCESSING' ||
        current.attempts !== upload.attempts ||
        !current.attemptDeadline ||
        current.attemptDeadline.getTime() <= Date.now()
      )
        return;
      const publishedFile = await manager.findOneBy(FileDetail, { uploadId: upload.id });
      if (!publishedFile) {
        const assetId = randomUUID();
        await manager.save(
          Asset,
          manager.create(Asset, {
            id: assetId,
            projectId: upload.projectId,
            type: 'video',
            name: upload.name,
          }),
        );
        await manager.save(
          FileDetail,
          manager.create(FileDetail, {
            assetId,
            storageKey,
            mimeType: 'video/mp4',
            sizeBytes: upload.sizeBytes,
            uploadId: upload.id,
          }),
        );
      }
      current.state = 'READY';
      current.errorCode = null;
      await manager.save(current);
    });
  }

  private async recordAttemptFailure(upload: VideoUpload, error: unknown): Promise<void> {
    await this.database.transaction(async (manager) => {
      const current = await this.uploads.lockUpload(manager, upload.projectId, upload.id);
      if (current.state !== 'PROCESSING' || current.attempts !== upload.attempts) return;
      if (error instanceof InvalidVideo || current.attempts >= MAX_PROCESSING_ATTEMPTS) {
        current.state = 'FAILED';
        current.errorCode = error instanceof InvalidVideo ? 'INVALID_VIDEO' : 'PROCESSING_FAILED';
      } else {
        current.attemptDeadline = null;
        current.nextAttemptAt = new Date(Date.now() + PROCESSING_RETRY_DELAY_MS);
      }
      await manager.save(current);
    });
  }

  private async finalize(upload: VideoUpload): Promise<void> {
    if (!upload.attemptDeadline) throw new Error('Processing attempt has no deadline');
    const signal = AbortSignal.timeout(Math.max(1, upload.attemptDeadline.getTime() - Date.now()));
    let isPublishing = false;
    try {
      const bytes = await this.assembleVideo(upload, signal);
      signal.throwIfAborted();
      // Session identity fixes the content, so retries can safely reuse this final key.
      const storageKey = `projects/${upload.projectId}/videos/${upload.id}.mp4`;
      await this.storage.putObject(storageKey, bytes, 'video/mp4', signal);
      signal.throwIfAborted();
      isPublishing = true;
      await this.publishAsset(upload, storageKey);
    } catch (error) {
      if (isPublishing) {
        // SQL may have committed. Keep the object and reconcile its upload association on the next scan.
        this.logger.warn({ uploadId: upload.id, event: 'publication_requires_reconciliation' });
        return;
      }
      await this.recordAttemptFailure(upload, error);
    }
  }
}
