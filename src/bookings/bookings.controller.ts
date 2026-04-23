import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CreateBookingDto } from './dtos/create-booking.dto';
import { ActiveUser } from 'src/auth/decorators/active-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  createBooking(
    @ActiveUser('sub') id: number,
    @Body() createBookingDto: CreateBookingDto,
  ) {
    return this.bookingsService.createBooking(id, createBookingDto);
  }
}
