import Link from 'next/link';

import { ProjectAssetsLayout } from '@/features/project-assets/project-assets-layout';

import { css } from '../../../../../styled-system/css';
import { button } from '../../../../../styled-system/recipes';

export default function NotFound() {
  return (
    <ProjectAssetsLayout>
      <h1 className={css({ textStyle: 'pageTitle' })}>Project not found</h1>
      <p className={css({ color: 'fg.muted' })}>
        This project could not be found. Check the page address and try again.
      </p>
      <div>
        <Link href="/" className={button({ visual: 'secondary' })}>
          Go to demo project
        </Link>
      </div>
    </ProjectAssetsLayout>
  );
}
