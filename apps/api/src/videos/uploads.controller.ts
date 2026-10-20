import { Body, Controller, Delete, Get, HttpException, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CreateUploadDto } from './create-upload.dto.js';
import { UploadsService } from './uploads.service.js';
import { CHUNK_BYTES } from './video-policy.js';
@Controller('projects/:projectId/uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}
  @Post() create(@Param('projectId', ParseUUIDPipe) project: string, @Body() dto: CreateUploadDto) { return this.uploads.create(project,dto); }
  @Get(':uploadId') status(@Param('projectId', ParseUUIDPipe) project: string, @Param('uploadId', ParseUUIDPipe) id: string) { return this.uploads.get(project,id); }
  @Delete(':uploadId') cancel(@Param('projectId', ParseUUIDPipe) project: string, @Param('uploadId', ParseUUIDPipe) id: string) { return this.uploads.cancel(project,id); }
  @Post(':uploadId/complete') async complete(@Param('projectId', ParseUUIDPipe) project: string, @Param('uploadId', ParseUUIDPipe) id: string, @Res({passthrough:true}) response: Response) {
    const state = await this.uploads.complete(project,id);
    const status = await this.uploads.get(project,id);
    if (state === 'READY' && !status.assetAvailable) throw new HttpException({ statusCode: 410, message: 'The published asset was deleted', code: 'ASSET_DELETED' },410);
    response.status(state === 'READY' ? 200 : 202); return status;
  }
  @Put(':uploadId/parts/:partNumber') async part(@Param('projectId', ParseUUIDPipe) project: string, @Param('uploadId', ParseUUIDPipe) id: string,
    @Param('partNumber', ParseIntPipe) index: number, @Req() request: Request, @Res({passthrough:true}) response: Response) {
    if (this.uploads.receiving >= 4) { response.setHeader('Retry-After','2'); throw new HttpException('Part receiving capacity is busy',429); }
    if (request.headers['content-type']?.split(';')[0].trim() !== 'application/octet-stream') throw new HttpException('Use application/octet-stream',415);
    this.uploads.receiving++;
    const chunks: Buffer[] = []; let size = 0;
    // A hard receive deadline bounds stalled requests as well as byte buffering.
    const timer = setTimeout(() => request.destroy(),30_000);
    try {
      await this.uploads.get(project,id);
      for await (const chunk of request as AsyncIterable<Buffer>) {
        size += chunk.length;
        if (size > CHUNK_BYTES) throw new HttpException('Part exceeds 5 MiB',413);
        chunks.push(chunk);
      }
      const result = await this.uploads.registerPart(project,id,index,Buffer.concat(chunks,size));
      response.status(result.created ? 201 : 200); return { partNumber: index, confirmed: true };
    } finally { clearTimeout(timer); this.uploads.receiving--; }
  }
}
