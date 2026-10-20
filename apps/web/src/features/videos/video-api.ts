import { MAX_VIDEO_BYTES, parseUploadStatus } from './video-types';
import type { UploadStatus } from './video-types';

export const projectUploadsUrl = (projectId: string, uploadId?: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/uploads${uploadId ? `/${encodeURIComponent(uploadId)}` : ''}`;
export class VideoRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function requestVideoResponse(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<Response> {
  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(35_000)]),
  });
  if (!response.ok) {
    let message = 'The request could not be confirmed. Check upload status before retrying.';
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === 'string') message = body.message;
    } catch {
      /* Keep a useful fallback for proxy failures. */
    }
    throw new VideoRequestError(message, response.status);
  }
  return response;
}
export async function getUploadStatus(projectId: string, uploadId: string, signal?: AbortSignal) {
  const result = parseUploadStatus(
    await (await requestVideoResponse(projectUploadsUrl(projectId, uploadId), {}, signal)).json(),
    projectId,
  );
  if (result.uploadId !== uploadId) throw new Error('Upload response does not match this session.');
  return result;
}
export function validateVideoFile(file: File) {
  if (file.size < 1 || file.size > MAX_VIDEO_BYTES)
    throw new Error('Choose a nonempty MP4 up to 20 MiB.');
  if (file.type !== 'video/mp4' || !/\.mp4$/i.test(file.name))
    throw new Error('Choose an MP4 video.');
  if (file.name.length > 255 || /[\u0000-\u001f\u007f]/.test(file.name))
    throw new Error('Use a shorter filename without control characters.');
}
export async function calculateFileSha256(file: File) {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
// A failed/uncertain PUT is never blindly replayed. Both workers settle before the caller reconciles status.
export async function sendMissingParts(
  projectId: string,
  task: UploadStatus,
  file: File,
  signal: AbortSignal,
  confirmed: () => Promise<void>,
) {
  const acknowledgedParts = new Set(task.receivedParts.map((part) => part.partNumber));
  const missingPartNumbers = Array.from({ length: task.totalParts }, (_, index) => index).filter(
    (index) => !acknowledgedParts.has(index),
  );
  let nextPartIndex = 0;
  let hasFailed = false;
  const uploadNextParts = async () => {
    while (nextPartIndex < missingPartNumbers.length && !hasFailed) {
      const index = missingPartNumbers[nextPartIndex++];
      try {
        await requestVideoResponse(
          `${projectUploadsUrl(projectId, task.uploadId)}/parts/${index}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: file.slice(
              index * task.chunkSizeBytes,
              Math.min(file.size, (index + 1) * task.chunkSizeBytes),
            ),
          },
          signal,
        );
        await confirmed();
      } catch (error) {
        hasFailed = true;
        throw error;
      }
    }
  };
  const workerResults = await Promise.allSettled([uploadNextParts(), uploadNextParts()]);
  const failure = workerResults.find((item) => item.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}
