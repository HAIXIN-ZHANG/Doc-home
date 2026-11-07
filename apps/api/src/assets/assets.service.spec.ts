import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Project } from '../projects/entities/project.entity.js';
import { Asset } from './asset.entity.js';
import { FileDetail } from './file-detail.entity.js';
import { LinkDetail } from './link-detail.entity.js';
import { AssetsService, normalizeLink } from './assets.service.js';
import { CreateLinkDto } from './create-link.dto.js';
import { project, projectId, photoId } from '../../test/photo-fixtures.js';

const rows = { find: jest.fn<(options: unknown) => Promise<Asset[]>>(), findOne: jest.fn<() => Promise<Asset | null>>(),
  update: jest.fn<(scope: unknown, changes: unknown) => Promise<{ affected: number }>>(), exists: jest.fn<(scope: unknown) => Promise<boolean>>() };
const projects = { findOne: jest.fn<() => Promise<Project | null>>(), existsBy: jest.fn<() => Promise<boolean>>() };
const manager = {
  create: jest.fn((entity: typeof Asset | typeof FileDetail | typeof LinkDetail, data: object) => Object.assign(new entity(), data)),
  save: jest.fn((_entity: unknown, data: object) => Promise.resolve(Object.assign(data, { createdAt: new Date('2026-10-20T00:00:00Z') }))),
};
const database = { transaction: jest.fn((work: (manager: EntityManager) => Promise<unknown>) => work(manager as unknown as EntityManager)) };
let service: AssetsService;
beforeEach(async () => {
  jest.clearAllMocks(); projects.findOne.mockResolvedValue(project); projects.existsBy.mockResolvedValue(true);
  rows.update.mockResolvedValue({ affected: 1 }); rows.exists.mockResolvedValue(true); rows.find.mockResolvedValue([]);
  manager.save.mockImplementation((_entity, data) => Promise.resolve(Object.assign(data, { createdAt: new Date('2026-10-20T00:00:00Z') })));
  const module = await Test.createTestingModule({ providers: [AssetsService,
    { provide: getRepositoryToken(Asset), useValue: rows }, { provide: getRepositoryToken(Project), useValue: projects },
    { provide: DataSource, useValue: database }] }).compile();
  service = module.get(AssetsService);
  await module.close();
});

describe('link input boundary', () => {
  it.each(['javascript:alert(1)', 'data:text/html,hi', 'file:///tmp/a', '/relative', 'example.com', 'https://user:secret@example.com', 'ftp://example.com'])('rejects unsafe/non-HTTP or relative URL %s', url => {
    expect(() => normalizeLink({ url })).toThrow();
  });
  it('keeps path case, query and fragment while normalizing the host', () => {
    expect(normalizeLink({ url: ' HTTPS://EXAMPLE.COM/Path?Key=Value#Section ', name: ' Survey ' }))
      .toEqual({ url: 'https://example.com/Path?Key=Value#Section', name: 'Survey' });
  });
  it('uses the full URL for blank/omitted names and allows long URL fallbacks', () => {
    const url = `https://example.com/${'a'.repeat(1000)}`;
    expect(normalizeLink({ url, name: '  ' })).toEqual({ url, name: url });
  });
  it.each([{ url: 'x'.repeat(2049) }, { url: 'https://example.com', name: 'n'.repeat(121) }])('rejects project input limits', value => {
    expect(() => normalizeLink(value)).toThrow();
  });
  it('transforms blank names and rejects forged/unknown HTTP fields', async () => {
    const dto = plainToInstance(CreateLinkDto, { url: ' https://example.com ', name: '  ', type: 'photo', storageKey: 'forged' });
    expect(dto.name).toBeUndefined();
    expect(dto.url).toBe('https://example.com');
    expect((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).map(error => error.property)).toEqual(['type', 'storageKey']);
  });
});

describe('shared asset persistence', () => {
  it('writes link base/details in one transaction and exposes no file fields', async () => {
    const created = await service.createLink(projectId, { url: 'https://example.com/Survey' });
    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(manager.save.mock.calls.map(call => call[0])).toEqual([Asset, LinkDetail]);
    expect(created).toMatchObject({ projectId, type: 'link', url: 'https://example.com/Survey' });
    expect(created).not.toHaveProperty('storageKey'); expect(created).not.toHaveProperty('contentUrl');
  });
  it('rejects a missing project before starting a write', async () => {
    projects.existsBy.mockResolvedValue(false);
    await expect(service.createLink(projectId, { url: 'https://example.com' })).rejects.toMatchObject({ status: 404 });
    expect(database.transaction).not.toHaveBeenCalled();
  });
  it('propagates detail failures rather than claiming a successful creation', async () => {
    manager.save.mockRejectedValueOnce(new Error('database failed'));
    await expect(service.createLink(projectId, { url: 'https://example.com' })).rejects.toThrow('database failed');
  });
  it('keeps a file key and metadata in the same photo transaction', async () => {
    const created = await service.savePhoto({ id: photoId, projectId, originalName: 'a.png', mimeType: 'image/png', sizeBytes: 42, storageKey: 'internal/key' });
    expect(created).toMatchObject({ id: photoId, originalName: 'a.png', storageKey: 'internal/key' });
    expect(manager.save.mock.calls.map(call => call[0])).toEqual([Asset, FileDetail]);
  });
  it('filters and serializes a mixed list with stable order and no private keys', async () => {
    const photo = Object.assign(new Asset(), { id: photoId, projectId, name: 'a.png', type: 'photo', createdAt: new Date(),
      file: Object.assign(new FileDetail(), { storageKey: 'private/key', mimeType: 'image/png', sizeBytes: 42 }) });
    const link = Object.assign(new Asset(), { id: 'link', projectId, name: 'Survey', type: 'link', createdAt: new Date(), link: { url: 'https://example.com/' } });
    rows.find.mockResolvedValue([photo, link]);
    const result = await service.getProjectAssets(projectId);
    expect(result.assets.map(asset => asset.type)).toEqual(['photo', 'link']);
    expect(JSON.stringify(result)).not.toContain('private/key');
    expect(rows.find).toHaveBeenCalledWith(expect.objectContaining({ order: { createdAt: 'DESC', id: 'DESC' } }));
  });
  it('does not hide list corruption or query failure as an empty collection', async () => {
    rows.find.mockResolvedValue([Object.assign(new Asset(), { id: photoId, type: 'photo', createdAt: new Date(), file: null })]);
    await expect(service.getProjectAssets(projectId)).rejects.toMatchObject({ status: 500 });
    rows.find.mockRejectedValueOnce(new Error('query failed'));
    await expect(service.getProjectAssets(projectId)).rejects.toThrow('query failed');
  });
  it('conditionally updates first deletion time and permits repeated same-project deletion', async () => {
    await service.softDelete(projectId, photoId, 'photo');
    expect(rows.update).toHaveBeenCalledWith({ id: photoId, projectId, type: 'photo', deletedAt: IsNull() }, { deletedAt: expect.any(Function) });
    rows.update.mockResolvedValue({ affected: 0 });
    await expect(service.softDelete(projectId, photoId)).resolves.toBeUndefined();
    expect(rows.exists).toHaveBeenCalledWith({ where: { id: photoId, projectId }, withDeleted: true });
  });
  it('rejects missing/wrong-project IDs and propagates uncertain updates', async () => {
    rows.update.mockResolvedValue({ affected: 0 }); rows.exists.mockResolvedValue(false);
    await expect(service.softDelete(projectId, photoId)).rejects.toMatchObject({ status: 404 });
    rows.update.mockRejectedValueOnce(new Error('outcome unknown'));
    await expect(service.softDelete(projectId, photoId)).rejects.toThrow('outcome unknown');
  });
});
