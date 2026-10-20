export interface LinkAsset { id: string; projectId: string; type: 'link'; name: string; url: string; createdAt: string }
export const assetsPath = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/assets`;
export function normalizeUrl(input: string): string {
  const value = input.trim();
  if (!value || value.length > 2048) throw new Error('Enter a complete HTTP or HTTPS URL (up to 2048 characters).');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Enter a complete HTTP or HTTPS URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.href.length > 2048) {
    throw new Error('Use an HTTP or HTTPS URL without a username or password.');
  }
  return url.href;
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
export function parseLink(value: unknown, projectId: string): LinkAsset {
  if (!record(value) || value.type !== 'link' || value.projectId !== projectId || typeof value.id !== 'string'
    || typeof value.name !== 'string' || !value.name.trim() || typeof value.url !== 'string'
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw new Error('Invalid link response');
  normalizeUrl(value.url);
  return value as unknown as LinkAsset;
}
export function parseProjectLinks(value: unknown, projectId: string): LinkAsset[] {
  if (!record(value) || !record(value.project) || value.project.id !== projectId || !Array.isArray(value.assets)
    || !value.assets.every(item => record(item) && typeof item.type === 'string')) throw new Error('Invalid project assets response');
  return value.assets.filter(item => record(item) && item.type === 'link').map(item => parseLink(item, projectId));
}
export class LinkRequestError extends Error {
  constructor(message: string, readonly uncertain: boolean) { super(message); }
}
async function write(path: string, method: 'POST' | 'DELETE', body?: object): Promise<Response> {
  let response: Response;
  try { response = await fetch(`/api${path}`, { method, signal: AbortSignal.timeout(15_000),
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) }); }
  catch { throw new LinkRequestError('The result could not be confirmed. Refresh links before trying again.', true); }
  if (!response.ok) throw new LinkRequestError(response.status === 400
    ? 'The link could not be saved. Check the URL and name.' : 'The result could not be confirmed. Refresh links before trying again.', response.status !== 400);
  return response;
}
export async function createLink(projectId: string, url: string, name: string): Promise<LinkAsset> {
  const response = await write(`/projects/${encodeURIComponent(projectId)}/links`, 'POST', { url, ...(name.trim() ? { name: name.trim() } : {}) });
  try {
    if (response.status !== 201) throw new Error('Unexpected status');
    return parseLink(await response.json(), projectId);
  } catch { throw new LinkRequestError('The creation result could not be confirmed. Refresh links before trying again.', true); }
}
export async function deleteLink(projectId: string, id: string): Promise<void> {
  const response = await write(`${assetsPath(projectId)}/${encodeURIComponent(id)}`, 'DELETE');
  if (response.status !== 204) throw new LinkRequestError('The deletion result could not be confirmed. Refresh links before trying again.', true);
}
