import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProjectsAndPhotos1792368000000 implements MigrationInterface {
  name = 'CreateProjectsAndPhotos1792368000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "projects" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(200) NOT NULL,
        "address" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_projects" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_projects_name_not_blank" CHECK (length(btrim("name")) > 0),
        CONSTRAINT "CHK_projects_address_not_blank" CHECK (length(btrim("address")) > 0)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "photos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL,
        "original_name" varchar(255) NOT NULL,
        "storage_key" text NOT NULL,
        "mime_type" varchar(32) NOT NULL,
        "size_bytes" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_photos" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_photos_storage_key" UNIQUE ("storage_key"),
        CONSTRAINT "CHK_photos_size_positive" CHECK ("size_bytes" > 0),
        CONSTRAINT "CHK_photos_name_not_blank" CHECK (length(btrim("original_name")) > 0),
        CONSTRAINT "CHK_photos_storage_key_not_blank" CHECK (length(btrim("storage_key")) > 0),
        CONSTRAINT "CHK_photos_mime_type" CHECK ("mime_type" IN ('image/jpeg', 'image/png')),
        CONSTRAINT "FK_photos_project" FOREIGN KEY ("project_id")
          REFERENCES "projects"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_photos_project_created_id"
      ON "photos" ("project_id", "created_at", "id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Reverting this initial migration deletes both tables; use disposable data only.
    await queryRunner.query('DROP TABLE "photos"');
    await queryRunner.query('DROP TABLE "projects"');
  }
}
