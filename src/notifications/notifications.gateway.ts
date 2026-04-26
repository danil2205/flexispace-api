import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private logger = new Logger(NotificationsGateway.name);

  handleConnection(client: Socket) {
    this.logger.log('Client connected:', client.id);
  }

  handleDisconnect(client: Socket) {
    this.logger.log('Client disconnected:', client.id);
  }

  @SubscribeMessage('booking')
  async handleBooking(
    @ConnectedSocket() client: Socket,
    @MessageBody() bookingId: string,
  ) {
    await client.join(`booking_${bookingId}`);
    this.logger.log(`Joined booking room: booking_${bookingId}`);
  }

  @OnEvent('payment.success')
  handlePaymentSuccess(metadata: Record<string, string>) {
    const bookingId = metadata.bookingId;
    if (!bookingId) return;

    this.server.to(`booking_${bookingId}`).emit('bookingConfirmed', {
      message: 'Booking confirmed successfully',
      bookingId,
      timestamp: new Date().toISOString(),
    });
  }
}
