import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('projects')
@Check('CHK_projects_name_not_blank', 'length(btrim("name")) > 0')
@Check('CHK_projects_address_not_blank', 'length(btrim("address")) > 0')
export class Project {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_projects' })
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'text' })
  address!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
