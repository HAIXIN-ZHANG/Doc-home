import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Project } from '../../projects/entities/project.entity.js';

export type PhotoMimeType = 'image/jpeg' | 'image/png';

@Entity('photos')
@Unique('UQ_photos_storage_key', ['storageKey'])
@Index('IDX_photos_project_created_id', ['projectId', 'createdAt', 'id'])
@Check('CHK_photos_size_positive', '"size_bytes" > 0')
@Check('CHK_photos_name_not_blank', 'length(btrim("original_name")) > 0')
@Check('CHK_photos_storage_key_not_blank', 'length(btrim("storage_key")) > 0')
@Check('CHK_photos_mime_type', '"mime_type" IN (\'image/jpeg\', \'image/png\')')
export class Photo {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_photos' })
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  // SQL cascades cannot clean up objects in S3; project deletion needs its own workflow.
  @ManyToOne(() => Project, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'project_id', foreignKeyConstraintName: 'FK_photos_project' })
  project!: Relation<Project>;

  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName!: string;

  @Column({ name: 'storage_key', type: 'text' })
  storageKey!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 32 })
  mimeType!: PhotoMimeType;

  @Column({ name: 'size_bytes', type: 'integer' })
  sizeBytes!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
