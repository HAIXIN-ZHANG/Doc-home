import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { AssetsModule } from '../assets/assets.module.js';
import { PhotosController } from './photos.controller.js';
import { PhotosService } from './photos.service.js';

@Module({
  imports: [ProjectsModule, StorageModule, AssetsModule],
  controllers: [PhotosController],
  providers: [PhotosService],
  exports: [PhotosService],
})
export class PhotosModule {}
