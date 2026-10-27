import { Readable } from 'node:stream';
import type { Express, Response } from 'express';
import type {} from 'multer';
import { jest } from '@jest/globals';
import type { StoredPhoto } from '../src/assets/asset-response.js';
import { Project } from '../src/projects/entities/project.entity.js';

export const projectId = '39f7c890-a5aa-4a74-8a3a-7fba28ac58b6';
export const photoId = 'fbfa3548-f0ab-45c6-86c7-bf489145fc75';
export const project = Object.assign(new Project(), {
  id: projectId, name: 'Demo project', address: 'Demo address', createdAt: new Date('2026-10-19T00:00:00Z'),
});
export const photo: StoredPhoto = {
  id: photoId, projectId, originalName: 'photo.png', mimeType: 'image/png' as const,
  sizeBytes: 68, storageKey: `projects/${projectId}/photos/${photoId}.png`,
  createdAt: new Date('2026-10-19T00:00:00Z'),
};
export const publicPhoto = {
  id: photoId, originalName: 'photo.png', mimeType: 'image/png' as const, sizeBytes: 68,
  createdAt: '2026-10-19T00:00:00.000Z',
};
// Signature fixture only; service resize cases generate fully decodable images with Sharp.
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64');
export function uploadFile(changes: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file', originalname: 'photo.png', encoding: '7bit', mimetype: 'image/png',
    size: png.length, buffer: png, stream: Readable.from(png),
    destination: '', filename: '', path: '', ...changes,
  };
}

interface HttpResponseDouble {
  locals: Record<string, unknown>;
  statusCode: number;
  headersSent: boolean;
  setHeader: jest.Mock<(name: string, value: string) => void>;
  status: jest.Mock<(code: number) => unknown>;
  json: jest.Mock<(body: unknown) => void>;
  once: jest.Mock<(event: string, callback: () => void) => void>;
}

export function httpResponse(): { response: HttpResponseDouble; asExpress: Response } {
  const response = {
    locals: {} as Record<string, unknown>,
    statusCode: 200,
    headersSent: false,
    setHeader: jest.fn<(name: string, value: string) => void>(),
    status: jest.fn<(code: number) => unknown>(),
    json: jest.fn<(body: unknown) => void>(),
    once: jest.fn<(event: string, callback: () => void) => void>(),
  };
  response.status.mockReturnValue(response);
  // Unit tests implement only the response methods used by the controller/filter.
  return { response, asExpress: response as unknown as Response };
}
