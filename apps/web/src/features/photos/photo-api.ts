import 'server-only';
import { projectPhotosPath } from './photo-urls';
import { parseProjectPhotos } from './photo-types';
import type { ProjectPhotos } from './photo-types';

export class PhotoApiError extends Error {
  constructor(public readonly status: number, public readonly requestId: string | null) {
    super(`Project photos could not be loaded (status ${status}, request ${requestId ?? 'unknown'})`);
    this.name = 'PhotoApiError';
  }
}

export async function getProjectPhotos(projectId: string): Promise<ProjectPhotos> {
  // Server-side fetches use the internal API origin; no business rules are duplicated here.
  const origin = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
  const response = await fetch(new URL(projectPhotosPath(projectId), origin), {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new PhotoApiError(response.status, response.headers.get('x-request-id'));

  const data: unknown = await response.json();
  return parseProjectPhotos(data, projectId);
}
