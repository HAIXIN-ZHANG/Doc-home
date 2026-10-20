import { isRecord } from '@/lib/validation';

import { parseProjectLinks } from '../links/link-api';
import type { LinkAsset } from '../links/link-api';
import { parseProjectPhotos } from '../photos/photo-types';
import type { ProjectPhotos } from '../photos/photo-types';
import { parseProjectVideos } from '../videos/video-types';
import type { VideoAsset } from '../videos/video-types';

export interface ProjectAssets extends ProjectPhotos {
  links: LinkAsset[];
  videos: VideoAsset[];
}

export function parseProjectAssets(value: unknown, projectId: string): ProjectAssets {
  if (!isRecord(value) || !Array.isArray(value.assets))
    throw new Error('Invalid project assets response');
  const assets: unknown[] = value.assets;
  if (
    !assets.every(
      (asset) => isRecord(asset) && ['photo', 'link', 'video'].includes(String(asset.type)),
    )
  ) {
    throw new Error('Unsupported project asset type');
  }
  // Keep the original photo view contract while loading the mixed project in one request.
  const photos = assets
    .filter(isRecord)
    .filter((asset) => asset.type === 'photo')
    .map((asset) => ({
      id: asset.id,
      originalName: asset.name,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      createdAt: asset.createdAt,
    }));
  const projectPhotos = parseProjectPhotos({ project: value.project, photos }, projectId);
  return {
    ...projectPhotos,
    links: parseProjectLinks(value, projectId),
    videos: parseProjectVideos(value, projectId),
  };
}
