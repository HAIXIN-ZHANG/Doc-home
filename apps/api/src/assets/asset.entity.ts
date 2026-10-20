import { Check, Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Project } from '../projects/entities/project.entity.js';
import { FileDetail } from './file-detail.entity.js';
import { LinkDetail } from './link-detail.entity.js';

@Entity('assets')
@Check('CHK_assets_type', `"type" IN ('photo', 'link', 'video')`)
@Check('CHK_assets_name', 'length(btrim("name")) > 0')
@Index('IDX_assets_project_created_id', ['projectId', 'createdAt', 'id'])
export class Asset {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'project_id', type: 'uuid' }) projectId!: string;
  @ManyToOne(() => Project, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'project_id' }) project!: Relation<Project>;
  @Column({ type: 'varchar', length: 12 }) type!: 'photo' | 'link' | 'video';
  @Column({ type: 'varchar', length: 2048 }) name!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt!: Date | null;
  @OneToOne(() => FileDetail, file => file.asset) file!: Relation<FileDetail> | null;
  @OneToOne(() => LinkDetail, link => link.asset) link!: Relation<LinkDetail> | null;
}
