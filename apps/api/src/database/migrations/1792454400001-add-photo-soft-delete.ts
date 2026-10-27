import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhotoSoftDelete1792454400001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Existing rows stay active; IDs, metadata and stored objects are unchanged.
    await queryRunner.query('ALTER TABLE "photos" ADD COLUMN "deleted_at" timestamptz');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Dropping the marker would silently make deleted photos visible again.
    // Lock before checking so a concurrent delete cannot bypass this guard.
    await queryRunner.query(`
      DO $$
      BEGIN
        LOCK TABLE "photos" IN ACCESS EXCLUSIVE MODE;
        IF EXISTS (SELECT 1 FROM "photos" WHERE "deleted_at" IS NOT NULL) THEN
          RAISE EXCEPTION 'Cannot revert photo soft deletion while deleted rows exist';
        END IF;
        ALTER TABLE "photos" DROP COLUMN "deleted_at";
      END $$
    `);
  }
}
