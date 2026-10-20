import 'server-only';

import { projectAssetsPath } from './asset-urls';
import { parseProjectAssets } from './project-assets-types';
import type { ProjectAssets } from './project-assets-types';

export class ProjectAssetsApiError extends Error {
  constructor(
    public readonly status: number,
    requestId: string | null,
  ) {
    super(
      `Project assets could not be loaded (status ${status}, request ${requestId ?? 'unknown'})`,
    );
  }
}

export async function getProjectAssets(projectId: string): Promise<ProjectAssets> {
  const origin = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
  const response = await fetch(new URL(projectAssetsPath(projectId), origin), {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new ProjectAssetsApiError(response.status, response.headers.get('x-request-id'));
  return parseProjectAssets(await response.json(), projectId);
}
