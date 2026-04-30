import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './booking.entity';
import { BookingsController } from './bookings.controller';
import { StripeModule } from 'src/stripe/stripe.module';
import { PromoCode } from '../promo-codes/promo-code.entity';
import { PromoCodesModule } from 'src/promo-codes/promo-codes.module';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  providers: [BookingsService],
  imports: [
    TypeOrmModule.forFeature([Booking, PromoCode]),
    BullModule.registerQueue({ name: 'emails' }),
    StripeModule,
    PromoCodesModule,
    NotificationsModule,
  ],
  controllers: [BookingsController],
})
export class BookingsModule {}
