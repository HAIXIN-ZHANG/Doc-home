import { randomUUID } from 'node:crypto';

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import sharp from 'sharp';
import { Repository } from 'typeorm';

import type { StoredPhoto } from '../assets/asset-response.js';
import { AssetsService } from '../assets/assets.service.js';
import type { PhotoMimeType } from '../assets/file-detail.entity.js';
import { Project } from '../projects/entities/project.entity.js';
import { StorageService } from '../storage/storage.service.js';
import { MAX_PHOTO_DIMENSION } from './dto/photo-size-query.dto.js';
import type { PhotoSizeQueryDto } from './dto/photo-size-query.dto.js';
import type {
  PhotoResponseDto,
  ProjectPhotosResponseDto,
} from './dto/project-photos-response.dto.js';
import { MAX_PHOTO_BYTES } from './photo-upload.pipe.js';
import type { PhotoUpload } from './photo-upload.pipe.js';

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
    private readonly assets: AssetsService,
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

    const photos = await this.assets.findPhotos(projectId);

    return {
      project: { id: project.id, name: project.name, address: project.address },
      photos: photos.map((photo) => this.toResponse(photo)),
    };
  }

  async uploadProjectPhoto(
    projectId: string,
    file: PhotoUpload,
    requestId?: string,
  ): Promise<PhotoResponseDto> {
    if (!(await this.projects.existsBy({ id: projectId }))) {
      throw new NotFoundException('Project not found');
    }
    const id = randomUUID();
    const extension = file.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    // A display filename must never choose the object key or overwrite another upload.
    const storageKey = `projects/${projectId}/photos/${id}.${extension}`;
    await this.storage.putObject(storageKey, file.buffer, file.mimeType);

    let photo: StoredPhoto;
    try {
      photo = await this.assets.savePhoto({
        id,
        projectId,
        originalName: file.originalName,
        storageKey,
        mimeType: file.mimeType,
        sizeBytes: file.buffer.length,
      });
    } catch (error) {
      // A save error can follow a committed transaction with a lost acknowledgement.
      // Retain the file rather than break a valid record; reconcile using these IDs.
      this.logger.error({
        message: 'Photo metadata save failed; uploaded file retained for reconciliation',
        requestId,
        projectId,
        photoId: id,
        storageKey,
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
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
    const photo = await this.assets.findPhoto(projectId, photoId);
    if (!photo) throw new NotFoundException('Photo not found');

    const original = await this.storage.readObjectBuffer(photo.storageKey, MAX_PHOTO_BYTES);
    if (!original) {
      this.logger.error({
        message: 'Photo metadata exists but its file is missing',
        requestId,
        projectId,
        photoId,
        storageKey: photo.storageKey,
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

  deleteProjectPhoto(projectId: string, photoId: string): Promise<void> {
    return this.assets.softDelete(projectId, photoId, 'photo');
  }

  // Query and upload share this public contract; persistence-only fields stay private.
  private toResponse(photo: StoredPhoto): PhotoResponseDto {
    return {
      id: photo.id,
      originalName: photo.originalName,
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
      createdAt: photo.createdAt.toISOString(),
    };
  }
}
