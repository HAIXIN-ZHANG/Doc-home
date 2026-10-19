import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import sharp from 'sharp';
import { Project } from '../projects/entities/project.entity.js';
import { StorageService } from '../storage/storage.service.js';
import { MAX_PHOTO_BYTES } from './photo-upload.pipe.js';
import type { PhotoUpload } from './photo-upload.pipe.js';
import { MAX_PHOTO_DIMENSION } from './dto/photo-size-query.dto.js';
import type { PhotoSizeQueryDto } from './dto/photo-size-query.dto.js';
import type { PhotoMimeType } from './entities/photo.entity.js';
import type { PhotoResponseDto, ProjectPhotosResponseDto } from './dto/project-photos-response.dto.js';
import { Photo } from './entities/photo.entity.js';

// A small compressed upload can still decode into a very large image.
const MAX_SOURCE_PIXELS = 40_000_000;

export interface PhotoContent {
  buffer: Buffer;
  mimeType: PhotoMimeType;
}

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
    // A display filename must never choose the object key or overwrite another upload.
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
      // Preserve the save failure even if compensation also failed.
      throw error;
    }
    return this.toResponse(photo);
  }

  async getProjectPhoto(
    projectId: string,
    photoId: string,
    size: PhotoSizeQueryDto,
    requestId?: string,
  ): Promise<PhotoContent> {
    // Scope by both IDs; knowing a photo UUID must not bypass project association.
    const photo = await this.photos.findOne({
      where: { id: photoId, projectId },
      select: { id: true, storageKey: true, mimeType: true },
    });
    if (!photo) throw new NotFoundException('Photo not found');

    const original = await this.storage.getPhoto(photo.storageKey, MAX_PHOTO_BYTES);
    if (!original) {
      this.logger.error({
        message: 'Photo metadata exists but its file is missing',
        requestId, projectId, photoId, storageKey: photo.storageKey,
      });
      throw new NotFoundException('Photo file not found');
    }
    // Preserve byte identity and metadata when no transformation was requested.
    if (size.w === undefined && size.h === undefined) {
      return { buffer: original, mimeType: photo.mimeType };
    }

    const buffer = await sharp(original, { limitInputPixels: MAX_SOURCE_PIXELS })
      .rotate()
      // fit:inside preserves proportions without cropping. The unspecified axis
      // also has a cap, so extreme aspect ratios cannot bypass the output limit.
      .resize({
        width: size.w ?? MAX_PHOTO_DIMENSION,
        height: size.h ?? MAX_PHOTO_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toFormat(photo.mimeType === 'image/jpeg' ? 'jpeg' : 'png')
      .timeout({ seconds: 5 })
      .toBuffer();
    return { buffer, mimeType: photo.mimeType };
  }

  // Query and upload share this public contract; persistence-only fields stay private.
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
