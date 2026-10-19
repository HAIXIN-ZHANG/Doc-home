'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider, useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { css } from '../../../styled-system/css';
import { PhotoPage } from './photo-page';
import { PhotoUpload } from './photo-upload';
import { projectPhotosPath } from './photo-urls';
import { parseProjectPhotos } from './photo-types';
import { deletePhoto, PhotoDeleteError } from './photo-delete-api';
import type { ProjectPhoto, ProjectPhotos } from './photo-types';

function PhotoQuery({ initialData }: { initialData: ProjectPhotos }) {
  const projectId = initialData.project.id;
  const client = useQueryClient();
  const uploading = useIsMutating({ mutationKey: ['upload-photo', projectId] }) > 0;
  const queryKey = ['project-photos', projectId];
  const [deletionFeedback, setDeletionFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const query = useQuery({
    queryKey,
    initialData,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api${projectPhotosPath(projectId)}`, {
        cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      });
      if (!response.ok) throw new Error('Project photos could not be refreshed');
      return parseProjectPhotos(await response.json(), projectId);
    },
    // The server already loaded this response. Do not repeat it on hydration/focus.
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const deletion = useMutation({
    mutationFn: async (photo: ProjectPhoto) => {
      // Prevent an older in-flight query from restoring a confirmed-deleted card.
      await client.cancelQueries({ queryKey });
      await deletePhoto(projectId, photo.id);
      // Update only after 204, then reconcile the remaining list with the server.
      client.setQueryData<ProjectPhotos>(queryKey, current => current ? {
        ...current, photos: current.photos.filter(item => item.id !== photo.id),
      } : current);
      try { await query.refetch({ throwOnError: true }); return true; }
      catch { return false; }
    },
    retry: false,
  });

  async function handleDelete(photo: ProjectPhoto) {
    if (deletion.isPending || uploading || query.isFetching || needsRefresh || refreshing) return;
    // Native confirmation supplies keyboard/focus handling without a custom modal.
    if (!window.confirm(`Delete "${photo.originalName}"? This cannot be undone.`)) return;
    setDeletionFeedback(null);
    try {
      const refreshed = await deletion.mutateAsync(photo);
      setNeedsRefresh(!refreshed);
      setDeletionFeedback(refreshed
        ? { error: false, message: `Deleted ${photo.originalName}.` }
        : { error: true, message: 'Photo deleted, but the list could not be refreshed. Refresh the photos before another deletion.' });
    } catch (error) {
      setNeedsRefresh(error instanceof PhotoDeleteError ? error.needsRefresh : true);
      setDeletionFeedback({ error: true, message: error instanceof PhotoDeleteError ? error.message : 'The deletion result could not be confirmed. Refresh the photos before trying again.' });
    }
  }

  async function refreshAfterDeletion() {
    if (refreshing || deletion.isPending || uploading || query.isFetching) return;
    setRefreshing(true);
    try {
      await query.refetch({ throwOnError: true });
      setNeedsRefresh(false);
      setDeletionFeedback({ error: false, message: 'Photos refreshed. Check the list before deleting again.' });
    } catch {
      setDeletionFeedback({ error: true, message: 'The photos could not be refreshed. Try again before deleting.' });
    } finally { setRefreshing(false); }
  }

  return (
    <PhotoPage {...query.data} onDelete={photo => { void handleDelete(photo); }}
      deletingPhotoId={deletion.isPending ? deletion.variables?.id : undefined}
      deletionBlocked={deletion.isPending || uploading || query.isFetching || needsRefresh || refreshing}>
      {deletionFeedback ? <p role={deletionFeedback.error ? 'alert' : 'status'} className={css({ textStyle: 'small', color: deletionFeedback.error ? 'status.danger' : 'status.success' })}>{deletionFeedback.message}</p> : null}
      {needsRefresh ? <Button visual="secondary" disabled={refreshing || uploading || query.isFetching} onClick={() => { void refreshAfterDeletion(); }}>{refreshing ? 'Refreshing…' : 'Refresh after deletion'}</Button> : null}
      {/* Serialize writes and their reconciliation so one action cannot cancel another's GET. */}
      <PhotoUpload projectId={projectId} blocked={deletion.isPending || query.isFetching || refreshing} refreshPhotos={async () => {
        await query.refetch({ throwOnError: true });
      }} />
      {query.isError ? (
        <div role="alert" className={css({ color: 'status.danger', display: 'flex', flexWrap: 'wrap', gap: '3', alignItems: 'center' })}>
          <p>The latest photos could not be loaded. The list below may be out of date.</p>
          <Button visual="secondary" disabled={query.isFetching || deletion.isPending || uploading || refreshing} onClick={() => { void query.refetch(); }}>
            {query.isFetching ? 'Trying again…' : 'Try again'}
          </Button>
        </div>
      ) : null}
    </PhotoPage>
  );
}

export function ProjectPhotoQuery({ initialData }: { initialData: ProjectPhotos }) {
  // Scope this client/cache to the page; never share server-user state in a module singleton.
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}><PhotoQuery initialData={initialData} /></QueryClientProvider>;
}
