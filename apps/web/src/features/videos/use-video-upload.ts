'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { isUuid } from '@/lib/validation';

import {
  calculateFileSha256,
  getUploadStatus,
  requestVideoResponse,
  sendMissingParts,
  projectUploadsUrl,
  validateVideoFile,
  VideoRequestError,
} from './video-api';
import { isResumableUpload, parseUploadStatus } from './video-types';
import type { UploadStatus } from './video-types';

const STATUS_POLL_INTERVAL_MS = 1000;

export function useVideoUpload(projectId: string, refreshPublishedVideos: () => Promise<unknown>) {
  const recoveryKey = `doc-home:video-upload:v1:${projectId}`;
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isCheckingFile, setIsCheckingFile] = useState(false);
  const [isStatusUnknown, setIsStatusUnknown] = useState(false);
  const [feedback, setFeedback] = useState('');
  const recoveredUploadId = useRef<string | null>(null);
  const statusRef = useRef<UploadStatus | null>(null);
  const operationController = useRef<AbortController | null>(null);
  const isMounted = useRef(false);
  const refreshVideosRef = useRef(refreshPublishedVideos);

  useEffect(() => {
    refreshVideosRef.current = refreshPublishedVideos;
  }, [refreshPublishedVideos]);

  const saveStatus = useCallback(
    (upload: UploadStatus) => {
      statusRef.current = upload;
      recoveredUploadId.current = upload.uploadId;
      setStatus(upload);
      try {
        localStorage.setItem(
          recoveryKey,
          JSON.stringify({ version: 1, uploadId: upload.uploadId }),
        );
      } catch {
        setFeedback('Upload continues, but this browser cannot save recovery information.');
      }
    },
    [recoveryKey],
  );

  const runOperation = useCallback(
    async (operation: (signal: AbortSignal) => Promise<void>) => {
      if (operationController.current) return;
      const controller = new AbortController();
      operationController.current = controller;
      setIsBusy(true);
      setFeedback('');
      try {
        await operation(controller.signal);
      } catch (error) {
        if (!controller.signal.aborted && isMounted.current) {
          if (error instanceof VideoRequestError && error.status === 404) {
            statusRef.current = null;
            recoveredUploadId.current = null;
            setStatus(null);
            setIsStatusUnknown(false);
            try {
              localStorage.removeItem(recoveryKey);
            } catch {
              /* A confirmed missing session cannot be resumed. */
            }
            setFeedback('This upload no longer exists. Choose a video to start a new upload.');
          } else {
            setIsStatusUnknown(true);
            setFeedback(
              error instanceof Error ? error.message : 'Check upload status before continuing.',
            );
          }
        }
      } finally {
        // Cancel can replace this controller. A settled old request must not clear the new operation.
        if (operationController.current === controller) {
          operationController.current = null;
          if (isMounted.current) {
            setIsBusy(false);
            setIsCheckingFile(false);
          }
        }
      }
    },
    [recoveryKey],
  );

  const refreshStatus = useCallback(
    async (uploadId: string, signal: AbortSignal) => {
      const upload = await getUploadStatus(projectId, uploadId, signal);
      signal.throwIfAborted();
      saveStatus(upload);
      setIsStatusUnknown(false);
      if (upload.state === 'READY') {
        await refreshVideosRef.current();
        setFeedback(upload.assetAvailable ? 'Video added.' : 'This video has been deleted.');
      } else if (upload.error) setFeedback(upload.error.message);
      return upload;
    },
    [projectId, saveStatus],
  );

  useEffect(() => {
    isMounted.current = true;
    let uploadId: string | undefined;
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(recoveryKey) ?? 'null');
      if (
        stored &&
        typeof stored === 'object' &&
        'version' in stored &&
        stored.version === 1 &&
        'uploadId' in stored &&
        isUuid(stored.uploadId)
      )
        uploadId = stored.uploadId;
    } catch {
      /* Browser storage is optional; it never gates viewing published assets. */
    }
    if (uploadId) recoveredUploadId.current = uploadId;
    let isActive = true;
    const recoveryId = uploadId;
    if (recoveryId)
      queueMicrotask(() => {
        if (isActive)
          void runOperation(async (signal) => {
            await refreshStatus(recoveryId, signal);
          });
      });
    return () => {
      isActive = false;
      isMounted.current = false;
      operationController.current?.abort();
      operationController.current = null;
    };
  }, [recoveryKey, refreshStatus, runOperation]);

  const checkStatus = useCallback(
    () =>
      runOperation(async (signal) => {
        const uploadId = statusRef.current?.uploadId ?? recoveredUploadId.current;
        if (uploadId) await refreshStatus(uploadId, signal);
        else {
          await refreshVideosRef.current();
          setIsStatusUnknown(false);
          setFeedback(
            'Videos refreshed. Review the list before starting again. An unconfirmed session expires automatically.',
          );
        }
      }),
    [runOperation, refreshStatus],
  );

  useEffect(() => {
    if (status?.state !== 'PROCESSING' || isBusy || isStatusUnknown) return;
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') void checkStatus();
    };
    const timer = setTimeout(checkWhenVisible, STATUS_POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', checkWhenVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', checkWhenVisible);
    };
  }, [status, isBusy, isStatusUnknown, checkStatus]);

  async function uploadVideo(file: File): Promise<void> {
    try {
      validateVideoFile(file);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Check your video file.');
      return;
    }
    await runOperation(async (signal) => {
      let upload = statusRef.current
        ? await refreshStatus(statusRef.current.uploadId, signal)
        : null;
      if (upload && !isResumableUpload(upload.state)) return;
      setIsCheckingFile(true);
      const hash = await calculateFileSha256(file);
      signal.throwIfAborted();
      setIsCheckingFile(false);
      if (upload && (upload.fileSizeBytes !== file.size || upload.expectedSha256 !== hash)) {
        setFeedback('This is a different file. Select the original video to resume.');
        return;
      }
      if (!upload) {
        const response = await requestVideoResponse(
          projectUploadsUrl(projectId),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: file.name,
              fileSizeBytes: file.size,
              mimeType: 'video/mp4',
              expectedSha256: hash,
            }),
          },
          signal,
        );
        upload = parseUploadStatus(await response.json(), projectId);
        signal.throwIfAborted();
        saveStatus(upload);
      }
      const { uploadId } = upload;
      // Serialize progress snapshots so a slower response cannot move confirmed progress backwards.
      let progressRefresh = Promise.resolve();
      try {
        await sendMissingParts(projectId, upload, file, signal, () => {
          progressRefresh = progressRefresh.then(async () => {
            await refreshStatus(uploadId, signal);
          });
          return progressRefresh;
        });
      } catch (error) {
        await refreshStatus(uploadId, signal);
        throw error;
      }
      await requestVideoResponse(
        `${projectUploadsUrl(projectId, uploadId)}/complete`,
        { method: 'POST' },
        signal,
      );
      await refreshStatus(uploadId, signal);
    });
  }

  async function finishUpload(): Promise<void> {
    await runOperation(async (signal) => {
      if (!statusRef.current) return;
      const upload = await refreshStatus(statusRef.current.uploadId, signal);
      if (!isResumableUpload(upload.state)) return;
      await requestVideoResponse(
        `${projectUploadsUrl(projectId, upload.uploadId)}/complete`,
        { method: 'POST' },
        signal,
      );
      await refreshStatus(upload.uploadId, signal);
    });
  }

  async function cancelUpload(): Promise<void> {
    if (!statusRef.current) return;
    const { uploadId } = statusRef.current;
    operationController.current?.abort();
    operationController.current = null;
    await runOperation(async (signal) => {
      await requestVideoResponse(
        projectUploadsUrl(projectId, uploadId),
        { method: 'DELETE' },
        signal,
      );
      await refreshStatus(uploadId, signal);
      setFeedback('Upload canceled.');
    });
  }

  function markAssetDeleted(assetId: string): void {
    if (statusRef.current?.state === 'READY' && statusRef.current.asset?.id === assetId) {
      saveStatus({ ...statusRef.current, assetAvailable: false, asset: null });
      setFeedback('This video has been deleted.');
    }
  }

  function dismissUpload(): void {
    if (isBusy) return;
    setStatus(null);
    statusRef.current = null;
    recoveredUploadId.current = null;
    setFeedback('');
    setIsStatusUnknown(false);
    try {
      localStorage.removeItem(recoveryKey);
    } catch {
      /* Dismiss still succeeds when browser storage is unavailable. */
    }
  }

  return {
    status,
    isBusy,
    isCheckingFile,
    isStatusUnknown,
    feedback,
    uploadVideo,
    checkStatus,
    finishUpload,
    cancelUpload,
    dismissUpload,
    markAssetDeleted,
  };
}
