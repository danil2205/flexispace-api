import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { io, Socket } from 'socket.io-client';

describe('NotificationsGateway (e2e)', () => {
  let app: INestApplication;
  let eventEmitter: EventEmitter2;
  let socket: Socket;
  let url: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    await app.listen(0);
    url = await app.getUrl();
    eventEmitter = app.get(EventEmitter2);
  });

  afterEach(() => {
    if (socket) socket.disconnect();
  });

  afterAll(async () => {
    if (socket) socket.disconnect();
    await app.close();
  });

  it('connect to socket, join in booking room and get notification on payment success', (done) => {
    const bookingId = '11111111-1111-1111-1111-111111111111';

    socket = io(url);

    socket.on('connect', () => {
      socket.emit('booking', bookingId);

      setTimeout(() => {
        eventEmitter.emit('payment.success', { bookingId });
      }, 50);
    });

    socket.on(
      'bookingConfirmed',
      (data: { message: string; bookingId: string; timestamp: string }) => {
        try {
          expect(data.bookingId).toBe(bookingId);
          expect(data.message).toBe('Booking confirmed successfully');
          expect(data.timestamp).toBeDefined();
          done();
        } catch (error) {
          done(error);
        }
      },
    );
  });

  it('should not send notification to a different room', (done) => {
    const bookingId = '11111111-1111-1111-1111-111111111111';
    const differentBookingId = '22222222-2222-2222-2222-222222222222';

    socket = io(url);

    socket.on('connect', () => {
      socket.emit('booking', bookingId);

      setTimeout(() => {
        eventEmitter.emit('payment.success', {
          bookingId: differentBookingId,
        });

        setTimeout(() => {
          eventEmitter.emit('payment.success', { bookingId });
        }, 50);
      }, 50);
    });

    let eventsReceived = 0;

    socket.on(
      'bookingConfirmed',
      (data: { message: string; bookingId: string; timestamp: string }) => {
        eventsReceived++;
        try {
          expect(data.bookingId).toBe(bookingId);
          expect(eventsReceived).toBe(1);
          done();
        } catch (error) {
          done(error);
        }
      },
    );
  });
});
