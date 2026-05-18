import { Test } from '@nestjs/testing';
import { AntifraudListener } from './antifraud.listener';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BookingCancelledEvent } from '../events/booking-cancelled.event';
import { Booking } from '../entities/booking.entity';
import { Logger } from '@nestjs/common';

describe('AntifraudListener', () => {
  let listener: AntifraudListener;
  let mockCacheManager: Partial<Cache>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AntifraudListener,
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();

    listener = module.get<AntifraudListener>(AntifraudListener);
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  describe('handleBookingCancelled', () => {
    it('should return if was pending is false', async () => {
      const event = {
        booking: {} as Booking,
        wasPending: false,
      } as BookingCancelledEvent;

      await listener.handleBookingCancelled(event);

      expect(mockCacheManager.get).not.toHaveBeenCalled();
    });

    it('should decrease pending bookings count when was pending is true', async () => {
      const event = {
        booking: { user: { id: 1 } } as Booking,
        wasPending: true,
      } as BookingCancelledEvent;

      await listener.handleBookingCancelled(event);

      expect(mockCacheManager.get).toHaveBeenCalledWith(
        `antifraud:pending_bookings:user:${event.booking.user.id}`,
      );
    });
  });

  describe('handleBookingConfirmed', () => {
    it('should decrease pending bookings count', async () => {
      const booking = { user: { id: 1 } } as Booking;

      await listener.handleBookingConfirmed(booking);

      expect(mockCacheManager.get).toHaveBeenCalledWith(
        `antifraud:pending_bookings:user:${booking.user.id}`,
      );
    });
  });

  describe('decreasePendingBookingsCount', () => {
    const userId = 52;
    const redisKey = `antifraud:pending_bookings:user:${userId}`;

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-05-18T12:00:00.000Z'));
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('should do nothing if no redis data', async () => {
      (mockCacheManager.get as jest.Mock).mockResolvedValue(null);

      await listener['decreasePendingBookingsCount'](userId);

      expect(mockCacheManager.get).toHaveBeenCalledWith(redisKey);
      expect(mockCacheManager.set).not.toHaveBeenCalled();
      expect(mockCacheManager.del).not.toHaveBeenCalled();
    });

    it('should do nothing if cache count is 0', async () => {
      const redisData = { count: 0 };
      (mockCacheManager.get as jest.Mock).mockResolvedValue(redisData);

      await listener['decreasePendingBookingsCount'](userId);

      expect(mockCacheManager.get).toHaveBeenCalledWith(redisKey);
      expect(mockCacheManager.set).not.toHaveBeenCalled();
      expect(mockCacheManager.del).not.toHaveBeenCalled();
    });

    it('should decrement cache count and save back to cache if remaining ttl > 0', async () => {
      const now = Date.now();
      const redisData = {
        count: 2,
        expiresAt: now + 5000,
      };
      (mockCacheManager.get as jest.Mock).mockResolvedValue(redisData);

      await listener['decreasePendingBookingsCount'](userId);

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        redisKey,
        {
          count: 1,
          expiresAt: now + 5000,
        },
        5000,
      );
      expect(mockCacheManager.del).not.toHaveBeenCalled();
    });

    it('should decrement cache count and delete if ttl <= 0', async () => {
      const now = Date.now();
      const redisData = {
        count: 2,
        expiresAt: now - 1000,
      };

      (mockCacheManager.get as jest.Mock).mockResolvedValue(redisData);

      await listener['decreasePendingBookingsCount'](userId);

      expect(mockCacheManager.del).toHaveBeenCalledWith(redisKey);
      expect(mockCacheManager.set).not.toHaveBeenCalled();
    });

    it('should log error if cache manager throws an error', async () => {
      const error = new Error('Redis connection failed');
      (mockCacheManager.get as jest.Mock).mockRejectedValue(error);
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});

      await listener['decreasePendingBookingsCount'](userId);

      expect(loggerSpy).toHaveBeenCalledWith(
        `Failed to decrease pending bookings count for user ${userId}: ${error.message}`,
      );
    });
  });
});
