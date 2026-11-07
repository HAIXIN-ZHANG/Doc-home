import type { ProjectPhotos } from '@/features/photos/photo-types';
export const projectId = '39f7c890-a5aa-4a74-8a3a-7fba28ac58b6';
export const photo = {
  id: 'fbfa3548-f0ab-45c6-86c7-bf489145fc75', originalName: 'kitchen.png',
  mimeType: 'image/png' as const, sizeBytes: 1024, createdAt: '2026-10-19T00:00:00.000Z',
};
export const initialData: ProjectPhotos = {
  project: { id: projectId, name: 'Riverside House', address: '24 Sample Street, Perth WA' }, photos: [photo],
};
export function response(status: number, body: unknown = {}): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body, headers: new Headers() } as Response;
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
