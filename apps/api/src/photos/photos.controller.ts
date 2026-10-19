import {
  Controller, Get, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { PhotoResponseDto, ProjectPhotosResponseDto } from './dto/project-photos-response.dto.js';
import { MAX_PHOTO_BYTES, PhotoUploadPipe } from './photo-upload.pipe.js';
import type { PhotoUpload } from './photo-upload.pipe.js';
import { PhotosService } from './photos.service.js';

@Controller('projects/:projectId/photos')
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Get()
  getProjectPhotos(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ): Promise<ProjectPhotosResponseDto> {
    return this.photos.getProjectPhotos(projectId);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
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
