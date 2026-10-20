import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
export type UploadState =
  'CREATED' | 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED' | 'CANCELED' | 'EXPIRED';
@Entity('video_uploads')
export class VideoUpload {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @Column({ type: 'varchar', length: 255 }) name!: string;
  @Column({ name: 'size_bytes', type: 'integer' }) sizeBytes!: number;
  @Column({ type: 'varchar', length: 64 }) sha256!: string;
  @Column({ type: 'varchar', length: 16 }) state!: UploadState;
  @Column({ type: 'integer', default: 0 }) attempts!: number;
  @Column({ name: 'attempt_started_at', type: 'timestamptz', nullable: true })
  attemptStartedAt!: Date | null;
  @Column({ name: 'attempt_deadline', type: 'timestamptz', nullable: true })
  attemptDeadline!: Date | null;
  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt!: Date | null;
  @Column({ name: 'error_code', type: 'varchar', length: 32, nullable: true }) errorCode!:
    string | null;
  @Column({ name: 'cleanup_done', type: 'boolean', default: false }) cleanupDone!: boolean;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
