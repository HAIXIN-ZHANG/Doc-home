import { Headers, NotFoundException } from '@nestjs/common';
import { StorageService } from '../storage/storage.service.js';
import { byteRange } from '../videos/video-policy.js';
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { PhotosService } from '../photos/photos.service.js';
import { PhotoSizeQueryDto } from '../photos/dto/photo-size-query.dto.js';
import { AssetsService } from './assets.service.js';
import { CreateLinkDto } from './create-link.dto.js';

// Registered at the app boundary because these routes combine asset and photo services.
@Controller('projects/:projectId')
export class AssetsController {
  constructor(private readonly assets: AssetsService, private readonly photos: PhotosService, private readonly storage: StorageService) {}
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
    @Query() size: PhotoSizeQueryDto, @Headers('range') rangeHeader: string | undefined, @Res({ passthrough: true }) response: Response) {
    const video = await this.assets.findVideo(projectId, id);
    if (video?.file) {
      const file = video.file;
      response.setHeader('Accept-Ranges', 'bytes');
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      let range;
      try { range = byteRange(rangeHeader,file.sizeBytes); }
      catch (error) { response.setHeader('Content-Range',`bytes */${file.sizeBytes}`); throw error; }
      const stream = await this.storage.videoStream(file.storageKey,range ?? undefined);
      if (!stream) throw new NotFoundException('Video content not found');
      if (range) { response.status(206); response.setHeader('Content-Range',`bytes ${range.start}-${range.end}/${file.sizeBytes}`); }
      response.on('close',() => stream.destroy());
      return new StreamableFile(stream,{type:'video/mp4',disposition:'inline',length:range ? range.end-range.start+1 : file.sizeBytes});
    }
    const requestId: unknown = response.locals.requestId;
    const content = await this.photos.getProjectPhoto(projectId, id, size, typeof requestId === 'string' ? requestId : undefined);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(content.buffer, { type: content.mimeType, disposition: 'inline', length: content.buffer.length });
  }
}
