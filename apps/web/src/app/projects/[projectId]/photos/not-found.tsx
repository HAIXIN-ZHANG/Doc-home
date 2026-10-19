import Link from 'next/link';
import { css } from '../../../../../styled-system/css';
import { button } from '../../../../../styled-system/recipes';
import { PhotoLayout } from '@/features/photos/photo-layout';

export default function NotFound() {
  return (
    <PhotoLayout>
      <h1 className={css({ textStyle: 'pageTitle' })}>Project not found</h1>
      <p className={css({ color: 'fg.muted' })}>This project could not be found. Check the page address and try again.</p>
      <div><Link href="/" className={button({ visual: 'secondary' })}>Go to demo project</Link></div>
    </PhotoLayout>
  );
}
