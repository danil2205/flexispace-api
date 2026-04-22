import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import paymentConfig from '../config/payment.config';
import { ConfigType } from '@nestjs/config';
import { CreateCheckoutSessionParams } from './interfaces/create-checkout-session.interface';

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
    return this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: params.currency || 'usd',
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
    });
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
}
