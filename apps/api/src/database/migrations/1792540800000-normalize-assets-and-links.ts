import type { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeAssetsAndLinks1792540800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // Migrations run in one transaction. Stop legacy writes before copying/removing the table.
    await q.query('LOCK TABLE "photos" IN ACCESS EXCLUSIVE MODE');
    await q.query(`CREATE TABLE assets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      type varchar(12) NOT NULL CONSTRAINT "CHK_assets_type" CHECK(type IN ('photo','link')),
      name varchar(2048) NOT NULL CONSTRAINT "CHK_assets_name" CHECK(length(btrim(name)) > 0),
      created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz)`);
    await q.query(`CREATE TABLE file_details (
      asset_id uuid PRIMARY KEY REFERENCES assets(id) ON DELETE RESTRICT,
      storage_key text NOT NULL UNIQUE CONSTRAINT "CHK_file_key" CHECK(length(btrim(storage_key)) > 0),
      mime_type varchar(32) NOT NULL CONSTRAINT "CHK_file_mime" CHECK(mime_type IN ('image/jpeg','image/png')),
      size_bytes integer NOT NULL CONSTRAINT "CHK_file_size" CHECK(size_bytes > 0))`);
    await q.query(`CREATE TABLE link_details (
      asset_id uuid PRIMARY KEY REFERENCES assets(id) ON DELETE RESTRICT,
      url text NOT NULL CONSTRAINT "CHK_link_url" CHECK(length(url) BETWEEN 1 AND 2048))`);
    await q.query('CREATE INDEX "IDX_assets_project_created_id" ON assets(project_id,created_at,id)');
    await q.query(`INSERT INTO assets(id,project_id,type,name,created_at,deleted_at)
      SELECT id,project_id,'photo',original_name,created_at,deleted_at FROM photos`);
    await q.query(`INSERT INTO file_details(asset_id,storage_key,mime_type,size_bytes)
      SELECT id,storage_key,mime_type,size_bytes FROM photos`);
    // No legacy write store remains. Original S3 objects are not involved in this migration.
    await q.query('DROP TABLE photos');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('LOCK TABLE assets,file_details,link_details IN ACCESS EXCLUSIVE MODE');
    await q.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM assets WHERE type <> 'photo') OR EXISTS (SELECT 1 FROM link_details) THEN
        RAISE EXCEPTION 'Cannot revert asset migration while non-photo assets exist';
      END IF;
      IF EXISTS (SELECT 1 FROM assets a LEFT JOIN file_details f ON f.asset_id=a.id
        WHERE f.asset_id IS NULL OR length(a.name)>255) THEN
        RAISE EXCEPTION 'Cannot represent all asset metadata in the legacy photo schema';
      END IF;
    END $$`);
    await q.query(`CREATE TABLE photos (
      id uuid NOT NULL DEFAULT gen_random_uuid() CONSTRAINT "PK_photos" PRIMARY KEY,
      project_id uuid NOT NULL CONSTRAINT "FK_photos_project" REFERENCES projects(id) ON DELETE RESTRICT,
      original_name varchar(255) NOT NULL CONSTRAINT "CHK_photos_name_not_blank" CHECK(length(btrim(original_name)) > 0),
      storage_key text NOT NULL CONSTRAINT "UQ_photos_storage_key" UNIQUE CONSTRAINT "CHK_photos_storage_key_not_blank" CHECK(length(btrim(storage_key)) > 0),
      mime_type varchar(32) NOT NULL CONSTRAINT "CHK_photos_mime_type" CHECK(mime_type IN ('image/jpeg','image/png')),
      size_bytes integer NOT NULL CONSTRAINT "CHK_photos_size_positive" CHECK(size_bytes > 0),
      created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz)`);
    await q.query(`INSERT INTO photos(id,project_id,original_name,storage_key,mime_type,size_bytes,created_at,deleted_at)
      SELECT a.id,a.project_id,a.name,f.storage_key,f.mime_type,f.size_bytes,a.created_at,a.deleted_at
      FROM assets a JOIN file_details f ON f.asset_id=a.id`);
    await q.query('CREATE INDEX "IDX_photos_project_created_id" ON photos(project_id,created_at,id)');
    await q.query('DROP TABLE link_details');
    await q.query('DROP TABLE file_details');
    await q.query('DROP TABLE assets');
  }
}
