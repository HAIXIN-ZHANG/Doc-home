import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { PhotosService } from '../photos/photos.service.js';
import { PhotoSizeQueryDto } from '../photos/dto/photo-size-query.dto.js';
import { AssetsService } from './assets.service.js';
import { CreateLinkDto } from './create-link.dto.js';

// Registered at the app boundary because these routes combine asset and photo services.
@Controller('projects/:projectId')
export class AssetsController {
  constructor(private readonly assets: AssetsService, private readonly photos: PhotosService) {}
  @Get('assets')
  list(@Param('projectId', new ParseUUIDPipe()) projectId: string) { return this.assets.getProjectAssets(projectId); }
  @Post('links')
  createLink(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Body() dto: CreateLinkDto) { return this.assets.createLink(projectId, dto); }
  @Delete('assets/:assetId') @HttpCode(204)
  delete(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Param('assetId', new ParseUUIDPipe()) id: string) {
    return this.assets.softDelete(projectId, id);
  }
  @Get('assets/:assetId/content')
  async content(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Param('assetId', new ParseUUIDPipe()) id: string,
    @Query() size: PhotoSizeQueryDto, @Res({ passthrough: true }) response: Response) {
    const requestId: unknown = response.locals.requestId;
    const content = await this.photos.getProjectPhoto(projectId, id, size, typeof requestId === 'string' ? requestId : undefined);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(content.buffer, { type: content.mimeType, disposition: 'inline', length: content.buffer.length });
  }
}
