import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../projects/entities/project.entity.js';
import { StorageService } from '../storage/storage.service.js';
import type { PhotoUpload } from './photo-upload.pipe.js';
import type { PhotoResponseDto, ProjectPhotosResponseDto } from './dto/project-photos-response.dto.js';
import { Photo } from './entities/photo.entity.js';

@Injectable()
export class PhotosService {
  private readonly logger = new Logger(PhotosService.name);

  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Photo) private readonly photos: Repository<Photo>,
    private readonly storage: StorageService,
  ) {}

  async getProjectPhotos(projectId: string): Promise<ProjectPhotosResponseDto> {
    const project = await this.projects.findOne({
      where: { id: projectId },
      select: { id: true, name: true, address: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Query failures must propagate: an empty array means the query succeeded.
    const photos = await this.photos.find({
      where: { projectId },
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
      order: { createdAt: 'DESC', id: 'DESC' },
    });

    return {
      project: { id: project.id, name: project.name, address: project.address },
      photos: photos.map((photo) => this.toResponse(photo)),
    };
  }

  async uploadProjectPhoto(projectId: string, file: PhotoUpload, requestId?: string): Promise<PhotoResponseDto> {
    if (!await this.projects.existsBy({ id: projectId })) {
      throw new NotFoundException('Project not found');
    }
    const id = randomUUID();
    const extension = file.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    const storageKey = `projects/${projectId}/photos/${id}.${extension}`;
    await this.storage.putPhoto(storageKey, file.buffer, file.mimeType);

    let photo: Photo;
    try {
      const record = this.photos.create({
        id,
        projectId,
        originalName: file.originalName,
        storageKey,
        mimeType: file.mimeType,
        sizeBytes: file.buffer.length,
      });
      photo = await this.photos.save(record);
    } catch (error) {
      // This is compensation, not a transaction across PostgreSQL and S3.
      try {
        await this.storage.deletePhoto(storageKey);
      } catch (cleanupError) {
        this.logger.error({
          message: 'Photo file cleanup failed after metadata save failed',
          requestId,
          projectId,
          photoId: id,
          storageKey,
          errorType: cleanupError instanceof Error ? cleanupError.name : 'UnknownError',
        });
      }
      throw error;
    }
    return this.toResponse(photo);
  }

  private toResponse(photo: Photo): PhotoResponseDto {
    return {
      id: photo.id,
      originalName: photo.originalName,
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
      createdAt: photo.createdAt.toISOString(),
    };
  }
}
