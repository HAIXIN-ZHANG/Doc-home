import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { DataSource, IsNull } from 'typeorm';
import { createDatabaseOptions } from '../database/database-options.js';
import { Photo } from './entities/photo.entity.js';
import { photoId, projectId } from '../../test/photo-fixtures.js';

// Build real TypeORM metadata/SQL without opening a database connection.
// These cases detect a missing DeleteDateColumn, which repository doubles cannot.
class MetadataDataSource extends DataSource {
  async loadMetadata(): Promise<void> { await this.buildMetadatas(); }
}
const source = new MetadataDataSource(createDatabaseOptions('postgresql://unused:unused@localhost/unused'));
beforeAll(async () => { await source.loadMetadata(); });
afterAll(async () => { if (source.isInitialized) await source.destroy(); });

describe('photo soft-delete visibility in TypeORM', () => {
  it('excludes deleted rows from ordinary project list queries', () => {
    const sql = source.getRepository(Photo).createQueryBuilder('photo')
      .setFindOptions({ where: { projectId }, select: { id: true, originalName: true } }).getSql();
    expect(sql).toContain('"photo"."deleted_at" IS NULL');
    expect(sql).toContain('"photo"."project_id" = $1');
  });
  it('excludes deleted rows before original or resized content can be loaded', () => {
    const sql = source.getRepository(Photo).createQueryBuilder('photo')
      .setFindOptions({ where: { id: photoId, projectId }, select: { storageKey: true, mimeType: true } }).getSql();
    expect(sql).toContain('"photo"."deleted_at" IS NULL');
    expect(sql).toContain('"photo"."project_id" = $2');
  });
  it('allows only the explicit idempotency lookup to include tombstones', () => {
    const sql = source.getRepository(Photo).createQueryBuilder('photo')
      .setFindOptions({ where: { id: photoId, projectId }, withDeleted: true }).getSql();
    expect(sql).not.toContain('"photo"."deleted_at" IS NULL');
    expect(sql).toContain('"photo"."project_id" = $2');
  });
  it('updates the timestamp only while the associated row is active', () => {
    const sql = source.getRepository(Photo).createQueryBuilder().update(Photo)
      .set({ deletedAt: () => 'CURRENT_TIMESTAMP' })
      .where({ id: photoId, projectId, deletedAt: IsNull() }).getSql();
    expect(sql).toContain('SET "deleted_at" = CURRENT_TIMESTAMP');
    expect(sql).toContain('"deleted_at" IS NULL');
    expect(sql).toContain('"project_id" = $2');
  });
});
