import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import sharp from 'sharp';

import { photo, photoId, png, project, projectId, publicPhoto } from '../../test/photo-fixtures.js';
import type { StoredPhoto } from '../assets/asset-response.js';
import { AssetsService } from '../assets/assets.service.js';
import { Project } from '../projects/entities/project.entity.js';
import { StorageService } from '../storage/storage.service.js';
import { MAX_PHOTO_BYTES } from './photo-upload.pipe.js';
import { PhotosService } from './photos.service.js';

// Replace I/O dependencies at Nest's injection boundary; do not start AppModule or load .env.
const projects = {
  findOne: jest.fn<(options: unknown) => Promise<Project | null>>(),
  existsBy: jest.fn<(where: unknown) => Promise<boolean>>(),
};
const photos = {
  findPhotos: jest.fn<AssetsService['findPhotos']>(),
  findPhoto: jest.fn<AssetsService['findPhoto']>(),
  savePhoto: jest.fn<AssetsService['savePhoto']>(),
  softDelete: jest.fn<AssetsService['softDelete']>(),
};
const storage = {
  putObject: jest.fn<StorageService['putObject']>(),
  readObjectBuffer: jest.fn<StorageService['readObjectBuffer']>(),
  deleteObject: jest.fn<StorageService['deleteObject']>(),
};
let module: TestingModule;
let service: PhotosService;
let source: Buffer;
const upload = { originalName: 'photo.png', mimeType: 'image/png' as const, buffer: png };

beforeAll(async () => {
  source = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#0f766e' } })
    .png()
    .toBuffer();
});
beforeEach(async () => {
  jest.resetAllMocks();
  projects.findOne.mockResolvedValue(project);
  projects.existsBy.mockResolvedValue(true);
  photos.findPhotos.mockResolvedValue([photo]);
  photos.findPhoto.mockResolvedValue(photo);
  photos.softDelete.mockResolvedValue(undefined);
  photos.savePhoto.mockImplementation((data) =>
    Promise.resolve(Object.assign(data, { createdAt: photo.createdAt })),
  );
  storage.putObject.mockResolvedValue(undefined);
  storage.deleteObject.mockResolvedValue(undefined);
  storage.readObjectBuffer.mockResolvedValue(source);
  module = await Test.createTestingModule({
    providers: [
      PhotosService,
      { provide: getRepositoryToken(Project), useValue: projects },
      { provide: AssetsService, useValue: photos },
      { provide: StorageService, useValue: storage },
    ],
  }).compile();
  service = module.get(PhotosService);
});
afterEach(async () => {
  await module.close();
});

describe('query project photos', () => {
  it('returns the public project/photo response and requests stable sorting', async () => {
    await expect(service.getProjectPhotos(projectId)).resolves.toEqual({
      project: { id: projectId, name: project.name, address: project.address },
      photos: [publicPhoto],
    });
    expect(projects.findOne).toHaveBeenCalledWith({
      where: { id: projectId },
      select: { id: true, name: true, address: true },
    });
    expect(photos.findPhotos).toHaveBeenCalledWith(projectId);
    expect(storage.readObjectBuffer).not.toHaveBeenCalled();
  });
  it('returns a successful empty list', async () => {
    photos.findPhotos.mockResolvedValue([]);
    await expect(service.getProjectPhotos(projectId)).resolves.toMatchObject({ photos: [] });
  });
  it('returns 404 before querying photos when project is missing', async () => {
    projects.findOne.mockResolvedValue(null);
    await expect(service.getProjectPhotos(projectId)).rejects.toMatchObject({ status: 404 });
    expect(photos.findPhotos).not.toHaveBeenCalled();
  });
  it('propagates a project query failure', async () => {
    const error = new Error('project query failed');
    projects.findOne.mockRejectedValue(error);
    await expect(service.getProjectPhotos(projectId)).rejects.toBe(error);
  });
  it('does not hide a photo query failure behind an empty array', async () => {
    const error = new Error('photo query failed');
    photos.findPhotos.mockRejectedValue(error);
    await expect(service.getProjectPhotos(projectId)).rejects.toBe(error);
  });
});

describe('upload project photo', () => {
  it('generates a key, writes bytes before metadata and returns public fields', async () => {
    const result = await service.uploadProjectPhoto(projectId, upload);
    expect(storage.putObject).toHaveBeenCalledWith(
      `projects/${projectId}/photos/${result.id}.png`,
      png,
      'image/png',
    );
    expect(photos.savePhoto).toHaveBeenCalledWith(
      expect.objectContaining({
        id: result.id,
        projectId,
        sizeBytes: png.length,
        storageKey: `projects/${projectId}/photos/${result.id}.png`,
      }),
    );
    expect(storage.putObject.mock.invocationCallOrder[0]).toBeLessThan(
      photos.savePhoto.mock.invocationCallOrder[0],
    );
    expect(Object.keys(result).sort()).toEqual(Object.keys(publicPhoto).sort());
    expect(result.createdAt).toBe(publicPhoto.createdAt);
  });
  it('uses a jpg extension for detected JPEG content', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
    const result = await service.uploadProjectPhoto(projectId, {
      ...upload,
      mimeType: 'image/jpeg',
      buffer: jpeg,
    });
    expect(storage.putObject).toHaveBeenCalledWith(
      `projects/${projectId}/photos/${result.id}.jpg`,
      jpeg,
      'image/jpeg',
    );
  });
  it('does not overwrite when display filenames are identical', async () => {
    const first = await service.uploadProjectPhoto(projectId, upload);
    const second = await service.uploadProjectPhoto(projectId, upload);
    expect(first.id).not.toBe(second.id);
  });
  it('does not write files for a missing project', async () => {
    projects.existsBy.mockResolvedValue(false);
    await expect(service.uploadProjectPhoto(projectId, upload)).rejects.toMatchObject({
      status: 404,
    });
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(photos.savePhoto).not.toHaveBeenCalled();
  });
  it('propagates project lookup errors before writing bytes', async () => {
    const error = new Error('query failed');
    projects.existsBy.mockRejectedValue(error);
    await expect(service.uploadProjectPhoto(projectId, upload)).rejects.toBe(error);
    expect(storage.putObject).not.toHaveBeenCalled();
  });
  it('does not save metadata after a failed object upload', async () => {
    const error = new Error('upload failed');
    storage.putObject.mockRejectedValue(error);
    await expect(service.uploadProjectPhoto(projectId, upload)).rejects.toBe(error);
    expect(photos.savePhoto).not.toHaveBeenCalled();
  });
  it('retains bytes after a save error because the commit outcome may be unknown', async () => {
    const error = new Error('save failed');
    photos.savePhoto.mockRejectedValue(error);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(service.uploadProjectPhoto(projectId, upload)).rejects.toBe(error);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
  it('retains bytes if the save committed but its acknowledgement was lost', async () => {
    let committed: StoredPhoto | undefined;
    const error = new Error('acknowledgement lost');
    photos.savePhoto.mockImplementationOnce((record) => {
      committed = Object.assign(record, { createdAt: photo.createdAt });
      return Promise.reject(error);
    });
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(service.uploadProjectPhoto(projectId, upload, 'request-1')).rejects.toBe(error);
    expect(committed?.storageKey).toBe(storage.putObject.mock.calls[0][0]);
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-1',
        projectId,
        photoId: committed?.id,
        storageKey: committed?.storageKey,
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('acknowledgement lost');
  });
});

describe('view project photo', () => {
  it('checks both IDs and returns original byte identity without a transform', async () => {
    const result = await service.getProjectPhoto(projectId, photoId, {});
    expect(photos.findPhoto).toHaveBeenCalledWith(projectId, photoId);
    expect(storage.readObjectBuffer).toHaveBeenCalledWith(photo.storageKey, MAX_PHOTO_BYTES);
    expect(result.buffer).toBe(source);
    expect(result.mimeType).toBe('image/png');
  });
  it('does not read storage for a missing or wrong-project photo', async () => {
    photos.findPhoto.mockResolvedValue(null);
    await expect(service.getProjectPhoto(projectId, photoId, {})).rejects.toMatchObject({
      status: 404,
    });
    expect(storage.readObjectBuffer).not.toHaveBeenCalled();
  });
  it('logs a missing file and returns 404', async () => {
    storage.readObjectBuffer.mockResolvedValue(undefined);
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(
      service.getProjectPhoto(projectId, photoId, {}, 'request-2'),
    ).rejects.toMatchObject({ status: 404 });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-2', storageKey: photo.storageKey }),
    );
  });
  it('propagates storage failure rather than treating it as missing data', async () => {
    const error = new Error('storage unavailable');
    storage.readObjectBuffer.mockRejectedValue(error);
    await expect(service.getProjectPhoto(projectId, photoId, {})).rejects.toBe(error);
  });
  it('propagates database lookup failure', async () => {
    const error = new Error('database unavailable');
    photos.findPhoto.mockRejectedValue(error);
    await expect(service.getProjectPhoto(projectId, photoId, {})).rejects.toBe(error);
  });
  it.each([
    [{ w: 300 }, 300, 200],
    [{ h: 300 }, 450, 300],
    [{ w: 300, h: 300 }, 300, 200],
    [{ w: 2000, h: 2000 }, 1200, 800],
  ] as const)('resizes proportionally without enlargement: %p', async (size, width, height) => {
    const result = await service.getProjectPhoto(projectId, photoId, size);
    const metadata = await sharp(result.buffer).metadata();
    expect(metadata).toMatchObject({ width, height, format: 'png' });
  });
  it('caps the unspecified axis for extreme aspect ratios', async () => {
    storage.readObjectBuffer.mockResolvedValue(
      await sharp({ create: { width: 4000, height: 100, channels: 3, background: 'white' } })
        .png()
        .toBuffer(),
    );
    const result = await service.getProjectPhoto(projectId, photoId, { h: 300 });
    expect(await sharp(result.buffer).metadata()).toMatchObject({ width: 2048, height: 51 });
  });
  it('keeps JPEG output format and applies EXIF orientation', async () => {
    photos.findPhoto.mockResolvedValue({ ...photo, mimeType: 'image/jpeg' });
    storage.readObjectBuffer.mockResolvedValue(
      await sharp(source).jpeg().withMetadata({ orientation: 6 }).toBuffer(),
    );
    const result = await service.getProjectPhoto(projectId, photoId, { w: 300 });
    expect(result.mimeType).toBe('image/jpeg');
    expect(await sharp(result.buffer).metadata()).toMatchObject({
      width: 300,
      height: 450,
      format: 'jpeg',
    });
  });
  it('rejects corrupt image data when resizing', async () => {
    storage.readObjectBuffer.mockResolvedValue(Buffer.from('corrupt image'));
    await expect(service.getProjectPhoto(projectId, photoId, { w: 100 })).rejects.toThrow();
  });
});

describe('soft-delete photo compatibility route', () => {
  it('delegates to the shared lifecycle with an explicit photo type', async () => {
    await expect(service.deleteProjectPhoto(projectId, photoId)).resolves.toBeUndefined();
    expect(photos.softDelete).toHaveBeenCalledWith(projectId, photoId, 'photo');
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
  it('propagates a failed deletion without accessing object storage', async () => {
    const error = new Error('update result unknown');
    photos.softDelete.mockRejectedValue(error);
    await expect(service.deleteProjectPhoto(projectId, photoId)).rejects.toBe(error);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});
