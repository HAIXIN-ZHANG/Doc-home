import { projectPhotosPath } from './photo-urls';

export class PhotoDeleteError extends Error {
  constructor(message: string, readonly needsRefresh: boolean) {
    super(message);
    this.name = 'PhotoDeleteError';
  }
}

export async function deletePhoto(projectId: string, photoId: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api${projectPhotosPath(projectId)}/${encodeURIComponent(photoId)}`, {
      method: 'DELETE', signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // A lost response may follow a committed delete. Re-read before offering another attempt.
    throw new PhotoDeleteError('The deletion result could not be confirmed. Refresh the photos before trying again.', true);
  }
  if (response.status === 204) return;
  if (response.status === 404) {
    throw new PhotoDeleteError('This photo is no longer available. Refresh the photos to update the list.', true);
  }
  if (response.status === 400) throw new PhotoDeleteError('This photo could not be deleted. Reload the page and try again.', false);
  throw new PhotoDeleteError('The deletion result could not be confirmed. Refresh the photos before trying again.', true);
}
