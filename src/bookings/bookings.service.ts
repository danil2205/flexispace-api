import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
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
    this.validateBookingDates(start, end);

    const bookingId = randomUUID();
    let totalPrice = 0;
    let workspace: Workspace | null = null;
    let appliedPromoCode: PromoCode | null = null;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      workspace = await queryRunner.manager.findOne(Workspace, {
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
      totalPrice = Math.round(durationHours * workspace.pricePerHour);

      if (createBookingDto.promoCode) {
        const promoResult = await this.applyPromoCode(
          queryRunner.manager,
          createBookingDto.promoCode,
          id,
          workspace,
          totalPrice,
          start,
        );
        totalPrice = promoResult.totalPrice;
        appliedPromoCode = promoResult.appliedPromoCode;
      }

      const booking = queryRunner.manager.create(Booking, {
        id: bookingId,
        user: { id },
        workspace: { id: createBookingDto.workspaceId },
        startTime: start,
        endTime: end,
        price: totalPrice,
        paymentSessionId: '',
        promoCode: appliedPromoCode ? { id: appliedPromoCode.id } : undefined,
      });

      await queryRunner.manager.save(booking);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    if (!workspace) {
      throw new BadRequestException(BOOKING_ERRORS.WORKSPACE_NOT_FOUND);
    }

    let session: Awaited<
      ReturnType<StripeService['createCheckoutSession']>
    > | null = null;
    try {
      session = await this.stripeService.createCheckoutSession({
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

      await this.dataSource.manager.update(Booking, bookingId, {
        paymentSessionId: session.id,
      });

      const workspaceUpdatedEvent: WorkspaceUpdatedEvent = {
        event: 'workspace_locked',
        workspaceId: workspace.id,
        startTime: start,
        endTime: end,
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
      await this.cleanupFailedBooking(bookingId, session, appliedPromoCode);
      throw error;
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
      throw new NotFoundException(BOOKING_ERRORS.NOT_FOUND);
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
    this.validateBookingDates(startTime, endTime);

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

  public async delete(id: string): Promise<void> {
    const booking = await this.dataSource.manager.findOne(Booking, {
      where: { id },
    });
    if (!booking) {
      throw new NotFoundException(BOOKING_ERRORS.NOT_FOUND);
    }
    await this.dataSource.manager.softDelete(Booking, id);
  }

  private validateBookingDates(start: Date, end: Date): void {
    if (start >= end) {
      throw new BadRequestException(BOOKING_ERRORS.INVALID_DATE_RANGE);
    }
    if (start < new Date()) {
      throw new BadRequestException(BOOKING_ERRORS.PAST_BOOKING);
    }
  }

  private async applyPromoCode(
    manager: EntityManager,
    promoCodeStr: string,
    userId: number,
    workspace: Workspace,
    totalPrice: number,
    startTime: Date,
  ): Promise<{ totalPrice: number; appliedPromoCode: PromoCode }> {
    const appliedPromoCode =
      await this.promoCodeValidatorService.validatePromoCode(
        promoCodeStr,
        userId,
        workspace,
        totalPrice,
        startTime,
        manager,
      );

    const discountAmount = Math.round(
      totalPrice * (appliedPromoCode.discountPercentage / 100),
    );
    const finalPrice = totalPrice - discountAmount;

    await this.promoCodesService.changeUses(manager, appliedPromoCode.id, -1);

    return { totalPrice: finalPrice, appliedPromoCode };
  }

  private async cleanupFailedBooking(
    bookingId: string,
    session: { id: string } | null,
    appliedPromoCode: PromoCode | null,
  ): Promise<void> {
    if (session) {
      await this.stripeService.expireSession(session.id);
    }
    if (appliedPromoCode) {
      await this.promoCodesService.changeUses(
        this.dataSource.manager,
        appliedPromoCode.id,
        1,
      );
    }
    await this.dataSource.manager.delete(Booking, bookingId);
  }
}
