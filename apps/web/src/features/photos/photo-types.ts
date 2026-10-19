// Keep this public HTTP shape aligned with the API response DTO, not its database Entity.
export interface ProjectPhoto {
  id: string;
  originalName: string;
  mimeType: 'image/jpeg' | 'image/png';
  sizeBytes: number;
  createdAt: string;
}

export interface ProjectPhotos {
  project: { id: string; name: string; address: string };
  photos: ProjectPhoto[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPhoto(value: unknown): value is ProjectPhoto {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.originalName === 'string'
    && (value.mimeType === 'image/jpeg' || value.mimeType === 'image/png')
    && typeof value.sizeBytes === 'number' && Number.isInteger(value.sizeBytes) && value.sizeBytes > 0
    && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt));
}

export function parseProjectPhotos(data: unknown, projectId: string): ProjectPhotos {
  // Types disappear at runtime: a malformed response is an error, never an empty list.
  if (!isRecord(data) || !isRecord(data.project)
    || data.project.id !== projectId || typeof data.project.name !== 'string'
    || typeof data.project.address !== 'string'
    || !Array.isArray(data.photos) || !data.photos.every(isPhoto)) {
    throw new Error('Project photo response did not match the expected contract');
  }
  return { project: { id: projectId, name: data.project.name, address: data.project.address }, photos: data.photos };
}
