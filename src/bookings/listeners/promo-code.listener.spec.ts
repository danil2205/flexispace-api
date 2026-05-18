import { Test } from '@nestjs/testing';
import { PromoCodeListener } from './promo-code.listener';
import { PromoCodesService } from '../../promo-codes/promo-codes.service';
import { DataSource, EntityManager } from 'typeorm';
import { Booking } from '../entities/booking.entity';
import { Logger } from '@nestjs/common';

describe('PromoCodeListener', () => {
  let listener: PromoCodeListener;
  let mockPromoCodesService: Partial<PromoCodesService>;
  let mockDataSource: Partial<DataSource>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPromoCodesService = { changeUses: jest.fn() };

    mockDataSource = { manager: {} as EntityManager };

    const module = await Test.createTestingModule({
      providers: [
        PromoCodeListener,
        { provide: PromoCodesService, useValue: mockPromoCodesService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    listener = module.get<PromoCodeListener>(PromoCodeListener);
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  describe('handleBookingCancelled', () => {
    it('should early return if was pending is false', async () => {
      await listener.handleBookingCancelled({
        booking: {} as Booking,
        wasPending: false,
        amountToRefund: 0,
      });

      expect(mockPromoCodesService.changeUses).not.toHaveBeenCalled();
    });

    it('should early return if no promo code', async () => {
      await listener.handleBookingCancelled({
        booking: { promoCode: null } as unknown as Booking,
        wasPending: true,
        amountToRefund: 0,
      });

      expect(mockPromoCodesService.changeUses).not.toHaveBeenCalled();
    });

    it('should restore promo code uses if was pending is true and promo code exists', async () => {
      const booking = {
        id: 1,
        promoCode: { id: 1 },
      } as unknown as Booking;

      const event = {
        booking,
        wasPending: true,
        amountToRefund: 0,
      };

      await listener.handleBookingCancelled(event);

      expect(mockPromoCodesService.changeUses).toHaveBeenCalled();
      expect(mockPromoCodesService.changeUses).toHaveBeenCalledWith(
        mockDataSource.manager,
        booking.promoCode.id,
        1,
      );
    });

    it('should log error if restoring the promo code fails', async () => {
      const booking = {
        id: 1,
        promoCode: { id: 1 },
      } as unknown as Booking;

      const event = {
        booking,
        wasPending: true,
        amountToRefund: 0,
      };

      const error = new Error('db down');
      (mockPromoCodesService.changeUses as jest.Mock).mockRejectedValue(error);
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});

      await listener.handleBookingCancelled(event);

      expect(mockPromoCodesService.changeUses).toHaveBeenCalledTimes(1);
      expect(mockPromoCodesService.changeUses).toHaveBeenCalledWith(
        mockDataSource.manager,
        booking.promoCode.id,
        1,
      );

      expect(loggerSpy.mock.calls[0][0]).toContain(
        `Failed to restore promo code ${booking.promoCode.id} for booking ${booking.id}: ${error.message}`,
      );

      loggerSpy.mockRestore();
    });
  });
});
