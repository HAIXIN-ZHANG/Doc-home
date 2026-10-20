import { VideoWorker } from './video-worker.js';
import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { UploadsService } from './uploads.service.js';
import { UploadsController } from './uploads.controller.js';
@Module({ imports: [StorageModule], providers: [UploadsService, VideoWorker], controllers: [UploadsController], exports: [UploadsService] })
export class VideosModule {}
