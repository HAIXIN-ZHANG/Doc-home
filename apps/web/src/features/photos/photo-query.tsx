'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { css } from '../../../styled-system/css';
import { PhotoPage } from './photo-page';
import { projectPhotosPath } from './photo-urls';
import { parseProjectPhotos } from './photo-types';
import type { ProjectPhotos } from './photo-types';

function PhotoQuery({ initialData }: { initialData: ProjectPhotos }) {
  const projectId = initialData.project.id;
  const query = useQuery({
    queryKey: ['project-photos', projectId],
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

  return (
    <PhotoPage {...query.data}>
      {query.isError ? (
        <div role="alert" className={css({ color: 'status.danger', display: 'flex', flexWrap: 'wrap', gap: '3', alignItems: 'center' })}>
          <p>The latest photos could not be loaded. The list below may be out of date.</p>
          <Button visual="secondary" disabled={query.isFetching} onClick={() => { void query.refetch(); }}>
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
