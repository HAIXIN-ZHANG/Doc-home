import type { ReactNode } from 'react';

import { css } from '../../../styled-system/css';

interface InlineFeedbackProps {
  tone?: 'error' | 'success' | 'neutral';
  children: ReactNode;
}

export function InlineFeedback({ tone = 'neutral', children }: InlineFeedbackProps) {
  const color =
    tone === 'error' ? 'status.danger' : tone === 'success' ? 'status.success' : 'fg.muted';
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={css({ textStyle: 'small', overflowWrap: 'anywhere', color })}
    >
      {children}
    </p>
  );
}
