import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Job } from 'bullmq';
import { plainToInstance } from 'class-transformer';
import { Transporter, createTransport } from 'nodemailer';
import mailConfig from 'src/config/mail.config';
import { SendReceiptDto } from './dtos/send-receipt.dto';
import { validateOrReject } from 'class-validator';
import ical, { ICalAlarmType } from 'ical-generator';
import { MailtrapTransport } from 'mailtrap';

@Processor('emails')
export class MailProcessor extends WorkerHost {
  private transporter: Transporter;
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    @Inject(mailConfig.KEY)
    private readonly mailConfiguration: ConfigType<typeof mailConfig>,
  ) {
    super();
    this.transporter = createTransport(
      MailtrapTransport({ token: this.mailConfiguration.token! }),
    );
    // this.transporter = createTransport({
    // host: this.mailConfiguration.host,
    // port: this.mailConfiguration.port,
    // auth: {
    //   user: this.mailConfiguration.auth.user,
    //   pass: this.mailConfiguration.auth.pass,
    //   // },
    // });
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
    const calendar = ical({ name: 'Flexispace Bookings' });
    calendar.createEvent({
      description: `Your booking has been confirmed`,
      start: data.startTime,
      end: data.endTime,
      summary: `Booking: ${data.workspaceTitle}`,
      alarms: [{ type: ICalAlarmType.display, trigger: 60 * 15 }],
    });

    try {
      await this.transporter.sendMail({
        from: `"Flexispace" <${this.mailConfiguration.sender}>`,
        to: data.email,
        subject: `Booking confirmed: ${data.workspaceTitle}`,
        html: `
          <h2>Hi, ${data.userName}!</h2>
          <p>Thank you for your payment. Your booking is now confirmed.</p>
          <ul>
            <li><b>Workspace:</b> ${data.workspaceTitle}</li>
            <li><b>Time:</b> from ${data.startTime.toLocaleString('uk-UA')} to ${data.endTime.toLocaleString('uk-UA')}</li>
            <li><b>Amount:</b> ${data.totalPrice / 100} PLN</li>
          </ul>
          <p>Event file is attached to this email.</p>
        `,
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
