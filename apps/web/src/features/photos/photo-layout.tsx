import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { css } from '../../../styled-system/css';

export function PhotoLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className={css({ bg: 'bg.surface', borderBottomWidth: '1px', borderColor: 'border' })}>
        <div className={css({
          maxWidth: 'page', mx: 'auto', px: { mobile: '5', tablet: '8' },
          h: { mobile: '16', tablet: '20' }, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4',
        })}>
          <Link href="/" className={css({
            display: 'inline-flex', alignItems: 'center', gap: '3', rounded: 'lg',
            _focusVisible: { outline: '2px solid', outlineColor: 'focus.ring', outlineOffset: '4px' },
          })} aria-label="Doc-home home">
            <span className={css({ bg: 'action.primary', rounded: 'lg', w: '9', h: '9', display: 'grid', placeItems: 'center', flexShrink: 0 })}>
              <Image src="/icons/home.svg" width={22} height={22} alt="" unoptimized />
            </span>
            <span className={css({ textStyle: 'heading' })}>Doc-home</span>
          </Link>
          <span className={css({ textStyle: 'small', color: 'fg.muted', display: { mobile: 'none', tablet: 'block' } })}>
            Project workspace
          </span>
        </div>
      </header>
      <main className={css({
        maxWidth: 'page', mx: 'auto', px: { mobile: '5', tablet: '8' },
        pt: { mobile: '6', tablet: '10' }, pb: { mobile: '8', tablet: '12' },
        display: 'flex', flexDirection: 'column', gap: { mobile: '6', desktop: '8' },
      })}>
        {children}
      </main>
    </>
  );
}
