export const DEMO_PROJECT_ID = '39f7c890-a5aa-4a74-8a3a-7fba28ac58b6';

export function projectPhotosPath(projectId: string): string {
  // Resource IDs belong in path segments; display names and storage keys do not.
  return `/projects/${encodeURIComponent(projectId)}/photos`;
}

export function photoContentUrl(
  projectId: string,
  photoId: string,
  size?: { w?: number; h?: number },
): string {
  // Browser requests stay same-origin through Next's existing /api rewrite.
  const path = `/api${projectPhotosPath(projectId)}/${encodeURIComponent(photoId)}/content`;
  const query = new URLSearchParams();
  if (size?.w !== undefined) query.set('w', String(size.w));
  if (size?.h !== undefined) query.set('h', String(size.h));
  return query.size ? `${path}?${query.toString()}` : path;
}
