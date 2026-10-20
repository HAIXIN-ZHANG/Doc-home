import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { VideoUpload } from '../assets/upload.entity.js';
import { UploadPart } from './upload-part.entity.js';
import { Asset } from '../assets/asset.entity.js';
import { FileDetail } from '../assets/file-detail.entity.js';
import { UploadsService } from './uploads.service.js';
import { InvalidVideo, MAX_VIDEO_BYTES, sha256, validateMp4 } from './video-policy.js';
@Injectable()
export class VideoWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VideoWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;
  constructor(private readonly database: DataSource, private readonly uploads: UploadsService) {}
  onModuleInit() {
    this.timer = setInterval(() => { void this.tick(); }, 1000); this.timer.unref();
    void this.tick();
  }
  async onModuleDestroy() { this.stopping = true; clearInterval(this.timer); await this.running; }
  async tick() {
    if (this.stopping || this.running) return;
    this.running = this.work().catch(() => { this.logger.warn({event:'video_worker_scan_failed'}); });
    try { await this.running; } finally { this.running = undefined; }
  }
  private async work() {
    await this.uploads.expirePending();
    // Reconcile publication before claiming an attempt, including a lost COMMIT acknowledgement.
    const candidates = await this.database.getRepository(VideoUpload).find({where:{state:'PROCESSING'},order:{createdAt:'ASC'}});
    for (const upload of candidates) {
      const published = await this.database.getRepository(FileDetail).findOneBy({uploadId:upload.id});
      if (published) {
        await this.database.getRepository(VideoUpload).update({id:upload.id,state:'PROCESSING'},{state:'READY',errorCode:null});
        continue;
      }
      if (upload.nextAttemptAt && upload.nextAttemptAt.getTime()>Date.now()) continue;
      if (upload.attemptDeadline && upload.attemptDeadline.getTime()>Date.now()) continue;
      if (upload.attempts>=2) {
        await this.database.getRepository(VideoUpload).update({id:upload.id,state:'PROCESSING'},{state:'FAILED',errorCode:'PROCESSING_FAILED'}); continue;
      }
      const attempt = await this.database.transaction(async manager => {
        const current = await this.uploads.locked(manager,upload.projectId,upload.id);
        if (current.state !== 'PROCESSING' || current.attempts !== upload.attempts) return null;
        current.attempts++; current.attemptStartedAt = new Date(); current.attemptDeadline = new Date(Date.now()+60_000); current.nextAttemptAt=null;
        return manager.save(current);
      });
      if (attempt) await this.finalize(attempt);
      break; // One bounded merge/finalizer at a time in this single-instance deployment.
    }
    try { await this.uploads.cleanup(); } catch { this.logger.warn({event:'temporary_part_cleanup_will_retry'}); }
  }
  private async finalize(upload: VideoUpload) {
    const signal = AbortSignal.timeout(Math.max(1,upload.attemptDeadline!.getTime()-Date.now()));
    let stage: 'storage' | 'database' = 'storage';
    try {
      const parts = await this.database.getRepository(UploadPart).find({where:{uploadId:upload.id},order:{partNumber:'ASC'}});
      const chunks: Buffer[]=[];
      for (const part of parts) {
        signal.throwIfAborted();
        const bytes = await this.uploads.storage.getPhoto(part.storageKey,part.sizeBytes,signal);
        if (!bytes || bytes.length !== part.sizeBytes || sha256(bytes)!==part.sha256) throw new InvalidVideo('Part checksum mismatch');
        chunks.push(bytes);
      }
      const bytes = Buffer.concat(chunks);
      if (bytes.length !== upload.sizeBytes || bytes.length>MAX_VIDEO_BYTES || sha256(bytes)!==upload.sha256) throw new InvalidVideo('File checksum mismatch');
      validateMp4(bytes); signal.throwIfAborted();
      // Stable key across retries; immutable session hash makes retries write the same bytes.
      const key = `projects/${upload.projectId}/videos/${upload.id}.mp4`;
      await this.uploads.storage.putPhoto(key,bytes,'video/mp4',signal);
      signal.throwIfAborted(); stage='database';
      await this.database.transaction(async manager => {
        const current = await this.uploads.locked(manager,upload.projectId,upload.id);
        if (current.state !== 'PROCESSING' || current.attempts !== upload.attempts || current.attemptDeadline!.getTime()<=Date.now()) return;
        const existing = await manager.findOneBy(FileDetail,{uploadId:upload.id});
        if (!existing) {
          const id = randomUUID();
          await manager.save(Asset,manager.create(Asset,{id,projectId:upload.projectId,type:'video',name:upload.name}));
          await manager.save(FileDetail,manager.create(FileDetail,{assetId:id,storageKey:key,mimeType:'video/mp4',sizeBytes:upload.sizeBytes,uploadId:upload.id}));
        }
        current.state='READY'; current.errorCode=null; await manager.save(current);
      });
    } catch(error) {
      // Never delete a completed object following an uncertain SQL outcome. The next scan reconciles uploadId.
      if (stage==='database') { this.logger.warn({uploadId:upload.id,event:'publication_requires_reconciliation'}); return; }
      await this.database.transaction(async manager => {
        const current = await this.uploads.locked(manager,upload.projectId,upload.id);
        if(current.state!=='PROCESSING' || current.attempts!==upload.attempts) return;
        const invalid = error instanceof InvalidVideo;
        if(invalid || current.attempts>=2) { current.state='FAILED'; current.errorCode=invalid?'INVALID_VIDEO':'PROCESSING_FAILED'; }
        else { current.attemptDeadline=null; current.nextAttemptAt=new Date(Date.now()+2000); }
        await manager.save(current);
      });
    }
  }
}
