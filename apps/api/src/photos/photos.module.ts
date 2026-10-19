import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsModule } from '../projects/projects.module.js';
import { Photo } from './entities/photo.entity.js';
import { PhotosController } from './photos.controller.js';
import { PhotosService } from './photos.service.js';

@Module({
  imports: [ProjectsModule, TypeOrmModule.forFeature([Photo])],
  controllers: [PhotosController],
  providers: [PhotosService],
})
export class PhotosModule {}
