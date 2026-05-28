import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '../config/app.config';
import { EMAIL_PROVIDER, EmailProvider } from './email.provider';

export type EmailLocale = 'ru' | 'en';

export type InviteEmailInput = {
  to: string;
  token: string;
  expiresAt: Date;
  locale?: EmailLocale;
};

export type PasswordResetEmailInput = {
  to: string;
  token: string;
  expiresAt: Date;
  locale?: EmailLocale;
};

export class EmailDeliveryError extends Error {
  constructor() {
    super('Не удалось отправить письмо');
    this.name = 'EmailDeliveryError';
  }
}

@Injectable()
export class EmailService {
  private readonly appConfig: AppConfiguration;

  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    configService: ConfigService,
  ) {
    this.appConfig = configService.getOrThrow<AppConfiguration>('app');
  }

  async sendInviteEmail(input: InviteEmailInput): Promise<void> {
    const inviteUrl = this.buildFrontendUrl('/accept-invite', input.token);
    const expiresAtIso = input.expiresAt.toISOString();
    const message =
      input.locale === 'en'
        ? {
            subject: 'Invitation to Scale Admin',
            text: [
              'You have been invited to Scale Admin.',
              '',
              `Accept invitation: ${inviteUrl}`,
              `The link is valid until ${expiresAtIso}.`,
              '',
              'If you were not expecting this invitation, just ignore this email.',
            ].join('\n'),
            html: [
              '<p>You have been invited to Scale Admin.</p>',
              `<p><a href="${escapeHtml(inviteUrl)}">Accept invitation</a></p>`,
              `<p>The link is valid until ${escapeHtml(expiresAtIso)}.</p>`,
              '<p>If you were not expecting this invitation, just ignore this email.</p>',
            ].join(''),
          }
        : {
            subject: 'Приглашение в Администратор весов',
            text: [
              'Вас пригласили в Администратор весов.',
              '',
              `Принять приглашение: ${inviteUrl}`,
              `Ссылка действует до ${expiresAtIso}.`,
              '',
              'Если вы не ожидали это приглашение, просто проигнорируйте письмо.',
            ].join('\n'),
            html: [
              '<p>Вас пригласили в Администратор весов.</p>',
              `<p><a href="${escapeHtml(inviteUrl)}">Принять приглашение</a></p>`,
              `<p>Ссылка действует до ${escapeHtml(expiresAtIso)}.</p>`,
              '<p>Если вы не ожидали это приглашение, просто проигнорируйте письмо.</p>',
            ].join(''),
          };

    await this.send({
      to: input.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }

  async sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
    const resetUrl = this.buildFrontendUrl('/reset-password', input.token);
    const expiresAtIso = input.expiresAt.toISOString();
    const message =
      input.locale === 'en'
        ? {
            subject: 'Password reset for Scale Admin',
            text: [
              'A password reset has been requested for your account in Scale Admin.',
              '',
              `Reset password: ${resetUrl}`,
              `The link is valid until ${expiresAtIso}.`,
              '',
              'If you did not request a password reset, just ignore this email.',
            ].join('\n'),
            html: [
              '<p>A password reset has been requested for your account in Scale Admin.</p>',
              `<p><a href="${escapeHtml(resetUrl)}">Reset password</a></p>`,
              `<p>The link is valid until ${escapeHtml(expiresAtIso)}.</p>`,
              '<p>If you did not request a password reset, just ignore this email.</p>',
            ].join(''),
          }
        : {
            subject: 'Сброс пароля в Администратор весов',
            text: [
              'Для вашей учётной записи в Администратор весов запрошен сброс пароля.',
              '',
              `Сбросить пароль: ${resetUrl}`,
              `Ссылка действует до ${expiresAtIso}.`,
              '',
              'Если вы не запрашивали сброс пароля, просто проигнорируйте письмо.',
            ].join('\n'),
            html: [
              '<p>Для вашей учётной записи в Администратор весов запрошен сброс пароля.</p>',
              `<p><a href="${escapeHtml(resetUrl)}">Сбросить пароль</a></p>`,
              `<p>Ссылка действует до ${escapeHtml(expiresAtIso)}.</p>`,
              '<p>Если вы не запрашивали сброс пароля, просто проигнорируйте письмо.</p>',
            ].join(''),
          };

    await this.send({
      to: input.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }

  private buildFrontendUrl(pathname: string, token: string): string {
    const url = new URL(pathname, this.appConfig.frontendOrigin);
    url.searchParams.set('token', token);
    return url.toString();
  }

  private async send(input: Parameters<EmailProvider['sendEmail']>[0]): Promise<void> {
    try {
      await this.provider.sendEmail(input);
    } catch {
      throw new EmailDeliveryError();
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
