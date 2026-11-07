'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { ProjectAssetsLayout } from '@/features/project-assets/project-assets-layout';

import { css } from '../../../../../styled-system/css';

export default function ErrorPage({ reset }: { reset: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <ProjectAssetsLayout>
      <h1 className={css({ textStyle: 'pageTitle' })}>We couldn’t load the project assets</h1>
      <p role="alert" className={css({ color: 'fg.muted' })}>
        The request failed. Please try again.
      </p>
      <div>
        <Button
          visual="secondary"
          disabled={isPending}
          onClick={() =>
            startTransition(() => {
              // Re-fetch server data as well as resetting the client error boundary.
              router.refresh();
              reset();
            })
          }
        >
          {isPending ? 'Trying again…' : 'Try again'}
        </Button>
      </div>
    </ProjectAssetsLayout>
  );
}
