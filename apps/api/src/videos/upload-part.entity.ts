import { Column, Entity, PrimaryColumn } from 'typeorm';
@Entity('upload_parts')
export class UploadPart {
  @PrimaryColumn({ name: 'upload_id', type: 'uuid' }) uploadId!: string;
  @PrimaryColumn({ name: 'part_number', type: 'integer' }) partNumber!: number;
  @Column({ name: 'size_bytes', type: 'integer' }) sizeBytes!: number;
  @Column({ type: 'varchar', length: 64 }) sha256!: string;
  @Column({ name: 'storage_key', type: 'text', unique: true }) storageKey!: string;
}
