'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { css } from '../../../../../styled-system/css';
import { Button } from '@/components/ui/button';
import { PhotoLayout } from '@/features/photos/photo-layout';

export default function ErrorPage({ reset }: { reset: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <PhotoLayout>
      <h1 className={css({ textStyle: 'pageTitle' })}>We couldn’t load the project assets</h1>
      <p role="alert" className={css({ color: 'fg.muted' })}>The request failed. Please try again.</p>
      <div>
        <Button visual="secondary" disabled={isPending} onClick={() => startTransition(() => {
          // Re-fetch server data as well as resetting the client error boundary.
          router.refresh();
          reset();
        })}>{isPending ? 'Trying again…' : 'Try again'}</Button>
      </div>
    </PhotoLayout>
  );
}
