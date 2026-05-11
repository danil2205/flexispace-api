import { Test } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { StripeService } from 'src/stripe/stripe.service';
import { PromoCodesService } from 'src/promo-codes/promo-codes.service';
import { PromoCodeValidatorService } from 'src/promo-codes/promo-code-validator.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { BOOKING_ERRORS, BOOKING_MESSAGES } from './booking.constants';
import { BookingStatus } from './enums/booking-status.enum';
import { BookingCancelledEvent } from './events/booking-cancelled.event';

describe('BookingsService', () => {
  let service: BookingsService;
  let mockQueryRunner: Partial<QueryRunner>;
  let mockDataSource: Partial<DataSource>;
  let mockStripeService: Partial<StripeService>;
  let mockPromoCodesService: Partial<PromoCodesService>;
  let mockPromoCodeValidatorService: Partial<PromoCodeValidatorService>;
  let mockEventEmitter: Partial<EventEmitter2>;

  const mockManagerFindOne = jest.fn();
  const mockManagerCreate = jest.fn();
  const mockManagerSave = jest.fn();

  const mockDsManagerFindOne = jest.fn();
  const mockDsManagerSave = jest.fn();
  const mockDsManagerCreate = jest.fn();
  const mockDsManagerFind = jest.fn();

  const userId = 1;
  const futureStart = new Date(Date.now() + 3600000);
  const futureEnd = new Date(Date.now() + 7200000);
  const dto = {
    workspaceId: 10,
    startTime: futureStart,
    endTime: futureEnd,
  };
  const mockWorkspace = { id: 10, pricePerHour: 500, title: 'Test Room' };

  beforeEach(async () => {
    mockManagerFindOne.mockReset();
    mockManagerCreate.mockReset();
    mockManagerSave.mockReset();
    mockDsManagerFindOne.mockReset();
    mockDsManagerSave.mockReset();
    mockDsManagerCreate.mockReset();
    mockDsManagerFind.mockReset();

    mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        findOne: mockManagerFindOne,
        create: mockManagerCreate,
        save: mockManagerSave,
      } as unknown as EntityManager,
    };

    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
      manager: {
        findOne: mockDsManagerFindOne,
        save: mockDsManagerSave,
        create: mockDsManagerCreate,
        find: mockDsManagerFind,
      } as unknown as EntityManager,
    };

    mockStripeService = {
      createCheckoutSession: jest.fn(),
    };

    mockPromoCodesService = {
      changeUses: jest.fn(),
    };

    mockPromoCodeValidatorService = {
      validatePromoCode: jest.fn(),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: StripeService, useValue: mockStripeService },
        { provide: PromoCodesService, useValue: mockPromoCodesService },
        {
          provide: PromoCodeValidatorService,
          useValue: mockPromoCodeValidatorService,
        },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createBooking', () => {
    const mockSession = { id: 'sess-123', url: 'http://pay' };

    beforeEach(() => {
      jest
        .spyOn(
          service as unknown as {
            isBookingOverlap: (...args: unknown[]) => Promise<boolean>;
          },
          'isBookingOverlap',
        )
        .mockResolvedValue(false);
    });

    it('should throw error if start >= end', async () => {
      const invalidDto = { ...dto, startTime: futureEnd, endTime: futureStart };
      await expect(service.createBooking(userId, invalidDto)).rejects.toThrow(
        new BadRequestException(BOOKING_ERRORS.INVALID_DATE_RANGE),
      );
    });

    it('should throw error if start is in the past', async () => {
      const invalidDto = {
        ...dto,
        startTime: new Date(Date.now() - 3600000),
      };
      await expect(service.createBooking(userId, invalidDto)).rejects.toThrow(
        new BadRequestException(BOOKING_ERRORS.PAST_BOOKING),
      );
    });

    it('should throw error if workspace not found', async () => {
      mockManagerFindOne.mockResolvedValue(null);
      await expect(service.createBooking(userId, dto)).rejects.toThrow(
        new BadRequestException(BOOKING_ERRORS.WORKSPACE_NOT_FOUND),
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should throw error if workspace has active booking', async () => {
      mockManagerFindOne.mockResolvedValue(mockWorkspace);
      jest
        .spyOn(
          service as unknown as {
            isBookingOverlap: (...args: unknown[]) => Promise<boolean>;
          },
          'isBookingOverlap',
        )
        .mockResolvedValue(true);

      await expect(service.createBooking(userId, dto)).rejects.toThrow(
        new ConflictException(BOOKING_ERRORS.WORKSPACE_OCCUPIED),
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should create booking without promo code', async () => {
      mockManagerFindOne.mockResolvedValue(mockWorkspace);
      (mockStripeService.createCheckoutSession as jest.Mock).mockResolvedValue(
        mockSession,
      );
      mockManagerCreate.mockReturnValue({
        workspace: { id: dto.workspaceId },
        startTime: dto.startTime,
        endTime: dto.endTime,
      });

      const result = await service.createBooking(userId, dto);

      expect(mockStripeService.createCheckoutSession).toHaveBeenCalled();
      expect(mockManagerCreate).toHaveBeenCalled();
      expect(mockManagerSave).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'workspace.updated',
        expect.objectContaining({ event: 'workspace_locked' }),
      );
      expect(result.data.paymentUrl).toBe('http://pay');
    });

    it('should apply promo code discount and decrement uses', async () => {
      const mockPromo = { id: 'promo', discountPercentage: 20 };

      mockManagerFindOne.mockResolvedValue(mockWorkspace);
      (
        mockPromoCodeValidatorService.validatePromoCode as jest.Mock
      ).mockResolvedValue(mockPromo);

      (mockStripeService.createCheckoutSession as jest.Mock).mockResolvedValue(
        mockSession,
      );
      mockManagerCreate.mockReturnValue({
        workspace: { id: dto.workspaceId },
        startTime: dto.startTime,
        endTime: dto.endTime,
      });

      await service.createBooking(userId, {
        ...dto,
        promoCode: 'SAVE20',
      });

      expect(
        mockPromoCodeValidatorService.validatePromoCode,
      ).toHaveBeenCalledWith(
        'SAVE20',
        userId,
        mockWorkspace,
        expect.any(Number),
        expect.any(Date),
        mockQueryRunner.manager,
      );
      expect(mockPromoCodesService.changeUses).toHaveBeenCalledWith(
        mockQueryRunner.manager,
        'promo',
        -1,
      );
      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          amount:
            mockWorkspace.pricePerHour * (100 - mockPromo.discountPercentage),
        }),
      );
    });
  });

  describe('confirmBooking', () => {
    it('should do nothing if bookingId is null', async () => {
      await service.confirmBooking({});
      expect(mockManagerFindOne).not.toHaveBeenCalled();
    });

    it('should do nothing if booking is not pending', async () => {
      mockDsManagerFindOne.mockResolvedValue({
        status: BookingStatus.CONFIRMED,
      });
      await service.confirmBooking({ bookingId: '1' });
      expect(mockDsManagerSave).not.toHaveBeenCalled();
    });

    it('should save booking with confirmed status', async () => {
      const mockBooking = {
        status: BookingStatus.PENDING,
      };
      mockDsManagerFindOne.mockResolvedValue(mockBooking);
      await service.confirmBooking({ bookingId: '1' });
      expect(mockDsManagerSave).toHaveBeenCalledWith(mockBooking);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'booking.confirmed',
        mockBooking,
      );
    });

    it('should save booking with payment info', async () => {
      const mockBooking = {
        status: BookingStatus.PENDING,
      };
      mockDsManagerFindOne.mockResolvedValue(mockBooking);
      await service.confirmBooking(
        { bookingId: '1' },
        {
          presentment_amount: 10000,
          presentment_currency: 'uah',
        },
      );
      expect(mockDsManagerSave).toHaveBeenCalledWith(
        expect.objectContaining({
          status: BookingStatus.CONFIRMED,
          currency: 'UAH',
          price: 100,
        }),
      );
    });
  });

  describe('cancelBooking', () => {
    it('should throw error if booking not found', async () => {
      mockDsManagerFindOne.mockResolvedValue(null);
      await expect(service.cancelBooking(1, '1')).rejects.toThrow(
        new BadRequestException(BOOKING_ERRORS.NOT_FOUND),
      );
    });

    it('should throw error if booking already cancelled', async () => {
      mockDsManagerFindOne.mockResolvedValue({
        status: BookingStatus.CANCELLED,
      });
      await expect(service.cancelBooking(1, '1')).rejects.toThrow(
        new BadRequestException(BOOKING_ERRORS.ALREADY_CANCELLED),
      );
    });

    it('should cancel pending booking with no refund', async () => {
      const mockBooking = {
        status: BookingStatus.PENDING,
      };
      mockDsManagerFindOne.mockResolvedValue(mockBooking);

      const result = await service.cancelBooking(1, '1');

      expect(mockBooking.status).toBe(BookingStatus.CANCELLED);
      expect(mockDsManagerSave).toHaveBeenCalledWith(mockBooking);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'booking.cancelled',
        expect.any(BookingCancelledEvent),
      );
      expect(result.data.refundedAmount).toBe(0);
    });

    it('should throw error if confirmed booking is less than 2 hours away', async () => {
      const mockBooking = {
        status: BookingStatus.CONFIRMED,
        startTime: new Date(Date.now() + 30 * 60 * 1000),
      };
      mockDsManagerFindOne.mockResolvedValue(mockBooking);

      await expect(service.cancelBooking(1, '1')).rejects.toThrow(
        new BadRequestException(BOOKING_ERRORS.TOO_LATE_TO_CANCEL),
      );
    });

    it('should apply 50% refund if cancellation is within 2-24 hours', async () => {
      const mockBooking = {
        status: BookingStatus.CONFIRMED,
        startTime: new Date(Date.now() + 10 * 60 * 60 * 1000),
        price: 1000,
      };
      mockDsManagerFindOne.mockResolvedValue(mockBooking);

      const result = await service.cancelBooking(1, '1');

      expect(result.data.refundedAmount).toBe(500);
      expect(result.data.penaltyApplied).toBe(true);
    });

    it('should apply 100% refund if cancellation is more than 24 hours away', async () => {
      const mockBooking = {
        status: BookingStatus.CONFIRMED,
        startTime: new Date(Date.now() + 42 * 60 * 60 * 1000),
        price: 1000,
      };
      mockDsManagerFindOne.mockResolvedValue(mockBooking);

      const result = await service.cancelBooking(1, '1');

      expect(result.data.refundedAmount).toBe(1000);
      expect(result.data.penaltyApplied).toBe(false);
    });
  });

  describe('joinWaitlist', () => {
    it('should throw error if start >= end', async () => {
      const invalidDto = { ...dto, startTime: futureEnd, endTime: futureStart };
      await expect(service.joinWaitlist(userId, invalidDto)).rejects.toThrow(
        new BadRequestException(BOOKING_ERRORS.INVALID_DATE_RANGE),
      );
    });

    it('should throw error if start is in the past', async () => {
      const invalidDto = {
        ...dto,
        startTime: new Date(Date.now() - 3600000),
      };
      await expect(service.joinWaitlist(userId, invalidDto)).rejects.toThrow(
        new BadRequestException(BOOKING_ERRORS.PAST_BOOKING),
      );
    });

    it('should throw error if workspace not found', async () => {
      mockManagerFindOne.mockResolvedValue(null);
      await expect(service.joinWaitlist(userId, dto)).rejects.toThrow(
        new BadRequestException(BOOKING_ERRORS.WORKSPACE_NOT_FOUND),
      );
    });

    it('should create and save waitlist entry', async () => {
      mockDsManagerFindOne.mockResolvedValue(mockWorkspace);

      const result = await service.joinWaitlist(userId, dto);

      expect(mockDsManagerCreate).toHaveBeenCalled();
      expect(mockDsManagerSave).toHaveBeenCalled();
      expect(result).toEqual({
        message: BOOKING_MESSAGES.WAITLISTED_SUCCESS,
        data: null,
      });
    });
  });

  describe('cancelExpiredBookings', () => {
    it('should do nothing if no expired bookings', async () => {
      mockDsManagerFind.mockResolvedValue([]);

      await service.cancelExpiredBookings();

      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
      expect(mockDsManagerSave).not.toHaveBeenCalled();
    });

    it('should cancel each expired booking and emit events', async () => {
      const expiredBookings = [
        { id: 'b1', status: BookingStatus.PENDING, promoCode: null },
        { id: 'b2', status: BookingStatus.PENDING, promoCode: { id: '52' } },
      ];
      mockDsManagerFind.mockResolvedValue(expiredBookings);

      await service.cancelExpiredBookings();

      expect(expiredBookings[0].status).toBe(BookingStatus.CANCELLED);
      expect(expiredBookings[1].status).toBe(BookingStatus.CANCELLED);
      expect(mockDsManagerSave).toHaveBeenCalledTimes(2);
      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(2);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'booking.cancelled',
        expect.any(BookingCancelledEvent),
      );
    });

    it('should continue expiring bookings if one of them fails to cancel', async () => {
      const expiredBookings = [
        { id: 'b1', status: BookingStatus.PENDING, promoCode: null },
        { id: 'b2', status: BookingStatus.PENDING, promoCode: { id: '52' } },
      ];
      mockDsManagerFind.mockResolvedValue(expiredBookings);
      mockDsManagerSave
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(expiredBookings[1]);

      await service.cancelExpiredBookings();

      expect(mockDsManagerSave).toHaveBeenCalledTimes(2);
      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(1);
    });
  });
});
