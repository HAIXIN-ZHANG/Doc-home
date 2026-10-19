import {
  Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { PhotoResponseDto, ProjectPhotosResponseDto } from './dto/project-photos-response.dto.js';
import { MAX_PHOTO_BYTES, PhotoUploadPipe } from './photo-upload.pipe.js';
import type { PhotoUpload } from './photo-upload.pipe.js';
import { PhotosService } from './photos.service.js';
import { PhotoSizeQueryDto } from './dto/photo-size-query.dto.js';

@Controller('projects/:projectId/photos')
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Get()
  getProjectPhotos(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ): Promise<ProjectPhotosResponseDto> {
    return this.photos.getProjectPhotos(projectId);
  }

  @Get(':photoId/content')
  async getProjectPhoto(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('photoId', new ParseUUIDPipe()) photoId: string,
    @Query() size: PhotoSizeQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const requestId: unknown = response.locals.requestId;
    const content = await this.photos.getProjectPhoto(
      projectId, photoId, size, typeof requestId === 'string' ? requestId : undefined,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // Avoid stale originals/variants after deletion; caching is a later decision.
    response.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(content.buffer, {
      type: content.mimeType,
      disposition: 'inline',
      length: content.buffer.length,
    });
  }

  @Delete(':photoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteProjectPhoto(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('photoId', new ParseUUIDPipe()) photoId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const requestId: unknown = response.locals.requestId;
    return this.photos.deleteProjectPhoto(
      projectId, photoId, typeof requestId === 'string' ? requestId : undefined,
    );
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      // Browser FormData sends UTF-8 filenames; Multer otherwise defaults to Latin-1.
      defParamCharset: 'utf8',
      // Multer rejects at its threshold; the pipe enforces an inclusive 5 MiB limit.
      limits: { fileSize: MAX_PHOTO_BYTES + 1, files: 1, fields: 0, parts: 2 },
    }),
  )
  uploadProjectPhoto(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @UploadedFile(PhotoUploadPipe) file: PhotoUpload,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PhotoResponseDto> {
    const requestId: unknown = response.locals.requestId;
    return this.photos.uploadProjectPhoto(
      projectId, file, typeof requestId === 'string' ? requestId : undefined,
    );
  }
}
