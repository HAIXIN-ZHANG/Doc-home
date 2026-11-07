import type { VideoAsset } from '../assets/asset-response.js';
import type { UploadState } from './video-upload.entity.js';

export interface ConfirmedUploadPart {
  partNumber: number;
  sizeBytes: number;
  sha256: string;
}

// Public transport fields only. Object keys and processing leases stay private.
export interface UploadStatusResponse {
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
