import { Injectable, Inject, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BookingCancelledEvent } from '../events/booking-cancelled.event';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { AntiFraudCacheData } from 'src/auth/interfaces/anti-fraud-cache-data.interface';
import { Booking } from '../entities/booking.entity';

@Injectable()
export class AntifraudListener {
  private readonly logger = new Logger(AntifraudListener.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  @OnEvent('booking.cancelled', { async: true })
  public async handleBookingCancelled(event: BookingCancelledEvent) {
    const { booking, wasPending } = event;
    if (!wasPending) return;
    await this.decreasePendingBookingsCount(booking.user.id);
  }

  @OnEvent('booking.confirmed', { async: true })
  public async handleBookingConfirmed(booking: Booking) {
    await this.decreasePendingBookingsCount(booking.user.id);
  }

  private async decreasePendingBookingsCount(userId: number) {
    try {
      const redisKey = `antifraud:pending_bookings:user:${userId}`;
      const now = Date.now();
      const redisData =
        await this.cacheManager.get<AntiFraudCacheData>(redisKey);

      if (redisData && redisData.count > 0) {
        redisData.count -= 1;
        const remainingTtl = Math.max(0, redisData.expiresAt - now);
        if (remainingTtl > 0) {
          await this.cacheManager.set(redisKey, redisData, remainingTtl);
        } else {
          await this.cacheManager.del(redisKey);
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to decrease pending bookings count for user ${userId}: ${
          error instanceof Error ? error.message : JSON.stringify(error)
        }`,
      );
    }
  }
}
