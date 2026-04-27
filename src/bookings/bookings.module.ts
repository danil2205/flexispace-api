import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './booking.entity';
import { BookingsController } from './bookings.controller';
import { StripeModule } from 'src/stripe/stripe.module';
import { PromoCode } from '../promo-codes/promo-code.entity';

@Module({
  providers: [BookingsService],
  imports: [TypeOrmModule.forFeature([Booking, PromoCode]), StripeModule],
  controllers: [BookingsController],
})
export class BookingsModule {}
