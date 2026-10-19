import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { PhotosController } from './photos.controller.js';
import { PhotosService } from './photos.service.js';
import { photoId, projectId, project, publicPhoto, png, httpResponse } from '../../test/photo-fixtures.js';

const photos = {
  getProjectPhotos: jest.fn<PhotosService['getProjectPhotos']>(),
  uploadProjectPhoto: jest.fn<PhotosService['uploadProjectPhoto']>(),
  getProjectPhoto: jest.fn<PhotosService['getProjectPhoto']>(),
  deleteProjectPhoto: jest.fn<PhotosService['deleteProjectPhoto']>(),
};
let controller: PhotosController;
let module: TestingModule;
beforeEach(async () => {
  module = await Test.createTestingModule({
    controllers: [PhotosController], providers: [{ provide: PhotosService, useValue: photos }],
  }).compile();
  controller = module.get(PhotosController);
});
afterEach(async () => { await module.close(); });

describe('PhotosController (four endpoint handlers)', () => {
  it('delegates query and returns its response', async () => {
    const result = { project, photos: [publicPhoto] };
    photos.getProjectPhotos.mockResolvedValue(result);
    await expect(controller.getProjectPhotos(projectId)).resolves.toEqual(result);
    expect(photos.getProjectPhotos).toHaveBeenCalledWith(projectId);
  });
  it('delegates upload and includes the server-generated request ID', async () => {
    const { response, asExpress } = httpResponse();
    response.locals.requestId = 'request-1';
    const file = { originalName: 'photo.png', mimeType: 'image/png' as const, buffer: png };
    photos.uploadProjectPhoto.mockResolvedValue(publicPhoto);
    await expect(controller.uploadProjectPhoto(projectId, file, asExpress)).resolves.toEqual(publicPhoto);
    expect(photos.uploadProjectPhoto).toHaveBeenCalledWith(projectId, file, 'request-1');
  });
  it('returns image bytes and safe response headers for view', async () => {
    const { response, asExpress } = httpResponse();
    response.locals.requestId = 'request-2';
    photos.getProjectPhoto.mockResolvedValue({ buffer: png, mimeType: 'image/png' });
    const result = await controller.getProjectPhoto(projectId, photoId, { w: 300 }, asExpress);
    expect(photos.getProjectPhoto).toHaveBeenCalledWith(projectId, photoId, { w: 300 }, 'request-2');
    expect(result.getHeaders()).toEqual({ type: 'image/png', disposition: 'inline', length: png.length });
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(response.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
  });
  it('propagates not-found errors without sending image success headers', async () => {
    const { response, asExpress } = httpResponse();
    const error = new NotFoundException('Photo not found');
    photos.getProjectPhoto.mockRejectedValue(error);
    await expect(controller.getProjectPhoto(projectId, photoId, {}, asExpress)).rejects.toBe(error);
    expect(response.setHeader).not.toHaveBeenCalled();
  });
  it('delegates deletion with its project, photo and server request ID', async () => {
    const { response, asExpress } = httpResponse();
    response.locals.requestId = 'delete-request';
    photos.deleteProjectPhoto.mockResolvedValue(undefined);
    await expect(controller.deleteProjectPhoto(projectId, photoId, asExpress)).resolves.toBeUndefined();
    expect(photos.deleteProjectPhoto).toHaveBeenCalledWith(projectId, photoId, 'delete-request');
  });
  it('does not accept a non-string request ID from response locals', async () => {
    const { response, asExpress } = httpResponse();
    response.locals.requestId = {};
    photos.getProjectPhoto.mockResolvedValue({ buffer: png, mimeType: 'image/png' });
    await controller.getProjectPhoto(projectId, photoId, {}, asExpress);
    expect(photos.getProjectPhoto).toHaveBeenCalledWith(projectId, photoId, {}, undefined);
  });
});
