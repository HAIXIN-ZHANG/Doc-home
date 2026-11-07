'use client';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

import { css } from '../../../styled-system/css';
import type { VideoAsset } from './video-types';
export function VideoCard({
  video,
  disabled,
  onDelete,
}: {
  video: VideoAsset;
  disabled: boolean;
  onDelete: () => void;
}) {
  const [hasPlaybackError, setHasPlaybackError] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  return (
    <li
      className={css({
        rounded: 'lg',
        borderWidth: '1px',
        borderColor: 'border',
        overflow: 'hidden',
        minW: '0',
      })}
    >
      <video
        controls
        playsInline
        preload="metadata"
        aria-label={video.name}
        src={`/api${video.contentUrl}`}
        onError={() => setHasPlaybackError(true)}
        className={css({ w: 'full', aspectRatio: '16 / 9', objectFit: 'contain', bg: 'bg.media' })}
      />
      <div className={css({ p: '4', display: 'flex', flexDirection: 'column', gap: '3' })}>
        <h3 className={css({ fontWeight: 'semibold', overflowWrap: 'anywhere' })}>{video.name}</h3>
        <p className={css({ textStyle: 'small', color: 'fg.muted' })}>
          MP4 · {(video.sizeBytes / 1024 / 1024).toFixed(1)} MiB
        </p>
        {hasPlaybackError ? (
          <p role="alert">
            This video could not be played. Your browser may not support its format, or the file may
            be unavailable.
          </p>
        ) : null}
        {isConfirmingDelete ? (
          <div
            className={css({ display: 'flex', flexWrap: 'wrap', gap: '3', alignItems: 'center' })}
          >
            <p>Delete this video from the project?</p>
            <Button visual="danger" disabled={disabled} onClick={onDelete}>
              Confirm delete
            </Button>
            <Button
              visual="secondary"
              disabled={disabled}
              onClick={() => setIsConfirmingDelete(false)}
            >
              Keep video
            </Button>
          </div>
        ) : (
          <Button
            visual="danger"
            disabled={disabled}
            aria-label={`Delete video ${video.name}`}
            onClick={() => setIsConfirmingDelete(true)}
          >
            Delete
          </Button>
        )}
      </div>
    </li>
  );
}
