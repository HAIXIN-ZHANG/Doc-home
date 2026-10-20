import type { ReactNode } from 'react';

import { css } from '../../../styled-system/css';
import { assetSection } from '../../../styled-system/recipes';

interface AssetSectionProps {
  headingId: string;
  title: string;
  count: number;
  description: string;
  action?: ReactNode;
  children: ReactNode;
  visual?: 'surface' | 'plain';
}

export function AssetSection({
  headingId,
  title,
  count,
  description,
  action,
  children,
  visual = 'surface',
}: AssetSectionProps) {
  return (
    <section aria-labelledby={headingId} className={assetSection({ visual })}>
      <div className={css({ display: 'flex', flexDirection: 'column', gap: '2' })}>
        <div
          className={css({
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '3',
          })}
        >
          <div className={css({ display: 'flex', alignItems: 'center', gap: '3' })}>
            <h2 id={headingId} className={css({ textStyle: 'heading' })}>
              {title}
            </h2>
            <span
              aria-label={`${count} ${title.toLowerCase()}`}
              className={css({
                bg: 'border',
                color: 'fg.muted',
                textStyle: 'label',
                minW: '8',
                h: '7',
                px: '2',
                rounded: 'full',
                display: 'grid',
                placeItems: 'center',
              })}
            >
              {count}
            </span>
          </div>
          {action}
        </div>
        <p className={css({ textStyle: 'small', color: 'fg.muted' })}>{description}</p>
      </div>
      {children}
    </section>
  );
}
