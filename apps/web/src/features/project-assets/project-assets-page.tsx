import Image from 'next/image';
import type { ReactNode } from 'react';

import { AssetSection } from '@/components/ui/asset-section';

import { css } from '../../../styled-system/css';
import type { LinkAsset } from '../links/link-api';
import { LinksSection } from '../links/links-section';
import { PhotoCard } from '../photos/photo-card';
import type { PhotoDeleteActions } from '../photos/photo-card';
import type { ProjectPhotos } from '../photos/photo-types';
import { DEMO_PROJECT_ID } from '../photos/photo-urls';
import type { VideoAsset } from '../videos/video-types';
import { VideosSection } from '../videos/videos-section';
import { ProjectAssetsLayout } from './project-assets-layout';

export function ProjectAssetsPage({
  project,
  photos,
  children,
  onDelete,
  deletingPhotoId,
  deletionBlocked,
  initialLinks,
  initialVideos,
}: ProjectPhotos & {
  children?: ReactNode;
  initialLinks?: LinkAsset[];
  initialVideos?: VideoAsset[];
} & PhotoDeleteActions) {
  return (
    <ProjectAssetsLayout>
      <section
        aria-labelledby="project-name"
        className={css({ display: 'flex', flexDirection: 'column', gap: '2', minW: '0' })}
      >
        <p className={css({ fontSize: 'xs', letterSpacing: '0.08em', color: 'fg.muted' })}>
          {project.id === DEMO_PROJECT_ID ? 'DEMO PROJECT' : 'PROJECT'}
        </p>
        <h1 id="project-name" className={css({ textStyle: 'pageTitle', overflowWrap: 'anywhere' })}>
          {project.name}
        </h1>
        <p
          className={css({
            display: 'flex',
            gap: '2',
            alignItems: 'flex-start',
            textStyle: 'small',
            color: 'fg.muted',
            overflowWrap: 'anywhere',
          })}
        >
          <Image
            src="/icons/pin.svg"
            width={18}
            height={18}
            alt=""
            unoptimized
            className={css({ flexShrink: 0 })}
          />
          {project.address}
        </p>
      </section>
      <LinksSection projectId={project.id} initialLinks={initialLinks} />
      <AssetSection
        headingId="photos-heading"
        title="Photos"
        count={photos.length}
        visual="plain"
        description="Keep project photos together, from upload to review."
      >
        {children}
        {photos.length === 0 ? (
          <div
            className={css({
              bg: 'bg.surface',
              borderWidth: '1px',
              borderColor: 'border',
              rounded: 'xl',
              p: { mobile: '6', tablet: '12' },
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4',
              textAlign: 'center',
            })}
          >
            <div
              className={css({
                w: '16',
                h: '16',
                bg: 'bg.accentSubtle',
                rounded: 'full',
                display: 'grid',
                placeItems: 'center',
              })}
            >
              <Image src="/icons/image.svg" width={30} height={30} alt="" unoptimized />
            </div>
            <h3 className={css({ textStyle: 'heading' })}>No photos yet</h3>
            <p className={css({ color: 'fg.muted', maxW: 'md' })}>
              Photos added to this project will appear here.
            </p>
          </div>
        ) : (
          <ul
            aria-label="Project photos"
            className={css({
              display: 'grid',
              gridTemplateColumns: {
                mobile: 'minmax(0, 1fr)',
                tablet: 'repeat(2, minmax(0, 1fr))',
                desktop: 'repeat(3, minmax(0, 1fr))',
              },
              gap: { mobile: '4', tablet: '6' },
            })}
          >
            {photos.map((photo, index) => (
              <PhotoCard
                eagerPreview={index === 0}
                key={photo.id}
                projectId={project.id}
                photo={photo}
                onDelete={onDelete}
                deletingPhotoId={deletingPhotoId}
                deletionBlocked={deletionBlocked}
              />
            ))}
          </ul>
        )}
      </AssetSection>
      <VideosSection projectId={project.id} initialVideos={initialVideos} />
    </ProjectAssetsLayout>
  );
}
