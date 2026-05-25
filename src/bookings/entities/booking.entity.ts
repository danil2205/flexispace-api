import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/users/user.entity';
import { Workspace } from 'src/workspaces/workspace.entity';
import { BookingStatus } from '../enums/booking-status.enum';
import { PromoCode } from 'src/promo-codes/promo-code.entity';

@Entity('Bookings')
@Index(['workspace', 'startTime', 'endTime'])
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => User, { eager: true })
  user: User;

  @Index()
  @ManyToOne(() => Workspace, { eager: true })
  workspace: Workspace;

  @Column({ type: 'int' })
  price: number;

  @Column({ type: 'timestamp' })
  startTime: Date;

  @Column({ type: 'timestamp' })
  endTime: Date;

  @Column({ nullable: true })
  paymentSessionId: string;

  @Column({ type: 'varchar', length: 3, default: 'UAH' })
  currency: string;

  @Index()
  @ManyToOne(() => PromoCode, { nullable: true })
  promoCode: PromoCode;

  @Index()
  @Column({ type: 'enum', enum: BookingStatus, default: BookingStatus.PENDING })
  status: BookingStatus;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date | null;
}
