import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { ProjectPhotosResponseDto } from './dto/project-photos-response.dto.js';
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
}
