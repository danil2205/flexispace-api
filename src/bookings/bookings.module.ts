import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './booking.entity';
import { BookingsController } from './bookings.controller';
import { StripeModule } from 'src/stripe/stripe.module';

@Module({
  providers: [BookingsService],
  imports: [TypeOrmModule.forFeature([Booking]), StripeModule],
  controllers: [BookingsController],
})
export class BookingsModule {}
