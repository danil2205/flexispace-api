import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceType } from './enums/workspace-type.enum';

@Entity('Workspaces')
export class Workspace {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'varchar',
    length: 96,
  })
  title: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  description: string;

  @Column({ type: 'int' })
  pricePerHour: number;

  @Column({
    type: 'int',
    default: 1,
  })
  capacity: number;

  @Index()
  @Column({ type: 'enum', enum: WorkspaceType })
  type: WorkspaceType;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  imageUrl: string | null;

  @Index()
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
