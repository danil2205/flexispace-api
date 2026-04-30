import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { plainToInstance } from 'class-transformer';
import { SendReceiptDto } from './dtos/send-receipt.dto';
import { validateOrReject } from 'class-validator';
import ical, { ICalAlarmType } from 'ical-generator';
import { MailerService } from '@nestjs-modules/mailer';

@Processor('emails')
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mailerService: MailerService) {
    super();
  }

  async process(job: Job): Promise<any> {
    this.logger.log(`Starting to process job ${job.name} (ID: ${job.id})`);

    switch (job.name) {
      case 'send-receipt': {
        try {
          const dtoInstance = plainToInstance(SendReceiptDto, job.data);
          await validateOrReject(dtoInstance);
          await this.sendReceiptEmail(dtoInstance);
        } catch {
          throw new Error('Validation failed');
        }
        break;
      }
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
        break;
    }
  }

  private async sendReceiptEmail(data: SendReceiptDto) {
    const {
      currency,
      totalPrice,
      startTime,
      endTime,
      workspaceTitle,
      email,
      userName,
    } = data;

    const formattedPrice = new Intl.NumberFormat('uk-UA', {
      style: 'currency',
      currency: currency,
    }).format(totalPrice / 100);

    const calendar = ical({ name: 'Flexispace Bookings' });
    calendar.createEvent({
      description: `Your booking has been confirmed`,
      start: startTime,
      end: endTime,
      summary: `Booking: ${workspaceTitle}`,
      alarms: [{ type: ICalAlarmType.display, trigger: 60 * 15 }],
    });

    try {
      await this.mailerService.sendMail({
        to: email,
        subject: `Booking confirmed: ${workspaceTitle}`,
        template: './receipt',
        context: {
          userName,
          workspaceTitle,
          startDate: startTime.toLocaleString('uk-UA'),
          endDate: endTime.toLocaleString('uk-UA'),
          formattedPrice,
        },
        attachments: [
          {
            filename: 'booking.ics',
            content: Buffer.from(calendar.toString(), 'utf-8'),
            contentType: 'text/calendar; charset=utf-8',
            encoding: 'base64',
          },
        ],
      });
    } catch (err) {
      this.logger.error(`Error: ${data.email}`, err);
      throw err;
    }
  }
}
