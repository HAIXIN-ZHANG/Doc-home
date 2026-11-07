import dataSource from './data-source.js';
import { Project } from '../projects/entities/project.entity.js';

const demoProject = {
  id: '39f7c890-a5aa-4a74-8a3a-7fba28ac58b6',
  name: 'Riverside House',
  address: '24 Sample Street, Perth WA',
};

try {
  await dataSource.initialize();
  // A stable ID and INSERT ... ON CONFLICT DO NOTHING preserve edits and uploaded photos.
  await dataSource
    .getRepository(Project)
    .createQueryBuilder()
    .insert()
    .values(demoProject)
    .orIgnore()
    .execute();
  console.info(`Demo project ready: ${demoProject.id}`);
} finally {
  if (dataSource.isInitialized) await dataSource.destroy();
}
