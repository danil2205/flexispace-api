import { Test } from '@nestjs/testing';
import { MailProcessor } from './mail.processor';
import { MailerService, ISendMailOptions } from '@nestjs-modules/mailer';
import { Job } from 'bullmq';

describe(' Test suite', () => {
  let processor: MailProcessor;
  let mockMailerService: Partial<MailerService>;

  beforeEach(async () => {
    mockMailerService = {
      sendMail: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        MailProcessor,
        { provide: MailerService, useValue: mockMailerService },
      ],
    }).compile();

    processor = module.get<MailProcessor>(MailProcessor);
    mockMailerService = module.get(MailerService);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
    expect(mockMailerService).toBeDefined();
  });

  describe('process', () => {
    it('should ignore an unknown job type', async () => {
      const job = { name: 'unknown-job', data: {}, id: 1 } as unknown as Job;
      await processor.process(job);
      expect(mockMailerService.sendMail).not.toHaveBeenCalled();
    });

    it('should throw error if validation failed', async () => {
      const job = {
        name: 'send-receipt',
        data: { email: 'not-an-email' },
        id: 1,
      } as unknown as Job;
      await expect(processor.process(job)).rejects.toThrow('Validation failed');
      expect(mockMailerService.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('sendReceiptEmail', () => {
    it('should successfully gather data, generate ICS and send receipt email', async () => {
      const mockData = {
        email: 'test@test.com',
        username: 'test',
        workspaceTitle: 'Test Workspace',
        startTime: new Date('2026-12-30T13:37:00Z'),
        endTime: new Date('2026-12-30T15:20:00Z'),
        totalPrice: 1500.5,
        currency: 'UAH',
      };

      const job = {
        name: 'send-receipt',
        data: mockData,
        id: 1,
      } as unknown as Job;

      await processor.process(job);

      expect(mockMailerService.sendMail).toHaveBeenCalledTimes(1);
      const sendMailArgs = (
        mockMailerService.sendMail as jest.Mock<any, [ISendMailOptions]>
      ).mock.calls[0][0];

      expect(sendMailArgs.to).toBe(mockData.email);
      expect(sendMailArgs.subject).toBe(
        `Booking confirmed: ${mockData.workspaceTitle}`,
      );
      expect(sendMailArgs.template).toBe('./receipt');
      expect(sendMailArgs.context?.username).toBe(mockData.username);
      expect(sendMailArgs.attachments).toHaveLength(1);
      expect(sendMailArgs.attachments![0].filename).toBe('booking.ics');
      expect(sendMailArgs.attachments![0].contentType).toBe(
        'text/calendar; charset=utf-8',
      );
    });
  });

  describe('sendWaitlistNotification', () => {
    it('should successfully send waitlist notification email', async () => {
      const mockData = {
        email: 'test@test.com',
        username: 'test',
        workspaceTitle: 'Test Workspace',
        startTime: new Date('2026-12-30T13:37:00Z'),
        endTime: new Date('2026-12-30T15:20:00Z'),
      };

      const job = {
        name: 'send-waitlist-notification',
        data: mockData,
        id: 1,
      } as unknown as Job;

      await processor.process(job);

      expect(mockMailerService.sendMail).toHaveBeenCalledTimes(1);
      const sendMailArgs = (
        mockMailerService.sendMail as jest.Mock<any, [ISendMailOptions]>
      ).mock.calls[0][0];

      expect(sendMailArgs.to).toBe(mockData.email);
      expect(sendMailArgs.subject).toBe(
        `Workspace Available: ${mockData.workspaceTitle}`,
      );
      expect(sendMailArgs.template).toBe('./waitlist-notification');
      expect(sendMailArgs.context?.username).toBe(mockData.username);
    });
  });
});
