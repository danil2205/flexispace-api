import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import mailConfig from 'src/config/mail.config';
import { MailProcessor } from './mail.processor';
import { BullModule } from '@nestjs/bullmq';
import { MailerModule } from '@nestjs-modules/mailer';
import { MailtrapTransport } from 'mailtrap';
import { join } from 'path';
import { EjsAdapter } from '@nestjs-modules/mailer/adapters/ejs.adapter';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        transport: MailtrapTransport({
          token: configService.getOrThrow<string>('mail.token'),
        }),
        // transport: {
        //   host: configService.getOrThrow<string>('mail.host'),
        //   port: configService.getOrThrow<number>('mail.port'),
        //   auth: {
        //     user: configService.getOrThrow<string>('mail.auth.user'),
        //     pass: configService.getOrThrow<string>('mail.auth.pass'),
        //   },
        // },
        defaults: {
          from: `"Flexispace" <${configService.getOrThrow<string>('mail.sender')}>`,
        },
        template: {
          dir: join(__dirname, 'templates'),
          adapter: new EjsAdapter(),
          options: {
            strict: false,
          },
        },
      }),
    }),
    ConfigModule.forFeature(mailConfig),
    BullModule.registerQueue({ name: 'emails' }),
  ],
  providers: [MailProcessor],
  exports: [],
})
export class MailModule {}
