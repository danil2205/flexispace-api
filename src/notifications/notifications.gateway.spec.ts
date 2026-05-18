import { Test } from '@nestjs/testing';
import { NotificationsGateway } from './notifications.gateway';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let mockServer: Partial<Server>;
  let mockSocket: Partial<Socket>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    mockSocket = {
      id: 'testClientId',
      join: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [NotificationsGateway],
    }).compile();

    gateway = module.get<NotificationsGateway>(NotificationsGateway);
    gateway.server = mockServer as Server;
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should log when a client connects', () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'log');

      gateway.handleConnection(mockSocket as Socket);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Client connected:'),
        mockSocket.id,
      );
    });
  });

  describe('handleDisconnect', () => {
    it('should log when a client disconnects', () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'log');

      gateway.handleDisconnect(mockSocket as Socket);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Client disconnected:'),
        mockSocket.id,
      );
    });
  });

  describe('handleBooking', () => {
    it('should join the booking room', async () => {
      const bookingId = 'booking123';
      const loggerSpy = jest.spyOn(Logger.prototype, 'log');

      await gateway.handleBooking(mockSocket as Socket, bookingId);

      expect(mockSocket.join).toHaveBeenCalledWith(`booking_${bookingId}`);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Joined booking room: booking_${bookingId}`),
      );
    });
  });

  describe('handlePaymentSuccess', () => {
    it('should not emit if bookingId is missing', () => {
      const metadata = {};

      gateway.handlePaymentSuccess(metadata);

      expect(mockServer.to).not.toHaveBeenCalled();
      expect(mockServer.emit).not.toHaveBeenCalled();
    });

    it('should emit bookingConfirmed event', () => {
      const metadata = {
        bookingId: 'booking123',
      };

      gateway.handlePaymentSuccess(metadata);

      expect(mockServer.to).toHaveBeenCalledWith('booking_booking123');
      expect(mockServer.emit).toHaveBeenCalledWith('bookingConfirmed', {
        message: 'Booking confirmed successfully',
        bookingId: 'booking123',
        timestamp: expect.any(String) as string,
      });
    });
  });
});
