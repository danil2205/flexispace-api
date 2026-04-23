import { Controller, Headers, Post, Req, RawBodyRequest } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Request } from 'express';

@Controller('stripe')
export class StripeController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Post('webhook')
  handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    if (!signature) return { status: 'No signature' };
    const rawBody = req.rawBody;
    if (!rawBody) return { status: 'No raw body' };
    const event = this.stripeService.constructEvent(rawBody, signature);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      this.eventEmitter.emit('payment.success', session.metadata);
    }
    return { received: true };
  }
}
