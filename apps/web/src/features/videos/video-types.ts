import { isRecord, isTimestamp, isUuid } from '@/lib/validation';

export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
export const VIDEO_CHUNK_SIZE_BYTES = 5 * 1024 * 1024;

export interface VideoAsset {
  id: string;
  projectId: string;
  type: 'video';
  name: string;
  mimeType: 'video/mp4';
  sizeBytes: number;
  contentUrl: string;
  createdAt: string;
}

const UPLOAD_STATES = [
  'CREATED',
  'UPLOADING',
  'PROCESSING',
  'READY',
  'FAILED',
  'CANCELED',
  'EXPIRED',
] as const;
export type UploadState = (typeof UPLOAD_STATES)[number];

export interface ConfirmedUploadPart {
  partNumber: number;
  sizeBytes: number;
  sha256: string;
}

export interface UploadStatus {
  uploadId: string;
  state: UploadState;
  fileName: string;
  fileSizeBytes: number;
  expectedSha256: string;
  chunkSizeBytes: number;
  totalParts: number;
  receivedParts: ConfirmedUploadPart[];
  receivedBytes: number;
  uploadPercent: number;
  expiresAt: string;
  assetAvailable: boolean;
  asset: VideoAsset | null;
  error: { code: string; message: string } | null;
}

export function isResumableUpload(state: UploadState): boolean {
  return state === 'CREATED' || state === 'UPLOADING';
}

export function isTerminalUpload(state: UploadState): boolean {
  return state === 'READY' || state === 'FAILED' || state === 'CANCELED' || state === 'EXPIRED';
}

function isUploadState(value: unknown): value is UploadState {
  return UPLOAD_STATES.some((state) => state === value);
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function parseVideoAsset(value: unknown, projectId: string): VideoAsset {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    value.projectId !== projectId ||
    value.type !== 'video' ||
    typeof value.name !== 'string' ||
    value.mimeType !== 'video/mp4' ||
    typeof value.sizeBytes !== 'number' ||
    !Number.isSafeInteger(value.sizeBytes) ||
    value.sizeBytes < 1 ||
    value.sizeBytes > MAX_VIDEO_BYTES ||
    !isTimestamp(value.createdAt) ||
    value.contentUrl !== `/projects/${projectId}/assets/${value.id}/content`
  ) {
    throw new Error('Invalid video response. Refresh videos.');
  }
  return {
    id: value.id,
    projectId,
    type: 'video',
    name: value.name,
    mimeType: 'video/mp4',
    sizeBytes: value.sizeBytes,
    contentUrl: value.contentUrl,
    createdAt: value.createdAt,
  };
}

export function parseProjectVideos(value: unknown, projectId: string): VideoAsset[] {
  if (
    !isRecord(value) ||
    !isRecord(value.project) ||
    value.project.id !== projectId ||
    !Array.isArray(value.assets)
  ) {
    throw new Error('Videos could not be refreshed.');
  }
  return value.assets
    .filter((asset) => isRecord(asset) && asset.type === 'video')
    .map((asset) => parseVideoAsset(asset, projectId));
}

function parseConfirmedPart(
  value: unknown,
  fileSizeBytes: number,
  totalParts: number,
): ConfirmedUploadPart {
  if (
    !isRecord(value) ||
    typeof value.partNumber !== 'number' ||
    !Number.isInteger(value.partNumber) ||
    value.partNumber < 0 ||
    value.partNumber >= totalParts ||
    value.sizeBytes !==
      Math.min(VIDEO_CHUNK_SIZE_BYTES, fileSizeBytes - value.partNumber * VIDEO_CHUNK_SIZE_BYTES) ||
    !isSha256(value.sha256)
  ) {
    throw new Error('Invalid acknowledged part. Check status again.');
  }
  return { partNumber: value.partNumber, sizeBytes: value.sizeBytes, sha256: value.sha256 };
}

export function parseUploadStatus(value: unknown, projectId: string): UploadStatus {
  if (
    !isRecord(value) ||
    !isUuid(value.uploadId) ||
    !isUploadState(value.state) ||
    typeof value.fileName !== 'string' ||
    typeof value.fileSizeBytes !== 'number' ||
    !Number.isSafeInteger(value.fileSizeBytes) ||
    value.fileSizeBytes < 1 ||
    value.fileSizeBytes > MAX_VIDEO_BYTES ||
    !isSha256(value.expectedSha256) ||
    value.chunkSizeBytes !== VIDEO_CHUNK_SIZE_BYTES ||
    typeof value.totalParts !== 'number' ||
    value.totalParts !== Math.ceil(value.fileSizeBytes / VIDEO_CHUNK_SIZE_BYTES) ||
    !Array.isArray(value.receivedParts) ||
    typeof value.receivedBytes !== 'number' ||
    typeof value.uploadPercent !== 'number' ||
    !Number.isFinite(value.uploadPercent) ||
    value.uploadPercent < 0 ||
    value.uploadPercent > 100 ||
    typeof value.assetAvailable !== 'boolean' ||
    !isTimestamp(value.expiresAt)
  ) {
    throw new Error('Upload status is unknown. Check status again.');
  }

  const { fileSizeBytes, totalParts } = value;
  const receivedParts = value.receivedParts.map((part) =>
    parseConfirmedPart(part, fileSizeBytes, totalParts),
  );
  const uniqueParts = new Set(receivedParts.map((part) => part.partNumber));
  if (uniqueParts.size !== receivedParts.length)
    throw new Error('Invalid acknowledged part. Check status again.');
  const confirmedBytes = receivedParts.reduce((total, part) => total + part.sizeBytes, 0);
  if (
    value.state !== 'READY' &&
    (value.receivedBytes !== confirmedBytes ||
      value.uploadPercent !== Math.floor((confirmedBytes / value.fileSizeBytes) * 100))
  ) {
    throw new Error('Invalid upload progress.');
  }
  // READY manifests may already be cleaned; the historical transfer remains complete.
  if (
    value.state === 'READY' &&
    (value.receivedBytes !== value.fileSizeBytes || value.uploadPercent !== 100)
  )
    throw new Error('Invalid completed transfer status.');
  if (!value.assetAvailable && value.asset !== null)
    throw new Error('Invalid active asset status.');
  if (value.assetAvailable && (value.state !== 'READY' || value.asset === null))
    throw new Error('Invalid published video status.');
  const asset = value.asset === null ? null : parseVideoAsset(value.asset, projectId);
  let error: UploadStatus['error'] = null;
  if (value.error !== null) {
    if (
      !isRecord(value.error) ||
      typeof value.error.code !== 'string' ||
      typeof value.error.message !== 'string'
    )
      throw new Error('Invalid processing error.');
    error = { code: value.error.code, message: value.error.message };
  }
  return {
    uploadId: value.uploadId,
    state: value.state,
    fileName: value.fileName,
    fileSizeBytes: value.fileSizeBytes,
    expectedSha256: value.expectedSha256,
    chunkSizeBytes: value.chunkSizeBytes,
    totalParts: value.totalParts,
    receivedParts,
    receivedBytes: value.receivedBytes,
    uploadPercent: value.uploadPercent,
    expiresAt: value.expiresAt,
    assetAvailable: value.assetAvailable,
    asset,
    error,
  };
}
