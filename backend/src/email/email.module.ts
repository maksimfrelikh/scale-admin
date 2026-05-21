import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '../config/app.config';
import { EMAIL_PROVIDER } from './email.provider';
import { EmailService } from './email.service';
import { DisabledEmailProvider, ResendEmailProvider } from './resend-email.provider';

@Module({
  providers: [
    EmailService,
    {
      provide: EMAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const appConfig = configService.getOrThrow<AppConfiguration>('app');
        return appConfig.emailProvider === 'resend'
          ? new ResendEmailProvider(appConfig)
          : new DisabledEmailProvider(appConfig);
      },
    },
  ],
  exports: [EmailService],
})
export class EmailModule {}
