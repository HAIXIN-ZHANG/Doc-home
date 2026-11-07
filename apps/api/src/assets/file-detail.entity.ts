import { Check, Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import { Asset } from './asset.entity.js';

export type PhotoMimeType = 'image/jpeg' | 'image/png';

@Entity('file_details')
@Check('CHK_file_size', '"size_bytes" > 0')
@Check('CHK_file_key', 'length(btrim("storage_key")) > 0')
@Check('CHK_file_mime', `"mime_type" IN ('image/jpeg', 'image/png', 'video/mp4')`)
export class FileDetail {
  @PrimaryColumn({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @OneToOne(() => Asset, (asset) => asset.file, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'asset_id' })
  asset!: Relation<Asset>;

  @Column({ name: 'storage_key', type: 'text', unique: true })
  storageKey!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 32 })
  mimeType!: PhotoMimeType | 'video/mp4';

  @Column({ name: 'size_bytes', type: 'integer' })
  sizeBytes!: number;

  @Column({ name: 'upload_id', type: 'uuid', nullable: true, unique: true })
  uploadId!: string | null;
}
