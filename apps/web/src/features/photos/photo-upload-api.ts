import { projectPhotosPath } from './photo-urls';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export function validatePhoto(file: File): string | undefined {
  // These checks give quick feedback. The API still verifies the actual bytes.
  if (!['image/jpeg', 'image/png'].includes(file.type)) return 'Choose a JPG or PNG photo.';
  if (file.size === 0) return 'The photo is empty. Choose another file.';
  if (file.size > MAX_PHOTO_BYTES) return 'Choose a photo that is 5 MiB or smaller.';
  const name = file.name.trim();
  if (!name || name.length > 255 || /[\u0000-\u001f\u007f]/.test(name)) {
    return 'Choose a photo with a filename of 1–255 characters and no control characters.';
  }
}

export class PhotoUploadError extends Error {
  constructor(message: string, readonly uncertain: boolean) {
    super(message);
    this.name = 'PhotoUploadError';
  }
}

export async function uploadPhoto(projectId: string, file: File): Promise<void> {
  const body = new FormData();
  body.append('file', file);
  let response: Response;
  try {
    // Let the browser supply the multipart boundary; never set Content-Type manually.
    response = await fetch(`/api${projectPhotosPath(projectId)}`, {
      method: 'POST', body, signal: AbortSignal.timeout(30_000),
    });
  } catch {
    // A lost response does not prove the write failed. Retrying could create duplicates.
    throw new PhotoUploadError('The upload result could not be confirmed. Refresh the photos and check the list before uploading again.', true);
  }
  if (response.status === 201) return;
  const rejected: Record<number, string> = {
    400: 'The photo could not be accepted. Check the file and try again.',
    404: 'This project no longer exists. Reload the page before uploading.',
    413: 'Choose a photo that is 5 MiB or smaller.',
    415: 'The file content must be a JPG or PNG photo.',
  };
  if (rejected[response.status]) throw new PhotoUploadError(rejected[response.status], false);
  throw new PhotoUploadError('The upload result could not be confirmed. Refresh the photos and check the list before uploading again.', true);
}
