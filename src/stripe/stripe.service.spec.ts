import { Test } from '@nestjs/testing';
import { StripeService } from './stripe.service';
import paymentConfig from '../config/payment.config';
import { BadRequestException } from '@nestjs/common';

const mockCreateCheckoutSession = jest.fn();
const mockRetrieveSession = jest.fn();
const mockExpireSession = jest.fn();
const mockCreateRefund = jest.fn();
const mockConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: mockCreateCheckoutSession,
        retrieve: mockRetrieveSession,
        expire: mockExpireSession,
      },
    },
    refunds: {
      create: mockCreateRefund,
    },
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  }));
});

describe('StripeService', () => {
  let service: StripeService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        StripeService,
        {
          provide: paymentConfig.KEY,
          useValue: {
            secretKey: 'secret_key',
            webhookSecret: 'webhook_secret',
          },
        },
      ],
    }).compile();

    service = module.get<StripeService>(StripeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createCheckoutSession', () => {
    it('should call stripe and return a session', async () => {
      const params = {
        currency: 'UAH',
        productName: 'Test Workspace',
        description: 'Test Description',
        amount: 8888,
        successUrl: 'http://success',
        cancelUrl: 'http://cancel',
        metadata: { bookingId: 'uuid' },
      };

      const mockSession = {
        id: 'cs_test_123',
        url: 'http://checkout',
      };

      mockCreateCheckoutSession.mockResolvedValue(mockSession);

      const result = await service.createCheckoutSession(params);

      expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
        {
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: params.currency,
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

      expect(result).toEqual(mockSession);
    });
  });

  describe('refundPaymentBySession', () => {
    const sessionId = 'cs_test_123';
    const amountToRefund = 50.15;

    it('should throw error if payment intent not found', async () => {
      mockRetrieveSession.mockResolvedValue({ payment_intent: null });

      await expect(
        service.refundPaymentBySession(sessionId, amountToRefund),
      ).rejects.toThrow(BadRequestException);
    });

    it('should catch Stripe API errors and wrap them in BadRequestException', async () => {
      mockRetrieveSession.mockRejectedValue(new Error('Stripe error'));

      await expect(
        service.refundPaymentBySession(sessionId, amountToRefund),
      ).rejects.toThrow(new BadRequestException('Refund error: Stripe error'));
    });

    it('should retrieve session and create refund', async () => {
      mockRetrieveSession.mockResolvedValue({ payment_intent: 'pi_test_228' });
      mockCreateRefund.mockResolvedValue({ id: 're_test_228' });

      const result = await service.refundPaymentBySession(
        sessionId,
        amountToRefund,
      );

      expect(mockRetrieveSession).toHaveBeenCalledWith(sessionId);
      expect(mockCreateRefund).toHaveBeenCalledWith({
        payment_intent: 'pi_test_228',
        amount: 5015,
      });
      expect(result).toEqual('re_test_228');
    });
  });

  describe('constructEvent', () => {
    const payload = Buffer.from('test_payload');
    const signature = 'test_signature';

    it('should throw BadRequestException on invalid signature', () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      expect(() => service.constructEvent(payload, signature)).toThrow(
        new BadRequestException('Webhook error: Invalid signature'),
      );
    });

    it('should construct and return stripe event', () => {
      const event = { type: 'checkout.session.completed' };
      mockConstructEvent.mockReturnValue(event);

      const result = service.constructEvent(payload, signature);

      expect(mockConstructEvent).toHaveBeenCalledWith(
        payload,
        signature,
        'webhook_secret',
      );
      expect(result).toEqual(event);
    });
  });

  describe('expireSession', () => {
    const sessionId = 'cs_test_123';

    it('should wrap Stripe errors in BadRequestException', async () => {
      mockExpireSession.mockRejectedValue(new Error('Session already expired'));

      await expect(service.expireSession(sessionId)).rejects.toThrow(
        new BadRequestException(
          'Session expiration error: Session already expired',
        ),
      );
    });

    it('should call expire on stripe session', async () => {
      mockExpireSession.mockResolvedValue({});

      await service.expireSession(sessionId);

      expect(mockExpireSession).toHaveBeenCalledWith(sessionId);
    });
  });
});
