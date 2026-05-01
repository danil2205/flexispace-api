import { User } from 'src/users/user.entity';
import { Workspace } from 'src/workspaces/workspace.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('Waitlists')
export class Waitlist {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: true })
  user: User;

  @ManyToOne(() => Workspace, { eager: true })
  workspace: Workspace;

  @Column({ type: 'timestamp' })
  startTime: Date;

  @Column({ type: 'timestamp' })
  endTime: Date;

  @CreateDateColumn()
  createdAt: Date;
}
