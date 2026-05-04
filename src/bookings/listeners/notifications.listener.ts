import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BookingCancelledEvent } from '../events/booking-cancelled.event';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { DataSource } from 'typeorm';
import { Waitlist } from '../entities/waitlist.entity';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Booking } from '../entities/booking.entity';

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(
    private readonly notificationsGateway: NotificationsGateway,
    private readonly dataSource: DataSource,
    @InjectQueue('emails') private readonly emailQueue: Queue,
  ) {}

  @OnEvent('booking.cancelled', { async: true })
  public async handleBookingCancelled(event: BookingCancelledEvent) {
    const { booking } = event;

    try {
      this.notificationsGateway.server.emit('workspace_freed', {
        workspaceId: booking.workspace.id,
        startTime: booking.startTime,
        endTime: booking.endTime,
      });

      const waitingUsers = await this.dataSource.manager.find(Waitlist, {
        where: {
          workspace: { id: booking.workspace.id },
          startTime: booking.startTime,
          endTime: booking.endTime,
        },
      });

      if (waitingUsers.length > 0) {
        for (const waitingUser of waitingUsers) {
          await this.emailQueue.add(
            'send-waitlist-notification',
            {
              email: waitingUser.user.email,
              username: waitingUser.user.firstName,
              workspaceTitle: waitingUser.workspace.title,
              startTime: waitingUser.startTime,
              endTime: waitingUser.endTime,
            },
            {
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 1000,
              },
            },
          );
        }
        await this.dataSource.manager.remove(waitingUsers);
      }
    } catch (error) {
      this.logger.error(
        `Failed to process notifications for cancelled booking ${booking.id}: ${
          error instanceof Error ? error.message : JSON.stringify(error)
        }`,
      );
    }
  }

  @OnEvent('booking.confirmed', { async: true })
  public async handleBookingConfirmed(booking: Booking) {
    try {
      await this.emailQueue.add(
        'send-receipt',
        {
          userName: booking.user.firstName,
          email: booking.user.email,
          workspaceTitle: booking.workspace.title,
          startTime: booking.startTime,
          endTime: booking.endTime,
          totalPrice: booking.price,
          currency: booking.currency,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to send receipt email for confirmed booking ${booking.id}: ${
          error instanceof Error ? error.message : JSON.stringify(error)
        }`,
      );
    }
  }
}
