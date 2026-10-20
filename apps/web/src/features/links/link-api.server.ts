import 'server-only';
import { assetsPath, parseProjectLinks } from './link-api';
export async function getProjectLinks(projectId: string) {
  const response = await fetch(new URL(assetsPath(projectId), process.env.API_INTERNAL_URL ?? 'http://localhost:3001'), {
    cache: 'no-store', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Project links could not be loaded (${response.status})`);
  return parseProjectLinks(await response.json(), projectId);
}
