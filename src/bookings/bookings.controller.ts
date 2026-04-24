import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CreateBookingDto } from './dtos/create-booking.dto';
import { ActiveUser } from 'src/auth/decorators/active-user.decorator';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CancelBookingParamDto } from './dtos/cancel-booking-param.dto';

@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @ApiOperation({ summary: 'Create booking' })
  @ApiBody({ type: CreateBookingDto })
  @ApiOkResponse({ description: 'Booking created successfully' })
  @ApiBadRequestResponse({
    description: 'Invalid booking data or workspace not available',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  createBooking(
    @ActiveUser('sub') id: number,
    @Body() createBookingDto: CreateBookingDto,
  ) {
    return this.bookingsService.createBooking(id, createBookingDto);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel booking' })
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
    format: 'uuid',
    example: '6187b9c9-47f5-43a5-b314-f074082a9ce1',
  })
  @ApiOkResponse({ description: 'Booking cancelled successfully' })
  @ApiBadRequestResponse({
    description: 'Booking not found or already confirmed or cancelled',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  cancelBooking(
    @ActiveUser('sub') id: number,
    @Param() { id: bookingId }: CancelBookingParamDto,
  ) {
    return this.bookingsService.cancelBooking(id, bookingId);
  }
}
