import {
  BadRequestException,
  ConflictException,
  Inject,
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
import { OnEvent } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PromoCode } from '../promo-codes/promo-code.entity';
import { PromoCodesService } from '../promo-codes/promo-codes.service';
import { PromoCodeValidatorService } from '../promo-codes/promo-code-validator.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { CreateWaitlistDto } from './dtos/create-waitlist.dto';
import { Waitlist } from './entities/waitlist.entity';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class BookingsService {
  readonly PENDING_BOOKING_TTL_MS: number = 600000;
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly stripeService: StripeService,
    private readonly promoCodesService: PromoCodesService,
    private readonly promoCodeValidatorService: PromoCodeValidatorService,
    private readonly notificationsGateway: NotificationsGateway,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @InjectQueue('emails') private emailQueue: Queue,
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

      this.notificationsGateway.server.emit('workspace_locked', {
        workspaceId: booking.workspace.id,
        startTime: booking.startTime,
        endTime: booking.endTime,
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
      await this.decreasePendingBookingsCount(booking.user.id);

      await this.emailQueue.add(
        'send-receipt',
        {
          userName: booking.user.firstName,
          email: booking.user.email,
          workspaceTitle: booking.workspace.title,
          startTime: booking.startTime,
          endTime: booking.endTime,
          totalPrice: payment
            ? payment.presentment_amount / 100
            : booking.price,
          currency: booking.currency,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      );
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
      await this.promoCodesService.changeUses(
        this.dataSource.manager,
        booking.promoCode.id,
        1,
      );
    }

    booking.status = BookingStatus.CANCELLED;
    await this.dataSource.manager.save(booking);
    await this.decreasePendingBookingsCount(booking.user.id);

    return {
      message: BOOKING_MESSAGES.CANCELLED_SUCCESS,
      data: null,
    };
  }

  public async joinWaitlist(id: number, createWaitlistDto: CreateWaitlistDto) {
    const startTime = new Date(createWaitlistDto.startTime);
    const endTime = new Date(createWaitlistDto.endTime);

    if (startTime >= endTime) {
      throw new BadRequestException('Start time must be before end time');
    }

    if (startTime < new Date()) {
      throw new BadRequestException('Start time cannot be in the past');
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
        if (booking.paymentSessionId) {
          await this.stripeService.expireSession(booking.paymentSessionId);
        }

        if (booking.promoCode) {
          await this.promoCodesService.changeUses(
            this.dataSource.manager,
            booking.promoCode.id,
            1,
          );
        }

        booking.status = BookingStatus.CANCELLED;
        await this.dataSource.manager.save(booking);
        await this.decreasePendingBookingsCount(booking.user.id);

        this.notificationsGateway.server.emit('workspace_freed', {
          workspaceId: booking.workspace.id,
          startTime: booking.startTime,
          endTime: booking.endTime,
        });

        await this.notifyWaitlistUsers(booking);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : JSON.stringify(error);
        this.logger.error(
          `Booking ${booking.id} could not be cancelled: ${message}`,
        );
      }
    }
  }

  private async decreasePendingBookingsCount(userId: number) {
    const redisKey = `antifraud:pending_bookings:user:${userId}`;
    const currentCount = (await this.cacheManager.get<number>(redisKey)) || 0;

    if (currentCount > 0) {
      await this.cacheManager.set(
        redisKey,
        currentCount - 1,
        this.PENDING_BOOKING_TTL_MS,
      );
    }
  }

  private async notifyWaitlistUsers(booking: Booking) {
    const waitingUsers = await this.dataSource.manager.find(Waitlist, {
      where: {
        workspace: { id: booking.workspace.id },
        startTime: booking.startTime,
        endTime: booking.endTime,
      },
      relations: { user: true, workspace: true },
    });

    if (waitingUsers.length === 0) return;

    for (const waitingUser of waitingUsers) {
      await this.emailQueue.add(
        'send-waitlist-notification',
        {
          email: waitingUser.user.email,
          username: waitingUser.user.firstName,
          workspaceTitle: waitingUser.workspace.title,
          startTime: waitingUser.startTime,
          endTime: waitingUser.endTime,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      );
    }

    await this.dataSource.manager.remove(waitingUsers);
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
