import { Test } from '@nestjs/testing';
import { NotificationsListener } from './notifications.listener';
import { DataSource, EntityManager } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';
import { Booking } from '../entities/booking.entity';
import { BookingCancelledEvent } from '../events/booking-cancelled.event';
import { Logger } from '@nestjs/common';
import { Waitlist } from '../entities/waitlist.entity';

describe('NotificationsListener', () => {
  let listener: NotificationsListener;
  let mockDataSource: Partial<DataSource>;
  let mockEventEmitter: Partial<EventEmitter2>;
  let mockEmailQueue: jest.Mocked<Queue>;

  const mockDsFind = jest.fn();
  const mockDsRemove = jest.fn();
  const mockEmailAdd = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();

    mockDataSource = {
      manager: {
        find: mockDsFind,
        remove: mockDsRemove,
      } as unknown as EntityManager,
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    mockEmailQueue = {
      add: mockEmailAdd,
    } as unknown as jest.Mocked<Queue>;

    const module = await Test.createTestingModule({
      providers: [
        NotificationsListener,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: getQueueToken('emails'),
          useValue: mockEmailQueue,
        },
      ],
    }).compile();

    listener = module.get<NotificationsListener>(NotificationsListener);
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  describe('handleBookingCancelled', () => {
    const mockBooking = {
      id: 'b123',
      workspace: { id: 1 },
      startTime: new Date('2026-05-18T10:00:00Z'),
      endTime: new Date('2026-05-18T12:00:00Z'),
    } as Booking;

    const mockEvent = new BookingCancelledEvent(mockBooking);

    it('should emit a workspace.updated event and query waitlist', async () => {
      mockDsFind.mockResolvedValue([]);

      await listener.handleBookingCancelled(mockEvent);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith('workspace.updated', {
        event: 'workspace_freed',
        workspaceId: mockBooking.workspace.id,
        startTime: mockBooking.startTime,
        endTime: mockBooking.endTime,
      });

      expect(mockDsFind).toHaveBeenCalledWith(Waitlist, {
        where: {
          workspace: { id: mockBooking.workspace.id },
          startTime: mockBooking.startTime,
          endTime: mockBooking.endTime,
        },
      });
    });

    it('should queue email and remove users if waitlist is not empty', async () => {
      const mockWaitlists = [
        {
          user: {
            email: 'test@test.com',
            firstName: 'Test',
          },
          workspace: { title: 'Test Workspace' },
          startTime: mockBooking.startTime,
          endTime: mockBooking.endTime,
        },
      ];
      mockDsFind.mockResolvedValue(mockWaitlists);

      await listener.handleBookingCancelled(mockEvent);

      expect(mockEmailAdd).toHaveBeenCalledTimes(1);
      expect(mockEmailAdd).toHaveBeenCalledWith(
        'send-waitlist-notification',
        {
          email: 'test@test.com',
          username: 'Test',
          workspaceTitle: 'Test Workspace',
          startTime: mockBooking.startTime,
          endTime: mockBooking.endTime,
        },
        expect.any(Object),
      );
      expect(mockDsRemove).toHaveBeenCalledWith(mockWaitlists);
    });

    it('should not queue email or remove users if waitlist is empty', async () => {
      mockDsFind.mockResolvedValue([]);

      await listener.handleBookingCancelled(mockEvent);

      expect(mockEmailAdd).toHaveBeenCalledTimes(0);
      expect(mockDsRemove).toHaveBeenCalledTimes(0);
    });

    it('should log error if something fails during cancellation processing', async () => {
      const err = new Error('database down');
      mockDsFind.mockRejectedValue(err);
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});

      await listener.handleBookingCancelled(mockEvent);

      expect(loggerSpy.mock.calls[0][0]).toContain(
        'Failed to process notifications for cancelled booking b123: database down',
      );

      loggerSpy.mockRestore();
    });
  });

  describe('handleBookingConfirmed', () => {
    const mockBooking: Booking = {
      id: 'b1337',
      user: { email: 'test@test.com', firstName: 'Test' },
      workspace: { title: 'Test Workspace' },
      startTime: new Date('2026-05-18T10:00:00Z'),
      endTime: new Date('2026-05-18T12:00:00Z'),
      price: 100,
      currency: 'USD',
    } as Booking;

    it('should queue a receipt email successfully', async () => {
      await listener.handleBookingConfirmed(mockBooking);

      expect(mockEmailAdd).toHaveBeenCalledTimes(1);
      expect(mockEmailAdd).toHaveBeenCalledWith(
        'send-receipt',
        {
          email: 'test@test.com',
          username: 'Test',
          workspaceTitle: 'Test Workspace',
          startTime: mockBooking.startTime,
          endTime: mockBooking.endTime,
          totalPrice: 100,
          currency: 'USD',
        },
        expect.any(Object),
      );
    });

    it('should log error if something fails during confirmation processing', async () => {
      const err = new Error('database down');
      mockEmailAdd.mockRejectedValue(err);
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});

      await listener.handleBookingConfirmed(mockBooking);

      expect(loggerSpy.mock.calls[0][0]).toContain(
        'Failed to send receipt email for confirmed booking b1337: database down',
      );

      loggerSpy.mockRestore();
    });
  });
});
