import { describe, expect, it } from '@jest/globals';

import { parseProjectAssets } from './project-assets-types';

const projectId = '39f7c890-a5aa-4a74-8a3a-7fba28ac58b6';
const photoId = '92772849-3041-4c81-9c8d-25ba55b409fa';
const videoId = '92772849-3041-4c81-9c8d-25ba55b409fb';
const project = { id: projectId, name: 'A project', address: 'A site' };
const base = { projectId, name: 'Asset name', createdAt: '2026-10-20T00:00:00.000Z' };
const photo = { ...base, id: photoId, type: 'photo', mimeType: 'image/png', sizeBytes: 123 };

describe('project asset composition', () => {
  it('groups a single mixed response without changing the existing photo view contract', () => {
    const result = parseProjectAssets(
      {
        project,
        assets: [
          photo,
          {
            ...base,
            id: videoId,
            type: 'video',
            mimeType: 'video/mp4',
            sizeBytes: 456,
            contentUrl: `/projects/${projectId}/assets/${videoId}/content`,
          },
          { ...base, id: 'link-id', type: 'link', url: 'https://example.com/Reference' },
        ],
      },
      projectId,
    );
    expect(result.photos).toEqual([
      {
        id: photoId,
        originalName: 'Asset name',
        mimeType: 'image/png',
        sizeBytes: 123,
        createdAt: base.createdAt,
      },
    ]);
    expect(result.links).toHaveLength(1);
    expect(result.videos).toHaveLength(1);
    expect(result.project).toEqual(project);
  });
  it('rejects mismatched project responses', () => {
    expect(() =>
      parseProjectAssets({ project: { ...project, id: videoId }, assets: [] }, projectId),
    ).toThrow();
  });
  it('rejects malformed photo metadata instead of silently hiding the photo', () => {
    expect(() =>
      parseProjectAssets({ project, assets: [{ ...photo, name: undefined }] }, projectId),
    ).toThrow();
  });
  it('surfaces unsupported asset types rather than presenting an incomplete project', () => {
    expect(() =>
      parseProjectAssets(
        { project, assets: [{ ...base, id: photoId, type: 'document' }] },
        projectId,
      ),
    ).toThrow('Unsupported project asset type');
  });
});
