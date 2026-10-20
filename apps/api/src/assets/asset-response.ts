import type { PhotoMimeType } from './file-detail.entity.js';
interface AssetBase { id: string; projectId: string; name: string; createdAt: string }
export type LinkAsset = AssetBase & { type: 'link'; url: string };
export type PhotoAsset = AssetBase & { type: 'photo'; mimeType: PhotoMimeType; sizeBytes: number; contentUrl: string };
export type AssetResponse = LinkAsset | PhotoAsset;
// Internal compatibility projection, not a second persistence model.
export interface StoredPhoto {
  id: string; projectId: string; originalName: string; createdAt: Date;
  storageKey: string; mimeType: PhotoMimeType; sizeBytes: number;
}
