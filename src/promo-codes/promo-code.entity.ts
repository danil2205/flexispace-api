import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('PromoCodes')
export class PromoCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column({ type: 'int', default: 1 })
  maxUses: number;

  @Column({ type: 'int', default: 1 })
  remainingUses: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int' })
  discountPercentage: number;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  conditions: {
    isFirstBooking?: boolean;
    minPrice?: number;
    allowedWorkspaceTypes?: string[];
    onlyWeekends?: boolean;
  };

  @CreateDateColumn()
  createdAt: Date;

  @BeforeInsert()
  setRemainingUses(): void {
    this.remainingUses = this.maxUses ?? 1;
  }
}
