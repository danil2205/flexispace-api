import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BookingCancelledEvent } from '../events/booking-cancelled.event';
import { PromoCodesService } from 'src/promo-codes/promo-codes.service';
import { DataSource } from 'typeorm';

@Injectable()
export class PromoCodeListener {
  private readonly logger = new Logger(PromoCodeListener.name);

  constructor(
    private readonly promoCodesService: PromoCodesService,
    private readonly dataSource: DataSource,
  ) {}

  @OnEvent('booking.cancelled', { async: true })
  public async handleBookingCancelled(event: BookingCancelledEvent) {
    const { booking, wasPending } = event;

    if (!wasPending || !booking.promoCode) return;

    try {
      await this.promoCodesService.changeUses(
        this.dataSource.manager,
        booking.promoCode.id,
        1,
      );
    } catch (error) {
      this.logger.error(
        `Failed to restore promo code ${booking.promoCode.id} for booking ${booking.id}: ${
          error instanceof Error ? error.message : JSON.stringify(error)
        }`,
      );
    }
  }
}
