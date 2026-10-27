import type { DataSourceOptions } from 'typeorm';

import { Asset } from '../assets/asset.entity.js';
import { FileDetail } from '../assets/file-detail.entity.js';
import { LinkDetail } from '../assets/link-detail.entity.js';
import { validateDatabaseUrl } from '../config/environment.js';
import { Project } from '../projects/entities/project.entity.js';
import { UploadPart } from '../videos/upload-part.entity.js';
import { VideoUpload } from '../videos/video-upload.entity.js';
import { CreateProjectsAndPhotos1792368000000 } from './migrations/1792368000000-create-projects-and-photos.js';
import { AddPhotoSoftDelete1792454400001 } from './migrations/1792454400001-add-photo-soft-delete.js';
import { NormalizeAssetsAndLinks1792540800000 } from './migrations/1792540800000-normalize-assets-and-links.js';
import { AddVideoUploads1792627200000 } from './migrations/1792627200000-add-video-uploads.js';
import { PublishVideos1792627200001 } from './migrations/1792627200001-publish-videos.js';

// Nest and the CLI share entity/migration configuration, not separate schema definitions.
export function createDatabaseOptions(databaseUrl: unknown): DataSourceOptions {
  return {
    type: 'postgres',
    url: validateDatabaseUrl(databaseUrl),
    entities: [Project, Asset, FileDetail, LinkDetail, VideoUpload, UploadPart],
    migrations: [
      CreateProjectsAndPhotos1792368000000,
      AddPhotoSoftDelete1792454400001,
      NormalizeAssetsAndLinks1792540800000,
      AddVideoUploads1792627200000,
      PublishVideos1792627200001,
    ],
    synchronize: false,
    migrationsRun: false,
    migrationsTransactionMode: 'all',
    // PostgreSQL 17 provides gen_random_uuid() without creating a UUID extension.
    uuidExtension: 'pgcrypto',
    installExtensions: false,
  };
}
