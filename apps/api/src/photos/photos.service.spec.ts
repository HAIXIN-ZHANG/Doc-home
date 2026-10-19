import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import sharp from 'sharp';
import { PhotosService } from './photos.service.js';
import { Photo } from './entities/photo.entity.js';
import { Project } from '../projects/entities/project.entity.js';
import { StorageService } from '../storage/storage.service.js';
import { MAX_PHOTO_BYTES } from './photo-upload.pipe.js';
import { photo, photoId, png, project, projectId, publicPhoto } from '../../test/photo-fixtures.js';

// Replace I/O dependencies at Nest's injection boundary; do not start AppModule or load .env.
const projects = {
  findOne: jest.fn<(options: unknown) => Promise<Project | null>>(),
  existsBy: jest.fn<(where: unknown) => Promise<boolean>>(),
};
const photos = {
  find: jest.fn<(options: unknown) => Promise<Photo[]>>(),
  findOne: jest.fn<(options: unknown) => Promise<Photo | null>>(),
  create: jest.fn<(data: Partial<Photo>) => Photo>(),
  save: jest.fn<(data: Photo) => Promise<Photo>>(),
  delete: jest.fn<(where: unknown) => Promise<{ affected: number }>>(),
};
const storage = {
  putPhoto: jest.fn<StorageService['putPhoto']>(),
  getPhoto: jest.fn<StorageService['getPhoto']>(),
  deletePhoto: jest.fn<StorageService['deletePhoto']>(),
};
let module: TestingModule;
let service: PhotosService;
let source: Buffer;
const upload = { originalName: 'photo.png', mimeType: 'image/png' as const, buffer: png };

beforeAll(async () => {
  source = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#0f766e' } }).png().toBuffer();
});
beforeEach(async () => {
  jest.resetAllMocks();
  projects.findOne.mockResolvedValue(project);
  projects.existsBy.mockResolvedValue(true);
  photos.find.mockResolvedValue([photo]);
  photos.findOne.mockResolvedValue(photo);
  photos.delete.mockResolvedValue({ affected: 1 });
  photos.create.mockImplementation(data => Object.assign(new Photo(), data));
  photos.save.mockImplementation(data => Promise.resolve(Object.assign(data, { createdAt: photo.createdAt })));
  storage.putPhoto.mockResolvedValue(undefined);
  storage.deletePhoto.mockResolvedValue(undefined);
  storage.getPhoto.mockResolvedValue(source);
  module = await Test.createTestingModule({ providers: [
    PhotosService,
    { provide: getRepositoryToken(Project), useValue: projects },
    { provide: getRepositoryToken(Photo), useValue: photos },
    { provide: StorageService, useValue: storage },
  ] }).compile();
  service = module.get(PhotosService);
});
afterEach(async () => { await module.close(); });

describe('query project photos', () => {
  it('returns the public project/photo response and requests stable sorting', async () => {
    await expect(service.getProjectPhotos(projectId)).resolves.toEqual({
      project: { id: projectId, name: project.name, address: project.address }, photos: [publicPhoto],
    });
    expect(projects.findOne).toHaveBeenCalledWith({ where: { id: projectId }, select: { id: true, name: true, address: true } });
    expect(photos.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId }, order: { createdAt: 'DESC', id: 'DESC' },
    }));
    expect(storage.getPhoto).not.toHaveBeenCalled();
  });
  it('returns a successful empty list', async () => {
    photos.find.mockResolvedValue([]);
    await expect(service.getProjectPhotos(projectId)).resolves.toMatchObject({ photos: [] });
  });
  it('returns 404 before querying photos when project is missing', async () => {
    projects.findOne.mockResolvedValue(null);
    await expect(service.getProjectPhotos(projectId)).rejects.toMatchObject({ status: 404 });
    expect(photos.find).not.toHaveBeenCalled();
  });
  it('propagates a project query failure', async () => {
    const error = new Error('project query failed');
    projects.findOne.mockRejectedValue(error);
    await expect(service.getProjectPhotos(projectId)).rejects.toBe(error);
  });
  it('does not hide a photo query failure behind an empty array', async () => {
    const error = new Error('photo query failed');
    photos.find.mockRejectedValue(error);
    await expect(service.getProjectPhotos(projectId)).rejects.toBe(error);
  });
});

describe('upload project photo', () => {
  it('generates a key, writes bytes before metadata and returns public fields', async () => {
    const result = await service.uploadProjectPhoto(projectId, upload);
    expect(storage.putPhoto).toHaveBeenCalledWith(`projects/${projectId}/photos/${result.id}.png`, png, 'image/png');
    expect(photos.save).toHaveBeenCalledWith(expect.objectContaining({
      id: result.id, projectId, sizeBytes: png.length, storageKey: `projects/${projectId}/photos/${result.id}.png`,
    }));
    expect(storage.putPhoto.mock.invocationCallOrder[0]).toBeLessThan(photos.save.mock.invocationCallOrder[0]);
    expect(Object.keys(result).sort()).toEqual(Object.keys(publicPhoto).sort());
    expect(result.createdAt).toBe(publicPhoto.createdAt);
  });
  it('uses a jpg extension for detected JPEG content', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
    const result = await service.uploadProjectPhoto(projectId, { ...upload, mimeType: 'image/jpeg', buffer: jpeg });
    expect(storage.putPhoto).toHaveBeenCalledWith(`projects/${projectId}/photos/${result.id}.jpg`, jpeg, 'image/jpeg');
  });
  it('does not overwrite when display filenames are identical', async () => {
    const first = await service.uploadProjectPhoto(projectId, upload);
    const second = await service.uploadProjectPhoto(projectId, upload);
    expect(first.id).not.toBe(second.id);
  });
  it('does not write files for a missing project', async () => {
    projects.existsBy.mockResolvedValue(false);
    await expect(service.uploadProjectPhoto(projectId, upload)).rejects.toMatchObject({ status: 404 });
    expect(storage.putPhoto).not.toHaveBeenCalled();
    expect(photos.save).not.toHaveBeenCalled();
  });
  it('propagates project lookup errors before writing bytes', async () => {
    const error = new Error('query failed');
    projects.existsBy.mockRejectedValue(error);
    await expect(service.uploadProjectPhoto(projectId, upload)).rejects.toBe(error);
    expect(storage.putPhoto).not.toHaveBeenCalled();
  });
  it('does not save metadata after a failed object upload', async () => {
    const error = new Error('upload failed');
    storage.putPhoto.mockRejectedValue(error);
    await expect(service.uploadProjectPhoto(projectId, upload)).rejects.toBe(error);
    expect(photos.save).not.toHaveBeenCalled();
  });
  it('cleans up bytes after metadata save fails and preserves that error', async () => {
    const error = new Error('save failed');
    photos.save.mockRejectedValue(error);
    await expect(service.uploadProjectPhoto(projectId, upload)).rejects.toBe(error);
    expect(storage.deletePhoto).toHaveBeenCalledWith(storage.putPhoto.mock.calls[0][0]);
  });
  it('logs compensation failure with request ID without replacing the save error', async () => {
    const error = new Error('save failed');
    photos.save.mockRejectedValue(error);
    storage.deletePhoto.mockRejectedValue(new Error('PRIVATE_CLEANUP_MESSAGE'));
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(service.uploadProjectPhoto(projectId, upload, 'request-1')).rejects.toBe(error);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'request-1', projectId, errorType: 'Error' }));
    expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE_CLEANUP_MESSAGE');
  });
});

describe('view project photo', () => {
  it('checks both IDs and returns original byte identity without a transform', async () => {
    const result = await service.getProjectPhoto(projectId, photoId, {});
    expect(photos.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: photoId, projectId } }));
    expect(storage.getPhoto).toHaveBeenCalledWith(photo.storageKey, MAX_PHOTO_BYTES);
    expect(result.buffer).toBe(source);
    expect(result.mimeType).toBe('image/png');
  });
  it('does not read storage for a missing or wrong-project photo', async () => {
    photos.findOne.mockResolvedValue(null);
    await expect(service.getProjectPhoto(projectId, photoId, {})).rejects.toMatchObject({ status: 404 });
    expect(storage.getPhoto).not.toHaveBeenCalled();
  });
  it('logs a missing file and returns 404', async () => {
    storage.getPhoto.mockResolvedValue(undefined);
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(service.getProjectPhoto(projectId, photoId, {}, 'request-2')).rejects.toMatchObject({ status: 404 });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'request-2', storageKey: photo.storageKey }));
  });
  it('propagates storage failure rather than treating it as missing data', async () => {
    const error = new Error('storage unavailable');
    storage.getPhoto.mockRejectedValue(error);
    await expect(service.getProjectPhoto(projectId, photoId, {})).rejects.toBe(error);
  });
  it('propagates database lookup failure', async () => {
    const error = new Error('database unavailable');
    photos.findOne.mockRejectedValue(error);
    await expect(service.getProjectPhoto(projectId, photoId, {})).rejects.toBe(error);
  });
  it.each([
    [{ w: 300 }, 300, 200], [{ h: 300 }, 450, 300],
    [{ w: 300, h: 300 }, 300, 200], [{ w: 2000, h: 2000 }, 1200, 800],
  ] as const)('resizes proportionally without enlargement: %p', async (size, width, height) => {
    const result = await service.getProjectPhoto(projectId, photoId, size);
    const metadata = await sharp(result.buffer).metadata();
    expect(metadata).toMatchObject({ width, height, format: 'png' });
  });
  it('caps the unspecified axis for extreme aspect ratios', async () => {
    storage.getPhoto.mockResolvedValue(await sharp({ create: { width: 4000, height: 100, channels: 3, background: 'white' } }).png().toBuffer());
    const result = await service.getProjectPhoto(projectId, photoId, { h: 300 });
    expect(await sharp(result.buffer).metadata()).toMatchObject({ width: 2048, height: 51 });
  });
  it('keeps JPEG output format and applies EXIF orientation', async () => {
    photos.findOne.mockResolvedValue(Object.assign(new Photo(), photo, { mimeType: 'image/jpeg' }));
    storage.getPhoto.mockResolvedValue(await sharp(source).jpeg().withMetadata({ orientation: 6 }).toBuffer());
    const result = await service.getProjectPhoto(projectId, photoId, { w: 300 });
    expect(result.mimeType).toBe('image/jpeg');
    expect(await sharp(result.buffer).metadata()).toMatchObject({ width: 300, height: 450, format: 'jpeg' });
  });
  it('rejects corrupt image data when resizing', async () => {
    storage.getPhoto.mockResolvedValue(Buffer.from('corrupt image'));
    await expect(service.getProjectPhoto(projectId, photoId, { w: 100 })).rejects.toThrow();
  });
});


describe('delete project photo', () => {
  it('deletes only the associated record, then cleans up its file', async () => {
    await expect(service.deleteProjectPhoto(projectId, photoId)).resolves.toBeUndefined();
    expect(photos.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: photoId, projectId } }));
    expect(photos.delete).toHaveBeenCalledWith({ id: photoId, projectId });
    expect(storage.deletePhoto).toHaveBeenCalledWith(photo.storageKey);
    expect(photos.delete.mock.invocationCallOrder[0]).toBeLessThan(storage.deletePhoto.mock.invocationCallOrder[0]);
  });
  it('does not touch files or records when photo is absent or belongs elsewhere', async () => {
    photos.findOne.mockResolvedValue(null);
    await expect(service.deleteProjectPhoto(projectId, photoId)).rejects.toMatchObject({ status: 404 });
    expect(photos.delete).not.toHaveBeenCalled();
    expect(storage.deletePhoto).not.toHaveBeenCalled();
  });
  it('preserves the file when the metadata lookup fails', async () => {
    const error = new Error('query failed');
    photos.findOne.mockRejectedValue(error);
    await expect(service.deleteProjectPhoto(projectId, photoId)).rejects.toBe(error);
    expect(storage.deletePhoto).not.toHaveBeenCalled();
  });
  it('preserves the file when database deletion fails', async () => {
    const error = new Error('delete failed');
    photos.delete.mockRejectedValue(error);
    await expect(service.deleteProjectPhoto(projectId, photoId)).rejects.toBe(error);
    expect(storage.deletePhoto).not.toHaveBeenCalled();
  });
  it('handles a concurrent record deletion without deleting bytes again', async () => {
    photos.delete.mockResolvedValue({ affected: 0 });
    await expect(service.deleteProjectPhoto(projectId, photoId)).rejects.toMatchObject({ status: 404 });
    expect(storage.deletePhoto).not.toHaveBeenCalled();
  });
  it('logs failed file cleanup but keeps the committed deletion successful', async () => {
    storage.deletePhoto.mockRejectedValue(new Error('PRIVATE_STORAGE_MESSAGE'));
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(service.deleteProjectPhoto(projectId, photoId, 'delete-request')).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'delete-request', storageKey: photo.storageKey }));
    expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE_STORAGE_MESSAGE');
  });
});
