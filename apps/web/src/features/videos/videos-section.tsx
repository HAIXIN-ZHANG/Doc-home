'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { AssetSection } from '@/components/ui/asset-section';
import { Button } from '@/components/ui/button';
import { InlineFeedback } from '@/components/ui/inline-feedback';

import { css } from '../../../styled-system/css';
import { projectAssetsPath, projectAssetPath } from '../project-assets/asset-urls';
import { useVideoUpload } from './use-video-upload';
import { requestVideoResponse } from './video-api';
import { VideoCard } from './video-card';
import { parseProjectVideos, isResumableUpload, isTerminalUpload } from './video-types';
import type { VideoAsset } from './video-types';
import { VideoUploadTask } from './video-upload-task';
export function VideosSection({
  projectId,
  initialVideos = [],
}: {
  projectId: string;
  initialVideos?: VideoAsset[];
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const queryKey = ['project-videos', projectId];
  const [isUploadFormOpen, setIsUploadFormOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const videosQuery = useQuery({
    queryKey,
    initialData: initialVideos,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) =>
      parseProjectVideos(
        await (
          await requestVideoResponse(`/api${projectAssetsPath(projectId)}`, {}, signal)
        ).json(),
        projectId,
      ),
  });
  const videoUpload = useVideoUpload(projectId, () => videosQuery.refetch({ throwOnError: true }));
  const deletion = useMutation({
    retry: false,
    mutationFn: async (video: VideoAsset) => {
      await queryClient.cancelQueries({ queryKey });
      await requestVideoResponse(`/api${projectAssetPath(projectId, video.id)}`, {
        method: 'DELETE',
      });
      videoUpload.markAssetDeleted(video.id);
      queryClient.setQueryData<VideoAsset[]>(
        queryKey,
        (current) => current?.filter((item) => item.id !== video.id) ?? [],
      );
      await videosQuery.refetch({ throwOnError: true });
    },
  });
  async function deleteVideo(video: VideoAsset) {
    setFeedback('');
    try {
      await deletion.mutateAsync(video);
      setFeedback('Video deleted.');
    } catch {
      setNeedsRefresh(true);
      setFeedback(
        'The deletion or list refresh could not be confirmed. Refresh videos before trying again.',
      );
    }
  }
  async function refreshVideos() {
    try {
      await videosQuery.refetch({ throwOnError: true });
      setNeedsRefresh(false);
      setFeedback('Videos refreshed.');
    } catch {
      setFeedback('Videos could not be refreshed. Try again.');
    }
  }
  const uploadStatus = videoUpload.status;
  const canResumeUpload = !!uploadStatus && isResumableUpload(uploadStatus.state);
  const hasTerminalUpload = !!uploadStatus && isTerminalUpload(uploadStatus.state);
  let uploadButtonLabel = canResumeUpload ? 'Resume video upload' : 'Upload video';
  if (videoUpload.isBusy) uploadButtonLabel = 'Uploading…';
  if (videoUpload.isCheckingFile) uploadButtonLabel = 'Checking your file…';
  return (
    <AssetSection
      headingId="videos-heading"
      title="Videos"
      count={videosQuery.data.length}
      description="MP4 up to 20 MiB. Keep the original file to resume an interrupted upload."
      action={
        <Button
          visual="secondary"
          disabled={
            !isUploadFormOpen && (videoUpload.isBusy || (!!uploadStatus && !canResumeUpload))
          }
          onClick={() => {
            setIsUploadFormOpen((value) => !value);
            setSelectedFile(null);
          }}
        >
          {isUploadFormOpen ? 'Hide upload' : canResumeUpload ? 'Resume upload' : '+ Add video'}
        </Button>
      }
    >
      {isUploadFormOpen ? (
        <form
          aria-label="Upload project video"
          onSubmit={(event) => {
            event.preventDefault();
            if (selectedFile) void videoUpload.uploadVideo(selectedFile);
          }}
          className={css({ display: 'flex', flexDirection: 'column', gap: '3', minW: '0' })}
        >
          <label htmlFor={`video-file-${projectId}`} className={css({ textStyle: 'label' })}>
            Choose video
          </label>
          <input
            id={`video-file-${projectId}`}
            ref={fileInputRef}
            type="file"
            accept="video/mp4,.mp4"
            disabled={videoUpload.isBusy || !!hasTerminalUpload}
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            className={css({ display: 'none' })}
          />
          <div
            className={css({
              display: 'flex',
              flexWrap: 'wrap',
              gap: '3',
              alignItems: 'center',
              minW: '0',
            })}
          >
            <Button
              visual="secondary"
              disabled={videoUpload.isBusy || !!hasTerminalUpload}
              aria-describedby={`selected-video-${projectId}`}
              onClick={() => fileInputRef.current?.click()}
            >
              Choose file
            </Button>
            <span
              id={`selected-video-${projectId}`}
              aria-live="polite"
              className={css({
                textStyle: 'small',
                color: 'fg.muted',
                overflowWrap: 'anywhere',
                minW: '0',
              })}
            >
              {selectedFile?.name ?? 'No file selected'}
            </span>
          </div>
          <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '3' })}>
            <Button
              type="submit"
              disabled={
                !selectedFile ||
                videoUpload.isBusy ||
                videoUpload.isStatusUnknown ||
                !!hasTerminalUpload ||
                uploadStatus?.state === 'PROCESSING'
              }
            >
              {uploadButtonLabel}
            </Button>
          </div>
        </form>
      ) : null}
      {uploadStatus ? (
        <VideoUploadTask
          status={uploadStatus}
          isBusy={videoUpload.isBusy}
          isStatusUnknown={videoUpload.isStatusUnknown}
          onCancel={() => {
            void videoUpload.cancelUpload();
          }}
          onFinish={() => {
            void videoUpload.finishUpload();
          }}
          onDismiss={() => {
            videoUpload.dismissUpload();
            setSelectedFile(null);
            setIsUploadFormOpen(false);
          }}
        />
      ) : null}
      {videoUpload.feedback ? <InlineFeedback>{videoUpload.feedback}</InlineFeedback> : null}
      {videoUpload.isStatusUnknown ? (
        <Button
          visual="secondary"
          disabled={videoUpload.isBusy}
          onClick={() => {
            void videoUpload.checkStatus();
          }}
        >
          Check upload status
        </Button>
      ) : null}
      {feedback ? <InlineFeedback>{feedback}</InlineFeedback> : null}
      {needsRefresh || videosQuery.isError ? (
        <Button
          visual="secondary"
          disabled={deletion.isPending || videosQuery.isFetching}
          onClick={() => {
            void refreshVideos();
          }}
        >
          Refresh videos
        </Button>
      ) : null}
      {videosQuery.data.length ? (
        <ul
          aria-label="Project videos"
          className={css({
            display: 'grid',
            gridTemplateColumns: { mobile: 'minmax(0,1fr)', tablet: 'repeat(2,minmax(0,1fr))' },
            gap: '4',
          })}
        >
          {videosQuery.data.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              disabled={deletion.isPending || videosQuery.isFetching || needsRefresh}
              onDelete={() => {
                void deleteVideo(video);
              }}
            />
          ))}
        </ul>
      ) : (
        <p className={css({ textStyle: 'small', color: 'fg.muted' })}>
          No videos yet. Upload a project walkthrough.
        </p>
      )}
    </AssetSection>
  );
}
