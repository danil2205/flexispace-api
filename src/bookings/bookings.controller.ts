import {
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CreateBookingDto } from './dtos/create-booking.dto';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CancelBookingParamDto } from './dtos/cancel-booking-param.dto';
import { CreateWaitlistDto } from './dtos/create-waitlist.dto';
import { AntiFraudLimit } from 'src/auth/decorators/anti-fraud-limit.decorator';
import { AntiFraudInterceptor } from 'src/auth/interceptors/anti-fraud.guard';
import { Throttle } from '@nestjs/throttler';

@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @UseInterceptors(AntiFraudInterceptor)
  @AntiFraudLimit(3)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Create booking' })
  @ApiBody({ type: CreateBookingDto })
  @ApiOkResponse({ description: 'Booking created successfully' })
  @ApiBadRequestResponse({
    description: 'Invalid booking data or workspace not available',
  })
  @ApiTooManyRequestsResponse({
    description:
      'Rate limit exceeded (only 5 request per minute allowed) or too many pending bookings.',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  createBooking(
    @CurrentUser('sub') id: number,
    @Body() createBookingDto: CreateBookingDto,
  ) {
    return this.bookingsService.createBooking(id, createBookingDto);
  }

  @Post(':id/cancel')
  @UseInterceptors(AntiFraudInterceptor)
  @AntiFraudLimit(3)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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
    @CurrentUser('sub') id: number,
    @Param() { id: bookingId }: CancelBookingParamDto,
  ) {
    return this.bookingsService.cancelBooking(id, bookingId);
  }

  @Post('waitlist')
  @ApiOperation({ summary: 'Join waitlist' })
  @ApiBody({ type: CreateWaitlistDto })
  @ApiOkResponse({ description: 'Joined waitlist successfully' })
  @ApiBadRequestResponse({
    description: 'Invalid waitlist data or workspace not available',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async joinWaitlist(
    @CurrentUser('sub') id: number,
    @Body() createWaitlistDto: CreateWaitlistDto,
  ) {
    return this.bookingsService.joinWaitlist(id, createWaitlistDto);
  }
}
