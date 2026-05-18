import { Test } from '@nestjs/testing';
import { StripeListener } from './stripe.listener';
import { StripeService } from 'src/stripe/stripe.service';
import { BookingCancelledEvent } from '../events/booking-cancelled.event';
import { Logger } from '@nestjs/common';

describe('StripeListener', () => {
  let listener: StripeListener;
  let mockStripeService: Partial<StripeService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockStripeService = {
      expireSession: jest.fn(),
      refundPaymentBySession: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        StripeListener,
        { provide: StripeService, useValue: mockStripeService },
      ],
    }).compile();

    listener = module.get<StripeListener>(StripeListener);
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  describe('handleBookingCancelled', () => {
    const mockBookingId = 'booking123';
    const mockSessionId = 'cs_test_abc123';
    const mockEvent = {
      booking: { id: mockBookingId, paymentSessionId: mockSessionId },
      amountToRefund: 0,
      wasPending: false,
    } as unknown as BookingCancelledEvent;

    it('should return early if paymentSessionId is missing', async () => {
      const event = {
        booking: { id: mockBookingId, paymentSessionId: null },
        amountToRefund: 100,
        wasPending: false,
      } as unknown as BookingCancelledEvent;

      await listener.handleBookingCancelled(event);

      expect(mockStripeService.expireSession).not.toHaveBeenCalled();
      expect(mockStripeService.refundPaymentBySession).not.toHaveBeenCalled();
    });

    it('should call expireSession if was pending is true', async () => {
      await listener.handleBookingCancelled({ ...mockEvent, wasPending: true });

      expect(mockStripeService.expireSession).toHaveBeenCalledWith(
        mockSessionId,
      );
      expect(mockStripeService.refundPaymentBySession).not.toHaveBeenCalled();
    });

    it('should call refundPaymentBySession if was pending is false and amount to refund > 0', async () => {
      await listener.handleBookingCancelled({
        ...mockEvent,
        amountToRefund: 50,
      });

      expect(mockStripeService.refundPaymentBySession).toHaveBeenCalledWith(
        mockSessionId,
        50,
      );
      expect(mockStripeService.expireSession).not.toHaveBeenCalled();
    });

    it('should do nothing if wasPending is false and amount to refund is 0', async () => {
      await listener.handleBookingCancelled(mockEvent);

      expect(mockStripeService.expireSession).not.toHaveBeenCalled();
      expect(mockStripeService.refundPaymentBySession).not.toHaveBeenCalled();
    });

    it('should log an error if the stripe service throws an error', async () => {
      const error = new Error('Stripe API down');
      (mockStripeService.refundPaymentBySession as jest.Mock).mockRejectedValue(
        error,
      );

      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});

      await listener.handleBookingCancelled({
        ...mockEvent,
        amountToRefund: 50,
      });

      expect(mockStripeService.refundPaymentBySession).toHaveBeenCalledTimes(1);
      expect(mockStripeService.refundPaymentBySession).toHaveBeenCalledWith(
        mockSessionId,
        50,
      );

      expect(loggerSpy.mock.calls[0][0]).toContain(
        `Failed to process Stripe cancellation for booking ${mockBookingId}: Stripe API down`,
      );

      loggerSpy.mockRestore();
    });
  });
});
