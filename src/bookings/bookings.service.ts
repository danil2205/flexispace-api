import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Booking } from './booking.entity';
import { DataSource } from 'typeorm';
import { CreateBookingDto } from './dtos/create-booking.dto';
import {
  BOOKING_CREATED_SUCCESS_MESSAGE,
  BOOKING_CREATION_FAILED_MESSAGE,
  INVALID_DATE_RANGE_ERROR,
  PAST_BOOKING_ERROR,
  WORKSPACE_NOT_FOUND_ERROR,
  WORKSPACE_OCCUPIED_ERROR,
} from './booking.constants';
import { Workspace } from 'src/workspaces/workspace.entity';
import { BookingStatus } from './enums/booking-status.enum';
import { StripeService } from 'src/stripe/stripe.service';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class BookingsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly stripeService: StripeService,
  ) {}

  async createBooking(id: number, createBookingDto: CreateBookingDto) {
    const start = new Date(createBookingDto.startTime);
    const end = new Date(createBookingDto.endTime);

    if (start >= end) {
      throw new BadRequestException(INVALID_DATE_RANGE_ERROR);
    }

    if (start < new Date()) {
      throw new BadRequestException(PAST_BOOKING_ERROR);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const workspace = await queryRunner.manager.findOne(Workspace, {
        where: { id: createBookingDto.workspaceId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!workspace) {
        throw new BadRequestException(WORKSPACE_NOT_FOUND_ERROR);
      }

      const isBookingOverlap = await queryRunner.manager
        .createQueryBuilder(Booking, 'booking')
        .where('booking.workspaceId = :workspaceId', {
          workspaceId: createBookingDto.workspaceId,
        })
        .andWhere('booking.status IN (:...statuses)', {
          statuses: [BookingStatus.CONFIRMED, BookingStatus.PENDING],
        })
        .andWhere('booking.endTime > :start', {
          start: createBookingDto.startTime,
        })
        .andWhere('booking.startTime < :end', {
          end: createBookingDto.endTime,
        })
        .getOne();

      if (isBookingOverlap) {
        throw new ConflictException(WORKSPACE_OCCUPIED_ERROR);
      }

      const durationHours =
        (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      const totalPrice = Math.round(durationHours * workspace.pricePerHour);

      const booking = queryRunner.manager.create(Booking, {
        user: { id },
        workspace: { id: createBookingDto.workspaceId },
        startTime: createBookingDto.startTime,
        endTime: createBookingDto.endTime,
        price: totalPrice,
      });

      const savedBooking = await queryRunner.manager.save(booking);
      const session = await this.stripeService.createCheckoutSession({
        amount: totalPrice,
        currency: 'PLN',
        productName: `Booking ${workspace.title}`,
        description: `Booking from ${start.toLocaleString()} to ${end.toLocaleString()}`,
        metadata: {
          bookingId: savedBooking.id,
        },
        successUrl: 'http://localhost:3000/api/success',
        cancelUrl: 'http://localhost:3000/api/cancel',
      });

      await queryRunner.commitTransaction();
      return {
        message: BOOKING_CREATED_SUCCESS_MESSAGE,
        data: {
          bookingId: savedBooking.id,
          paymentUrl: session.url,
        },
      };
    } catch {
      await queryRunner.rollbackTransaction();
      return {
        message: BOOKING_CREATION_FAILED_MESSAGE,
        data: null,
      };
    } finally {
      await queryRunner.release();
    }
  }

  @OnEvent('payment.success')
  public async confirmBooking(metadata: Record<string, string>) {
    const bookingId = metadata.bookingId;
    if (!bookingId) return;

    const booking = await this.dataSource.manager.findOne(Booking, {
      where: { id: bookingId },
    });

    if (booking && booking.status === BookingStatus.PENDING) {
      booking.status = BookingStatus.CONFIRMED;
      await this.dataSource.manager.save(booking);
    }
  }
}
