import Image from 'next/image';
import type { ReactNode } from 'react';
import { css } from '../../../styled-system/css';
import type { PhotoDeleteActions } from './photo-card';
import { PhotoCard } from './photo-card';
import { PhotoLayout } from './photo-layout';
import { DEMO_PROJECT_ID } from './photo-urls';
import type { ProjectPhotos } from './photo-types';

export function PhotoPage({ project, photos, children, onDelete, deletingPhotoId, deletionBlocked }: ProjectPhotos & {
  children?: ReactNode;
} & PhotoDeleteActions) {
  return (
    <PhotoLayout>
      <section aria-labelledby="project-name" className={css({ display: 'flex', flexDirection: 'column', gap: '2', minW: '0' })}>
        <p className={css({ fontSize: 'xs', letterSpacing: '0.08em', color: 'fg.muted' })}>
          {project.id === DEMO_PROJECT_ID ? 'DEMO PROJECT' : 'PROJECT'}
        </p>
        <h1 id="project-name" className={css({ textStyle: 'pageTitle', overflowWrap: 'anywhere' })}>{project.name}</h1>
        <p className={css({ display: 'flex', gap: '2', alignItems: 'flex-start', textStyle: 'small', color: 'fg.muted', overflowWrap: 'anywhere' })}>
          <Image src="/icons/pin.svg" width={18} height={18} alt="" unoptimized className={css({ flexShrink: 0 })} />
          {project.address}
        </p>
      </section>
      <section aria-labelledby="photos-heading" className={css({ display: 'flex', flexDirection: 'column', gap: { mobile: '6', desktop: '8' } })}>
        <div className={css({ display: 'flex', flexDirection: 'column', gap: '2' })}>
          <div className={css({ display: 'flex', alignItems: 'center', gap: '3' })}>
            <h2 id="photos-heading" className={css({ textStyle: 'heading' })}>Photos</h2>
            <span aria-label={`${photos.length} photos`} className={css({ bg: 'border', color: 'fg.muted', textStyle: 'label', minW: '8', h: '7', px: '2', rounded: 'full', display: 'grid', placeItems: 'center' })}>
              {photos.length}
            </span>
          </div>
          <p className={css({ color: 'fg.muted' })}>Keep project photos together, from upload to review.</p>
        </div>
        {children}
        {photos.length === 0 ? (
          <div className={css({ bg: 'bg.surface', borderWidth: '1px', borderColor: 'border', rounded: 'xl', p: { mobile: '6', tablet: '12' }, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4', textAlign: 'center' })}>
            <div className={css({ w: '16', h: '16', bg: 'brand.soft', rounded: 'full', display: 'grid', placeItems: 'center' })}>
              <Image src="/icons/image.svg" width={30} height={30} alt="" unoptimized />
            </div>
            <h3 className={css({ textStyle: 'heading' })}>No photos yet</h3>
            <p className={css({ color: 'fg.muted', maxW: 'md' })}>Photos added to this project will appear here.</p>
          </div>
        ) : (
          <ul aria-label="Project photos" className={css({
            display: 'grid', gridTemplateColumns: { mobile: 'minmax(0, 1fr)', tablet: 'repeat(2, minmax(0, 1fr))', desktop: 'repeat(3, minmax(0, 1fr))' },
            gap: { mobile: '4', tablet: '6' },
          })}>
            {photos.map((photo, index) => <PhotoCard eagerPreview={index === 0} key={photo.id} projectId={project.id} photo={photo} onDelete={onDelete} deletingPhotoId={deletingPhotoId} deletionBlocked={deletionBlocked} />)}
          </ul>
        )}
      </section>
    </PhotoLayout>
  );
}
