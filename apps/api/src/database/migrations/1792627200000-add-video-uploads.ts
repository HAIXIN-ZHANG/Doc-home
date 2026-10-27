import type { MigrationInterface, QueryRunner } from 'typeorm';
export class AddVideoUploads1792627200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE video_uploads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      name varchar(255) NOT NULL CHECK(length(btrim(name))>0), size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 20971520),
      sha256 varchar(64) NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
      state varchar(16) NOT NULL CHECK(state IN ('CREATED','UPLOADING','PROCESSING','READY','FAILED','CANCELED','EXPIRED')),
      attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 2), attempt_started_at timestamptz,
      attempt_deadline timestamptz, next_attempt_at timestamptz, error_code varchar(32), cleanup_done boolean NOT NULL DEFAULT false,
      expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
    await q.query(`CREATE TABLE upload_parts (
      upload_id uuid NOT NULL REFERENCES video_uploads(id) ON DELETE RESTRICT, part_number integer NOT NULL CHECK(part_number BETWEEN 0 AND 3),
      size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880), sha256 varchar(64) NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
      storage_key text NOT NULL UNIQUE, PRIMARY KEY(upload_id,part_number))`);
    await q.query('CREATE INDEX "IDX_video_work" ON video_uploads(state,next_attempt_at)');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('LOCK TABLE video_uploads IN ACCESS EXCLUSIVE MODE');
    await q.query(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM video_uploads) THEN RAISE EXCEPTION 'Cannot discard retained video upload sessions'; END IF; END $$`);
    await q.query('DROP TABLE upload_parts'); await q.query('DROP TABLE video_uploads');
  }
}
