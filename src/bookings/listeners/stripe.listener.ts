import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BookingCancelledEvent } from '../events/booking-cancelled.event';
import { StripeService } from 'src/stripe/stripe.service';

@Injectable()
export class StripeListener {
  private readonly logger = new Logger(StripeListener.name);

  constructor(private readonly stripeService: StripeService) {}

  @OnEvent('booking.cancelled', { async: true })
  public async handleBookingCancelled(event: BookingCancelledEvent) {
    const { booking, amountToRefund, wasPending } = event;

    if (!booking.paymentSessionId) return;

    try {
      if (wasPending) {
        await this.stripeService.expireSession(booking.paymentSessionId);
      } else if (amountToRefund > 0) {
        await this.stripeService.refundPaymentBySession(
          booking.paymentSessionId,
          amountToRefund,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to process Stripe cancellation for booking ${booking.id}: ${
          error instanceof Error ? error.message : JSON.stringify(error)
        }`,
      );
    }
  }
}
