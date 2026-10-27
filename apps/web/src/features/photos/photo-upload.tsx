'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { css } from '../../../styled-system/css';
import { PhotoUploadError, uploadPhoto, validatePhoto } from './photo-upload-api';

interface PhotoUploadProps {
  projectId: string;
  refreshPhotos: () => Promise<void>;
  blocked?: boolean;
}

type Feedback = { kind: 'success' | 'error'; message: string };

export function PhotoUpload({ projectId, refreshPhotos, blocked = false }: PhotoUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const selectionError = file ? validatePhoto(file) : undefined;
  const upload = useMutation({
    mutationKey: ['upload-photo', projectId],
    mutationFn: async (photo: File) => {
      await uploadPhoto(projectId, photo);
      // The write and the follow-up query are separate outcomes; preserve confirmed success.
      try {
        await refreshPhotos();
        return { refreshed: true };
      } catch {
        return { refreshed: false };
      }
    },
    retry: false,
  });
  const busy = upload.isPending || refreshing || blocked;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || selectionError || busy || needsRefresh) return;
    setFeedback(null);
    try {
      const result = await upload.mutateAsync(file);
      setFile(null);
      if (input.current) input.current.value = '';
      setNeedsRefresh(!result.refreshed);
      setFeedback(result.refreshed
        ? { kind: 'success', message: 'Photo uploaded.' }
        : { kind: 'error', message: 'Photo uploaded, but the list could not be refreshed. Refresh the photos to see it.' });
    } catch (error) {
      setNeedsRefresh(error instanceof PhotoUploadError ? error.uncertain : true);
      setFeedback({ kind: 'error', message: error instanceof PhotoUploadError ? error.message : 'The upload result could not be confirmed. Refresh the photos before trying again.' });
    }
  }

  async function refreshAfterUpload() {
    if (busy) return;
    // Re-read before another write: an interrupted upload may already be saved.
    setRefreshing(true);
    try {
      await refreshPhotos();
      setNeedsRefresh(false);
      setFeedback({ kind: 'success', message: 'Photos refreshed. Check the list before uploading again.' });
    } catch {
      setFeedback({ kind: 'error', message: 'The photos could not be refreshed. Try refreshing again before uploading.' });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby="upload-heading"
      aria-busy={busy}
      className={css({
        bg: 'bg.surface', borderWidth: '1px', borderColor: 'border', rounded: 'xl',
        p: '6', display: 'flex', flexDirection: 'column', gap: '4', minW: '0',
      })}
    >
      <h3 id="upload-heading" className={css({ display: 'flex', alignItems: 'center', gap: '3', fontWeight: 'semibold' })}>
        <Image src="/icons/upload.svg" width={24} height={24} alt="" unoptimized />
        Add a photo
      </h3>
      <p id="upload-guidance" className={css({ textStyle: 'small', color: 'fg.muted' })}>JPG or PNG · Up to 5 MiB · One photo at a time</p>
      <div className={css({ display: 'flex', flexDirection: { mobile: 'column', tablet: 'row' }, alignItems: { mobile: 'stretch', tablet: 'center' }, gap: '4' })}>
        <div className={css({ flex: '1', minW: '0', display: 'flex', flexWrap: 'wrap', gap: '3', alignItems: 'center' })}>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png"
            aria-label="Choose photo"
            hidden
            disabled={busy || needsRefresh}
            onChange={event => {
              setFile(event.target.files?.[0] ?? null);
              setFeedback(null);
            }}
          />
          <Button
            visual="secondary"
            disabled={busy || needsRefresh}
            aria-describedby="upload-guidance selected-photo"
            onClick={() => input.current?.click()}
          >
            Choose file
          </Button>
          <span id="selected-photo" aria-live="polite" className={css({ textStyle: 'small', color: 'fg.muted', overflowWrap: 'anywhere', minW: '0' })}>{file?.name ?? 'No file selected'}</span>
        </div>
        <Button type="submit" disabled={!file || Boolean(selectionError) || busy || needsRefresh}>
          {upload.isPending ? 'Uploading…' : 'Upload photo'}
        </Button>
      </div>
      {selectionError ? (
        <p role="alert" className={css({ textStyle: 'small', color: 'status.danger' })}>{selectionError}</p>
      ) : null}
      {feedback ? (
        <p
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={css({ textStyle: 'small', color: feedback.kind === 'error' ? 'status.danger' : 'status.success' })}
        >
          {feedback.message}
        </p>
      ) : null}
      {needsRefresh ? (
        <Button
          visual="secondary"
          disabled={busy}
          onClick={() => { void refreshAfterUpload(); }}
          className={css({ alignSelf: 'flex-start' })}
        >
          {refreshing ? 'Refreshing…' : 'Refresh photos'}
        </Button>
      ) : null}
    </form>
  );
}
