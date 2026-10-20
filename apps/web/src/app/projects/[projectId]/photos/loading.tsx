import { ProjectAssetsLayout } from '@/features/project-assets/project-assets-layout';

import { css } from '../../../../../styled-system/css';

export default function Loading() {
  return (
    <ProjectAssetsLayout>
      <div role="status" aria-live="polite" className={css({ py: '12' })}>
        <h1 className={css({ textStyle: 'heading' })}>Loading project assets…</h1>
      </div>
    </ProjectAssetsLayout>
  );
}
