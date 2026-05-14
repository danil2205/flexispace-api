import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus, INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import { AppModule } from '../src/app.module';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StripeService } from '../src/stripe/stripe.service';

describe('StripeController (e2e)', () => {
  let app: INestApplication;
  let eventEmitter: EventEmitter2;

  const mockStripeService = {
    constructEvent: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })

      .overrideProvider(StripeService)
      .useValue(mockStripeService)
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();

    eventEmitter = app.get(EventEmitter2);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /stripe/webhook', () => {
    it('should return { received: false } if no stripe signature', async () => {
      const response = await request(app.getHttpServer() as Server)
        .post('/stripe/webhook')
        .send({ data: {} })
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({ received: false });
      expect(mockStripeService.constructEvent).not.toHaveBeenCalled();
    });

    it('should ignore events with type other than checkout.session.completed', async () => {
      const spyEmit = jest.spyOn(eventEmitter, 'emit');

      mockStripeService.constructEvent.mockReturnValue({
        type: 'customer.created',
        data: { object: { id: 1 } },
      });

      const response = await request(app.getHttpServer() as Server)
        .post('/stripe/webhook')
        .set('stripe-signature', 'fake_test_signature')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ any: 'payload' }))
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({ received: true });
      expect(spyEmit).not.toHaveBeenCalledWith(
        'payment.success',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should emit payment.success for checkout.session.completed events', async () => {
      const spyEmit = jest.spyOn(eventEmitter, 'emit');
      const bookingId = '11111111-1111-1111-1111-111111111111';
      const mockCheckoutSession = {
        type: 'checkout.session.completed',
        data: {
          object: {
            metadata: { bookingId },
            presentment_details: {
              presentment_amount: 500,
              presentment_currency: 'usd',
            },
          },
        },
      };

      mockStripeService.constructEvent.mockReturnValue(mockCheckoutSession);

      const response = await request(app.getHttpServer() as Server)
        .post('/stripe/webhook')
        .set('stripe-signature', 'valid_test_signature')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ any: 'payload' }))
        .expect(HttpStatus.OK);

      expect(mockStripeService.constructEvent).toHaveBeenCalledWith(
        expect.any(Buffer),
        'valid_test_signature',
      );
      expect(response.body).toEqual({ received: true });
      expect(spyEmit).toHaveBeenCalledWith(
        'payment.success',
        mockCheckoutSession.data.object.metadata,
        mockCheckoutSession.data.object.presentment_details,
      );
    });
  });
});
