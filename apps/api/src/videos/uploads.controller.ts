import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { CreateUploadDto } from './create-upload.dto.js';
import { UploadsService } from './uploads.service.js';
import { CHUNK_BYTES, MAX_RECEIVING_PARTS, PART_RECEIVE_TIMEOUT_MS } from './video-policy.js';
@Controller('projects/:projectId/uploads')
export class UploadsController {
  private activePartRequests = 0;
  constructor(private readonly uploads: UploadsService) {}
  @Post() async create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateUploadDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return await this.uploads.createUpload(projectId, dto);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429)
        response.setHeader('Retry-After', '2');
      throw error;
    }
  }
  @Get(':uploadId') status(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('uploadId', ParseUUIDPipe) id: string,
  ) {
    return this.uploads.getUploadStatus(projectId, id);
  }
  @Delete(':uploadId') cancel(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('uploadId', ParseUUIDPipe) id: string,
  ) {
    return this.uploads.cancelUpload(projectId, id);
  }
  @Post(':uploadId/complete') async complete(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('uploadId', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const state = await this.uploads.completeUpload(projectId, id);
    const status = await this.uploads.getUploadStatus(projectId, id);
    if (state === 'READY' && !status.assetAvailable)
      throw new HttpException(
        { statusCode: 410, message: 'The published asset was deleted', code: 'ASSET_DELETED' },
        410,
      );
    response.status(state === 'READY' ? 200 : 202);
    return status;
  }
  @Put(':uploadId/parts/:partNumber') async part(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('uploadId', ParseUUIDPipe) id: string,
    @Param('partNumber', ParseIntPipe) index: number,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (this.activePartRequests >= MAX_RECEIVING_PARTS) {
      response.setHeader('Retry-After', '2');
      throw new HttpException('Part receiving capacity is busy', 429);
    }
    if (request.headers['content-type']?.split(';')[0].trim() !== 'application/octet-stream')
      throw new HttpException('Use application/octet-stream', 415);
    this.activePartRequests++;
    const chunks: Buffer[] = [];
    let size = 0;
    // A hard receive deadline bounds stalled requests as well as byte buffering.
    const timer = setTimeout(() => request.destroy(), PART_RECEIVE_TIMEOUT_MS);
    try {
      await this.uploads.getUploadStatus(projectId, id);
      for await (const chunk of request as AsyncIterable<Buffer>) {
        size += chunk.length;
        if (size > CHUNK_BYTES) throw new HttpException('Part exceeds 5 MiB', 413);
        chunks.push(chunk);
      }
      const result = await this.uploads.registerPart(
        projectId,
        id,
        index,
        Buffer.concat(chunks, size),
      );
      response.status(result.created ? 201 : 200);
      return { partNumber: index, confirmed: true };
    } finally {
      clearTimeout(timer);
      this.activePartRequests--;
    }
  }
}
