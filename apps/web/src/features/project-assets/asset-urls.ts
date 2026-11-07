export function projectAssetsPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/assets`;
}

export function projectAssetPath(projectId: string, assetId: string): string {
  return `${projectAssetsPath(projectId)}/${encodeURIComponent(assetId)}`;
}
