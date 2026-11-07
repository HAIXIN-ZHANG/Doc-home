import { Button } from '@/components/ui/button';

import { css } from '../../../styled-system/css';
import { isResumableUpload, isTerminalUpload } from './video-types';
import type { UploadStatus } from './video-types';

function uploadStatusLabel(status: UploadStatus, isStatusUnknown: boolean): string {
  if (isStatusUnknown) return 'Upload status unknown';
  if (status.state === 'PROCESSING') return '100% transferred · Finalizing video…';
  if (status.state === 'READY') return status.assetAvailable ? 'Video added' : 'Video deleted';
  if (isResumableUpload(status.state)) return `${status.uploadPercent}% uploaded`;
  return status.state.toLowerCase();
}

interface VideoUploadTaskProps {
  status: UploadStatus;
  isBusy: boolean;
  isStatusUnknown: boolean;
  onCancel: () => void;
  onFinish: () => void;
  onDismiss: () => void;
}

export function VideoUploadTask({
  status,
  isBusy,
  isStatusUnknown,
  onCancel,
  onFinish,
  onDismiss,
}: VideoUploadTaskProps) {
  const canResume = isResumableUpload(status.state);
  return (
    <div
      aria-label="Video upload task"
      className={css({
        bg: 'bg.canvas',
        rounded: 'lg',
        p: '4',
        display: 'flex',
        flexDirection: 'column',
        gap: '3',
        minW: '0',
      })}
    >
      <p className={css({ fontWeight: 'semibold', overflowWrap: 'anywhere' })}>{status.fileName}</p>
      <p role="status">{uploadStatusLabel(status, isStatusUnknown)}</p>
      {canResume ? (
        <progress
          max={100}
          value={status.uploadPercent}
          aria-label="Acknowledged video upload"
          className={css({ w: 'full' })}
        />
      ) : null}
      <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '3' })}>
        {canResume ? (
          <Button visual="secondary" onClick={onCancel}>
            Cancel upload
          </Button>
        ) : null}
        {canResume && status.uploadPercent === 100 ? (
          <Button disabled={isBusy || isStatusUnknown} onClick={onFinish}>
            Finish upload
          </Button>
        ) : null}
        {isTerminalUpload(status.state) ? (
          <Button visual="secondary" disabled={isBusy} onClick={onDismiss}>
            Dismiss upload
          </Button>
        ) : null}
      </div>
    </div>
  );
}
