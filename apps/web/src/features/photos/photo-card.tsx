'use client';

import Image from 'next/image';
import { useState } from 'react';
import { css } from '../../../styled-system/css';
import { button } from '../../../styled-system/recipes';
import { photoContentUrl } from './photo-urls';
import { Button } from '@/components/ui/button';
import type { ProjectPhoto } from './photo-types';

export interface PhotoDeleteActions {
  onDelete: (photo: ProjectPhoto) => void;
  deletingPhotoId?: string;
  deletionBlocked: boolean;
}

export function PhotoCard({ projectId, photo, onDelete, deletingPhotoId, deletionBlocked }: {
  projectId: string; photo: ProjectPhoto;
} & PhotoDeleteActions) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const size = photo.sizeBytes >= 1024 * 1024
    ? `${(photo.sizeBytes / (1024 * 1024)).toFixed(1)} MiB`
    : `${Math.max(1, Math.round(photo.sizeBytes / 1024))} KiB`;

  return (
    <li className={css({ bg: 'bg.surface', borderWidth: '1px', borderColor: 'border', rounded: 'xl', overflow: 'hidden', minW: '0' })}>
      <div className={css({ position: 'relative', h: '230px', bg: 'bg.subtle' })}>
        {previewFailed ? (
          <div role="img" aria-label={`Preview unavailable for ${photo.originalName}`} className={css({ h: 'full', display: 'grid', placeItems: 'center', color: 'fg.muted', textStyle: 'small' })}>
            Preview unavailable
          </div>
        ) : (
          // Sharp already resizes the source. Avoid a second image-optimization cache in Next.
          <Image
            src={photoContentUrl(projectId, photo.id, { w: 800, h: 500 })}
            alt={photo.originalName}
            fill
            unoptimized
            sizes="(min-width: 1024px) 368px, (min-width: 768px) 50vw, 100vw"
            className={css({ objectFit: 'cover' })}
            onError={() => setPreviewFailed(true)}
          />
        )}
      </div>
      <div className={css({ p: '4', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '3' })}>
        <h3 className={css({ fontWeight: 'semibold', overflowWrap: 'anywhere', maxW: 'full' })}>{photo.originalName}</h3>
        <p className={css({ textStyle: 'small', color: 'fg.muted' })}>
          {photo.mimeType === 'image/jpeg' ? 'JPG' : 'PNG'} · {size}
        </p>
        <div className={css({ display: 'flex', gap: '2', flexWrap: 'wrap' })}>
          <a href={photoContentUrl(projectId, photo.id)} target="_blank" rel="noopener noreferrer"
            aria-label={`View original ${photo.originalName} (opens in a new tab)`}
            className={button({ visual: 'secondary' })}>
            View
          </a>
          <Button visual="danger" disabled={deletionBlocked} aria-label={`Delete ${photo.originalName}`} onClick={() => onDelete(photo)}>
            {deletingPhotoId === photo.id ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
    </li>
  );
}
