import {
  Controller,
  Headers,
  Post,
  Req,
  RawBodyRequest,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { StripeService } from './stripe.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Request } from 'express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';

@Controller('stripe')
export class StripeController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Stripe webhook' })
  @ApiHeader({
    name: 'stripe-signature',
    required: true,
    description: 'Stripe signature header',
  })
  @ApiBody({
    description: 'Raw Stripe webhook payload',
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  })
  @ApiOkResponse({
    schema: { example: { received: true } },
    description: 'Webhook handled',
  })
  @ApiBadRequestResponse({
    schema: { example: { received: false } },
    description: 'Missing signature or raw body',
  })
  handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    if (!signature || !req.rawBody) return { received: false };
    const event = this.stripeService.constructEvent(req.rawBody, signature);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      this.eventEmitter.emit(
        'payment.success',
        session.metadata,
        session.presentment_details,
      );
    }
    return { received: true };
  }
}
