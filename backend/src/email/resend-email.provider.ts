import { Resend } from 'resend';
import type { AppConfiguration } from '../config/app.config';
import type { EmailProvider, SendEmailInput } from './email.provider';

export class ResendEmailProvider implements EmailProvider {
  private readonly resend: Resend;

  constructor(private readonly appConfig: AppConfiguration) {
    this.resend = new Resend(appConfig.resendApiKey);
  }

  async sendEmail(input: SendEmailInput): Promise<void> {
    const response = await this.resend.emails.send({
      from: this.appConfig.emailFrom,
      to: input.to,
      replyTo: this.appConfig.emailReplyTo,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }
  }
}

export class DisabledEmailProvider implements EmailProvider {
  constructor(private readonly appConfig: AppConfiguration) {}

  async sendEmail(): Promise<void> {
    if (this.appConfig.nodeEnv === 'production') {
      throw new Error('Email provider is disabled');
    }
  }
}
