import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import mailConfig from 'src/config/mail.config';
import { MailProcessor } from './mail.processor';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    ConfigModule.forFeature(mailConfig),
    BullModule.registerQueue({ name: 'emails' }),
  ],
  providers: [MailProcessor],
  exports: [],
})
export class MailModule {}
