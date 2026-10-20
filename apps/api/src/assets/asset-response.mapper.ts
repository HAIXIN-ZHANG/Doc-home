import { InternalServerErrorException } from '@nestjs/common';

import type { VideoAsset } from './asset-response.js';
import type { Asset } from './asset.entity.js';

export function toVideoAssetResponse(asset: Asset): VideoAsset {
  if (asset.type !== 'video' || !asset.file || asset.link || asset.file.mimeType !== 'video/mp4') {
    throw new InternalServerErrorException('Asset details are inconsistent');
  }
  return {
    id: asset.id,
    projectId: asset.projectId,
    type: 'video',
    name: asset.name,
    createdAt: asset.createdAt.toISOString(),
    mimeType: 'video/mp4',
    sizeBytes: asset.file.sizeBytes,
    contentUrl: `/projects/${asset.projectId}/assets/${asset.id}/content`,
  };
}
