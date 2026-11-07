import type { MigrationInterface, QueryRunner } from 'typeorm';
export class PublishVideos1792627200001 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE assets DROP CONSTRAINT "CHK_assets_type", ADD CONSTRAINT "CHK_assets_type" CHECK(type IN ('photo','link','video'))`);
    await q.query(`ALTER TABLE file_details DROP CONSTRAINT "CHK_file_mime", ADD CONSTRAINT "CHK_file_mime" CHECK(mime_type IN ('image/jpeg','image/png','video/mp4'))`);
    await q.query('ALTER TABLE file_details ADD COLUMN upload_id uuid UNIQUE REFERENCES video_uploads(id) ON DELETE RESTRICT');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('LOCK TABLE assets,file_details IN ACCESS EXCLUSIVE MODE');
    await q.query(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM assets WHERE type='video') OR EXISTS(SELECT 1 FROM file_details WHERE upload_id IS NOT NULL OR mime_type='video/mp4') THEN RAISE EXCEPTION 'Cannot discard retained video assets'; END IF; END $$`);
    await q.query('ALTER TABLE file_details DROP COLUMN upload_id');
    await q.query(`ALTER TABLE assets DROP CONSTRAINT "CHK_assets_type", ADD CONSTRAINT "CHK_assets_type" CHECK(type IN ('photo','link'))`);
    await q.query(`ALTER TABLE file_details DROP CONSTRAINT "CHK_file_mime", ADD CONSTRAINT "CHK_file_mime" CHECK(mime_type IN ('image/jpeg','image/png'))`);
  }
}
