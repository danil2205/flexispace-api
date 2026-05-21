import { User } from 'src/users/user.entity';
import { Workspace } from 'src/workspaces/workspace.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('Waitlists')
@Index(['workspace', 'startTime', 'endTime'])
export class Waitlist {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @ManyToOne(() => User, { eager: true })
  user: User;

  @Index()
  @ManyToOne(() => Workspace, { eager: true })
  workspace: Workspace;

  @Column({ type: 'timestamp' })
  startTime: Date;

  @Column({ type: 'timestamp' })
  endTime: Date;

  @CreateDateColumn()
  createdAt: Date;
}
