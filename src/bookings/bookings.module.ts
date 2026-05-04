import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './entities/booking.entity';
import { BookingsController } from './bookings.controller';
import { StripeModule } from 'src/stripe/stripe.module';
import { PromoCode } from '../promo-codes/promo-code.entity';
import { PromoCodesModule } from 'src/promo-codes/promo-codes.module';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { Waitlist } from './entities/waitlist.entity';
import { AntifraudListener } from './listeners/antifraud.listener';
import { StripeListener } from './listeners/stripe.listener';
import { PromoCodeListener } from './listeners/promo-code.listener';
import { NotificationsListener } from './listeners/notifications.listener';

@Module({
  providers: [
    BookingsService,
    AntifraudListener,
    StripeListener,
    PromoCodeListener,
    NotificationsListener,
  ],
  imports: [
    TypeOrmModule.forFeature([Booking, PromoCode, Waitlist]),
    BullModule.registerQueue({ name: 'emails' }),
    StripeModule,
    PromoCodesModule,
    NotificationsModule,
  ],
  controllers: [BookingsController],
})
export class BookingsModule {}
