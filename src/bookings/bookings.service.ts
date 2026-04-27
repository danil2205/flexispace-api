import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Booking } from './booking.entity';
import { DataSource, EntityManager, Raw } from 'typeorm';
import { CreateBookingDto } from './dtos/create-booking.dto';
import {
  BOOKING_MESSAGES,
  PROMO_CODE_ERRORS,
  BOOKING_ERRORS,
} from './booking.constants';
import { Workspace } from 'src/workspaces/workspace.entity';
import { BookingStatus } from './enums/booking-status.enum';
import { StripeService } from 'src/stripe/stripe.service';
import { OnEvent } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PromoCode } from '../promo-codes/promo-code.entity';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly stripeService: StripeService,
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
        throw new ConflictException(BOOKING_ERRORS.WORKSPACE_OCCUPIED);
      }

      const durationHours =
        (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      let totalPrice = Math.round(durationHours * workspace.pricePerHour);
      let appliedPromoCode: PromoCode | null = null;

      if (createBookingDto.promoCode) {
        appliedPromoCode = await queryRunner.manager.findOne(PromoCode, {
          where: { code: createBookingDto.promoCode },
          lock: { mode: 'pessimistic_write' },
        });

        if (!appliedPromoCode) {
          throw new BadRequestException(PROMO_CODE_ERRORS.INVALID);
        }

        if (!appliedPromoCode.isActive) {
          throw new BadRequestException(PROMO_CODE_ERRORS.INACTIVE);
        }

        if (
          appliedPromoCode.expiresAt &&
          appliedPromoCode.expiresAt < new Date()
        ) {
          throw new BadRequestException(PROMO_CODE_ERRORS.EXPIRED);
        }

        if (appliedPromoCode.remainingUses === 0) {
          throw new BadRequestException(PROMO_CODE_ERRORS.LIMIT_REACHED);
        }

        const discountAmount = Math.round(
          totalPrice * (appliedPromoCode.discountPercentage / 100),
        );
        totalPrice -= discountAmount;

        await this.changeUsesToPromoCode(
          queryRunner.manager,
          appliedPromoCode,
          -1,
        );
      }

      const bookingId = randomUUID();

      const session = await this.stripeService.createCheckoutSession({
        amount: totalPrice,
        currency: 'PLN',
        productName: `Booking ${workspace.title}`,
        description: `Booking from ${start.toLocaleString()} to ${end.toLocaleString()}`,
        metadata: {
          bookingId,
        },
        successUrl: 'http://localhost:3000/api/success',
        cancelUrl: `http://localhost:3000/api/cancel?bookingId=${bookingId}`,
      });

      const booking = queryRunner.manager.create(Booking, {
        id: bookingId,
        user: { id },
        workspace: { id: createBookingDto.workspaceId },
        startTime: createBookingDto.startTime,
        endTime: createBookingDto.endTime,
        price: totalPrice,
        paymentSessionId: session.id,
        promoCode: appliedPromoCode ? { id: appliedPromoCode.id } : undefined,
      });

      await queryRunner.manager.save(booking);

      await queryRunner.commitTransaction();
      return {
        message: BOOKING_MESSAGES.CREATED_SUCCESS,
        data: {
          bookingId,
          paymentUrl: session.url,
        },
      };
    } catch {
      await queryRunner.rollbackTransaction();
      return {
        message: BOOKING_MESSAGES.CREATION_FAILED,
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

  public async cancelBooking(userId: number, bookingId: string) {
    const booking = await this.dataSource.manager.findOne(Booking, {
      where: { id: bookingId, user: { id: userId } },
      relations: { promoCode: true },
    });

    if (!booking) {
      throw new BadRequestException(BOOKING_ERRORS.NOT_FOUND);
    }

    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException(BOOKING_ERRORS.ALREADY_CONFIRMED);
    }

    if (booking.paymentSessionId) {
      await this.stripeService.expireSession(booking.paymentSessionId);
    }

    if (booking.promoCode) {
      await this.changeUsesToPromoCode(
        this.dataSource.manager,
        booking.promoCode,
        1,
      );
    }

    booking.status = BookingStatus.CANCELLED;
    await this.dataSource.manager.save(booking);

    return {
      message: BOOKING_MESSAGES.CANCELLED_SUCCESS,
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
        if (booking.paymentSessionId) {
          await this.stripeService.expireSession(booking.paymentSessionId);
        }

        if (booking.promoCode) {
          await this.changeUsesToPromoCode(
            this.dataSource.manager,
            booking.promoCode,
            1,
          );
        }

        booking.status = BookingStatus.CANCELLED;
        await this.dataSource.manager.save(booking);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : JSON.stringify(error);
        this.logger.error(
          `Booking ${booking.id} could not be cancelled: ${message}`,
        );
      }
    }
  }

  private async changeUsesToPromoCode(
    manager: EntityManager,
    promoCode: PromoCode,
    change: number,
  ) {
    await manager.update(PromoCode, promoCode.id, {
      remainingUses: () => `remainingUses + ${change}`,
    });

    this.logger.log(
      `Changed remaining uses for promo code ${promoCode.code} by ${change}`,
    );
  }
}
