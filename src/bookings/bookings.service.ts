import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Booking } from './entities/booking.entity';
import { DataSource, EntityManager, Raw } from 'typeorm';
import { CreateBookingDto } from './dtos/create-booking.dto';
import { BOOKING_ERRORS, BOOKING_MESSAGES } from './booking.constants';
import { Workspace } from 'src/workspaces/workspace.entity';
import { BookingStatus } from './enums/booking-status.enum';
import { StripeService } from 'src/stripe/stripe.service';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PromoCode } from '../promo-codes/promo-code.entity';
import { PromoCodesService } from '../promo-codes/promo-codes.service';
import { PromoCodeValidatorService } from '../promo-codes/promo-code-validator.service';
import { CreateWaitlistDto } from './dtos/create-waitlist.dto';
import { Waitlist } from './entities/waitlist.entity';
import { BookingCancelledEvent } from './events/booking-cancelled.event';
import { WorkspaceUpdatedEvent } from '../workspaces/events/workspace-updated.event';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);
  MINIMUM_CANCELLATION_HOURS = 2;
  FULL_REFUND_HOURS_THRESHOLD = 24;

  constructor(
    private readonly dataSource: DataSource,
    private readonly stripeService: StripeService,
    private readonly promoCodesService: PromoCodesService,
    private readonly promoCodeValidatorService: PromoCodeValidatorService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createBooking(id: number, createBookingDto: CreateBookingDto) {
    const start = new Date(createBookingDto.startTime);
    const end = new Date(createBookingDto.endTime);

    if (start >= end) {
      throw new BadRequestException(BOOKING_ERRORS.INVALID_DATE_RANGE);
    }

    if (start < new Date()) {
      throw new BadRequestException(BOOKING_ERRORS.PAST_BOOKING);
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
        throw new BadRequestException(BOOKING_ERRORS.WORKSPACE_NOT_FOUND);
      }

      const isBookingOverlap = await this.isBookingOverlap(
        queryRunner.manager,
        createBookingDto.workspaceId,
        start,
        end,
      );

      if (isBookingOverlap) {
        throw new ConflictException(BOOKING_ERRORS.WORKSPACE_OCCUPIED);
      }

      const durationHours =
        (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      let totalPrice = Math.round(durationHours * workspace.pricePerHour);

      let appliedPromoCode: PromoCode | null = null;
      if (createBookingDto.promoCode) {
        appliedPromoCode =
          await this.promoCodeValidatorService.validatePromoCode(
            createBookingDto.promoCode,
            id,
            workspace,
            totalPrice,
            start,
            queryRunner.manager,
          );

        const discountAmount = Math.round(
          totalPrice * (appliedPromoCode.discountPercentage / 100),
        );
        totalPrice -= discountAmount;

        await this.promoCodesService.changeUses(
          queryRunner.manager,
          appliedPromoCode.id,
          -1,
        );
      }

      const bookingId = randomUUID();
      const session = await this.stripeService.createCheckoutSession({
        amount: totalPrice * 100,
        currency: 'UAH',
        productName: `Booking ${workspace.title}`,
        description: `Booking from ${start.toLocaleString()} to ${end.toLocaleString()}`,
        metadata: {
          bookingId,
        },
        successUrl: 'http://localhost:3500/payment/success',
        cancelUrl: `http://localhost:3500/payment/cancel?bookingId=${bookingId}`,
      });

      const booking = queryRunner.manager.create(Booking, {
        id: bookingId,
        user: { id },
        workspace: { id: createBookingDto.workspaceId },
        startTime: start,
        endTime: end,
        price: totalPrice,
        paymentSessionId: session.id,
        promoCode: appliedPromoCode ? { id: appliedPromoCode.id } : undefined,
      });

      await queryRunner.manager.save(booking);
      await queryRunner.commitTransaction();

      const workspaceUpdatedEvent: WorkspaceUpdatedEvent = {
        event: 'workspace_locked',
        workspaceId: booking.workspace.id,
        startTime: booking.startTime,
        endTime: booking.endTime,
      };
      this.eventEmitter.emit('workspace.updated', workspaceUpdatedEvent);

      return {
        message: BOOKING_MESSAGES.CREATED_SUCCESS,
        data: {
          bookingId,
          paymentUrl: session.url,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  @OnEvent('payment.success')
  public async confirmBooking(
    metadata: Record<string, string>,
    payment?: {
      presentment_amount: number;
      presentment_currency: string;
    },
  ) {
    const bookingId = metadata.bookingId;
    if (!bookingId) return;

    const booking = await this.dataSource.manager.findOne(Booking, {
      where: { id: bookingId },
      relations: { user: true, workspace: true },
    });

    if (booking && booking.status === BookingStatus.PENDING) {
      booking.status = BookingStatus.CONFIRMED;
      if (payment) {
        booking.currency = payment.presentment_currency.toUpperCase();
        booking.price = Math.floor(payment.presentment_amount / 100);
      }
      await this.dataSource.manager.save(booking);

      this.eventEmitter.emit('booking.confirmed', booking);
    }
  }

  public async cancelBooking(userId: number, bookingId: string) {
    const booking = await this.dataSource.manager.findOne(Booking, {
      where: { id: bookingId, user: { id: userId } },
      relations: { promoCode: true },
    });

    if (!booking) {
      throw new BadRequestException(BOOKING_ERRORS.NOT_FOUND);
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException(BOOKING_ERRORS.ALREADY_CANCELLED);
    }

    const isPending = booking.status === BookingStatus.PENDING;
    let amountToRefund = 0;
    let penaltyApplied = false;

    if (!isPending) {
      const now = new Date().getTime();
      const startTime = new Date(booking.startTime).getTime();
      const hoursUntilStart = (startTime - now) / (1000 * 60 * 60);

      if (hoursUntilStart < this.MINIMUM_CANCELLATION_HOURS) {
        throw new BadRequestException(BOOKING_ERRORS.TOO_LATE_TO_CANCEL);
      }

      const refundPercentage =
        hoursUntilStart >= this.FULL_REFUND_HOURS_THRESHOLD ? 1.0 : 0.5;
      amountToRefund = booking.price * refundPercentage;
      penaltyApplied = refundPercentage < 1.0;
    }

    booking.status = BookingStatus.CANCELLED;
    await this.dataSource.manager.save(booking);

    this.eventEmitter.emit(
      'booking.cancelled',
      new BookingCancelledEvent(booking, amountToRefund, isPending),
    );

    return {
      message: BOOKING_MESSAGES.CANCELLED_SUCCESS,
      data: {
        refundedAmount: amountToRefund,
        penaltyApplied,
      },
    };
  }

  public async joinWaitlist(id: number, createWaitlistDto: CreateWaitlistDto) {
    const startTime = new Date(createWaitlistDto.startTime);
    const endTime = new Date(createWaitlistDto.endTime);

    if (startTime >= endTime) {
      throw new BadRequestException(BOOKING_ERRORS.INVALID_DATE_RANGE);
    }

    if (startTime < new Date()) {
      throw new BadRequestException(BOOKING_ERRORS.PAST_BOOKING);
    }

    const workspace = await this.dataSource.manager.findOne(Workspace, {
      where: { id: createWaitlistDto.workspaceId },
    });

    if (!workspace) {
      throw new BadRequestException(BOOKING_ERRORS.WORKSPACE_NOT_FOUND);
    }

    const waitlist = this.dataSource.manager.create(Waitlist, {
      user: { id },
      workspace,
      startTime,
      endTime,
    });

    await this.dataSource.manager.save(waitlist);

    return {
      message: BOOKING_MESSAGES.WAITLISTED_SUCCESS,
      data: null,
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  public async cancelExpiredBookings() {
    this.logger.debug('Checking for expired bookings');

    const expiredBookings = await this.dataSource.manager.find(Booking, {
      where: {
        status: BookingStatus.PENDING,
        createdAt: Raw((alias) => `${alias} < NOW() - INTERVAL '10 minutes'`),
      },
      relations: { promoCode: true },
    });

    this.logger.warn(
      `Found ${expiredBookings.length} expired bookings. Starting to cancel...`,
    );

    for (const booking of expiredBookings) {
      try {
        booking.status = BookingStatus.CANCELLED;
        await this.dataSource.manager.save(booking);

        this.eventEmitter.emit(
          'booking.cancelled',
          new BookingCancelledEvent(booking),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : JSON.stringify(error);
        this.logger.error(
          `Booking ${booking.id} could not be cancelled: ${message}`,
        );
      }
    }
  }

  private async isBookingOverlap(
    manager: EntityManager,
    workspaceId: number,
    start: Date,
    end: Date,
  ) {
    return manager
      .createQueryBuilder(Booking, 'booking')
      .where('booking.workspaceId = :workspaceId', {
        workspaceId,
      })
      .andWhere('booking.status IN (:...statuses)', {
        statuses: [BookingStatus.CONFIRMED, BookingStatus.PENDING],
      })
      .andWhere('booking.endTime > :start', { start })
      .andWhere('booking.startTime < :end', { end })
      .getOne();
  }
}
