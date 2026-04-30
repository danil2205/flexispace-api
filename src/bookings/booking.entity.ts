import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Workspace } from '../workspaces/workspace.entity';
import { BookingStatus } from './enums/booking-status.enum';
import { PromoCode } from '../promo-codes/promo-code.entity';

@Entity('Bookings')
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  user: User;

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

  @ManyToOne(() => PromoCode, { nullable: true })
  promoCode: PromoCode;

  @Column({ type: 'enum', enum: BookingStatus, default: BookingStatus.PENDING })
  status: BookingStatus;

  @CreateDateColumn()
  createdAt: Date;
}
