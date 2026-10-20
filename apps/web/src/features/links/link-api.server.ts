import { parseVideos } from '../videos/video-api';
import 'server-only';
import { assetsPath, parseProjectLinks } from './link-api';
export class ProjectAssetsApiError extends Error {
  constructor(public readonly status: number, requestId: string | null) {
    super(`Project assets could not be loaded (status ${status}, request ${requestId ?? 'unknown'})`);
  }
}
export async function getProjectMedia(projectId: string) {
  const response = await fetch(new URL(assetsPath(projectId), process.env.API_INTERNAL_URL ?? 'http://localhost:3001'), {
    cache: 'no-store', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new ProjectAssetsApiError(response.status, response.headers.get('x-request-id'));
  const body: unknown = await response.json();
  return { links: parseProjectLinks(body, projectId), videos: parseVideos(body, projectId) };
}
