import { getProjectLinks } from '@/features/links/link-api.server';
import { notFound } from 'next/navigation';
import { getProjectPhotos, PhotoApiError } from '@/features/photos/photo-api';
import type { ProjectPhotos } from '@/features/photos/photo-types';
import { ProjectPhotoQuery } from '@/features/photos/photo-query';

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId: rawId } = await params;
  const projectId = rawId.toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(projectId)) notFound();

  let data: ProjectPhotos;
  try {
    data = await getProjectPhotos(projectId);
  } catch (error) {
    if (error instanceof PhotoApiError && (error.status === 400 || error.status === 404)) notFound();
    // A failed query belongs in the route's error boundary, never an empty collection.
    throw error;
  }
  const links = await getProjectLinks(projectId);
  return <ProjectPhotoQuery key={projectId} initialData={data} initialLinks={links} />;
}
