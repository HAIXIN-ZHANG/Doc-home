import { notFound } from 'next/navigation';

import { ProjectAssetsQuery } from '@/features/project-assets/project-assets-query';
import type { ProjectAssets } from '@/features/project-assets/project-assets-types';
import {
  getProjectAssets,
  ProjectAssetsApiError,
} from '@/features/project-assets/project-assets.server';
import { isUuid } from '@/lib/validation';

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId: rawId } = await params;
  const projectId = rawId.toLowerCase();
  if (!isUuid(projectId)) notFound();
  let assets: ProjectAssets;
  try {
    assets = await getProjectAssets(projectId);
  } catch (error) {
    if (error instanceof ProjectAssetsApiError && (error.status === 400 || error.status === 404))
      notFound();
    // Failed reads belong in the route boundary, never a misleading empty collection.
    throw error;
  }
  return (
    <ProjectAssetsQuery
      key={projectId}
      initialData={{ project: assets.project, photos: assets.photos }}
      initialLinks={assets.links}
      initialVideos={assets.videos}
    />
  );
}
