import { Check, Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Asset } from './asset.entity.js';

@Entity('link_details')
@Check('CHK_link_url', 'length("url") BETWEEN 1 AND 2048')
export class LinkDetail {
  @PrimaryColumn({ name: 'asset_id', type: 'uuid' }) assetId!: string;
  @OneToOne(() => Asset, asset => asset.link, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'asset_id' }) asset!: Relation<Asset>;
  @Column({ type: 'text' }) url!: string;
}
