import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import paymentConfig from '../config/payment.config';
import { ConfigType } from '@nestjs/config';
import { CreateCheckoutSessionParams } from './interfaces/create-checkout-session.interface';
import { STRIPE_ERRORS } from './stripe.constants';

@Injectable()
export class StripeService {
  private stripe: InstanceType<typeof Stripe>;
  private readonly webhookSecret: string;

  constructor(
    @Inject(paymentConfig.KEY)
    paymentConfiguration: ConfigType<typeof paymentConfig>,
  ) {
    this.stripe = new Stripe(paymentConfiguration.secretKey!, {
      apiVersion: '2026-03-25.dahlia',
    });
    this.webhookSecret = paymentConfiguration.webhookSecret!;
  }

  public async createCheckoutSession(params: CreateCheckoutSessionParams) {
    return this.stripe.checkout.sessions.create(
      {
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: params.currency || 'UAH',
              product_data: {
                name: params.productName,
                description: params.description,
              },
              unit_amount: params.amount,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: params.metadata,
      },
      {
        idempotencyKey: `checkout-session-${params.metadata.bookingId}`,
      },
    );
  }

  public async refundPaymentBySession(
    sessionId: string,
    amountToRefund: number,
  ) {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      const paymentIntent = session.payment_intent as string;

      if (!paymentIntent) {
        throw new BadRequestException(STRIPE_ERRORS.PAYMENT_INTENT_NOT_FOUND);
      }

      const refund = await this.stripe.refunds.create({
        payment_intent: paymentIntent,
        amount: Math.round(amountToRefund * 100),
      });

      return refund.id;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      throw new BadRequestException(`Refund error: ${message}`);
    }
  }

  public constructEvent(payload: Buffer, signature: string) {
    try {
      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      throw new BadRequestException(`Webhook error: ${message}`);
    }
  }

  public async expireSession(sessionId: string) {
    try {
      await this.stripe.checkout.sessions.expire(sessionId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      throw new BadRequestException(`Session expiration error: ${message}`);
    }
  }
}
