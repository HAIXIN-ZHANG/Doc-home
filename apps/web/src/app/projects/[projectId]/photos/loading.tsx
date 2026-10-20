import { css } from '../../../../../styled-system/css';
import { PhotoLayout } from '@/features/photos/photo-layout';

export default function Loading() {
  return (
    <PhotoLayout>
      <div role="status" aria-live="polite" className={css({ py: '12' })}>
        <h1 className={css({ textStyle: 'heading' })}>Loading project assets…</h1>
      </div>
    </PhotoLayout>
  );
}
