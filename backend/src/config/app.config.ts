import { registerAs } from '@nestjs/config';

export type EmailProviderName = 'disabled' | 'resend';

export interface AppConfiguration {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  frontendOrigin: string;
  emailProvider: EmailProviderName;
  emailFrom: string;
  emailReplyTo: string;
  resendApiKey: string;
  sessionCookieName: string;
  sessionIdleTimeoutMinutes: number;
  sessionAbsoluteTimeoutDays: number;
  csrfCookieName: string;
  csrfHeaderName: string;
  authRateLimitWindowSeconds: number;
  authLoginRateLimitMax: number;
  authActionRateLimitMax: number;
  authFailedLoginMaxAttempts: number;
  authFailedLoginLockMinutes: number;
  passwordResetTokenTtlMinutes: number;
}

export default registerAs(
  'app',
  (): AppConfiguration => ({
    nodeEnv: process.env.NODE_ENV as string,
    port: Number(process.env.PORT),
    databaseUrl: process.env.DATABASE_URL as string,
    frontendOrigin: process.env.FRONTEND_ORIGIN as string,
    emailProvider: (process.env.EMAIL_PROVIDER || 'disabled') as EmailProviderName,
    emailFrom: process.env.EMAIL_FROM || '',
    emailReplyTo: process.env.EMAIL_REPLY_TO || '',
    resendApiKey: process.env.RESEND_API_KEY || '',
    sessionCookieName: process.env.SESSION_COOKIE_NAME || 'scale_admin_session',
    sessionIdleTimeoutMinutes: Number(process.env.SESSION_IDLE_TIMEOUT_MINUTES || 30),
    sessionAbsoluteTimeoutDays: Number(process.env.SESSION_ABSOLUTE_TIMEOUT_DAYS || 14),
    csrfCookieName: process.env.CSRF_COOKIE_NAME || 'scale_admin_csrf',
    csrfHeaderName: (process.env.CSRF_HEADER_NAME || 'x-csrf-token').toLowerCase(),
    authRateLimitWindowSeconds: Number(process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS || 60),
    authLoginRateLimitMax: Number(process.env.AUTH_LOGIN_RATE_LIMIT_MAX || 5),
    authActionRateLimitMax: Number(process.env.AUTH_ACTION_RATE_LIMIT_MAX || 10),
    authFailedLoginMaxAttempts: Number(process.env.AUTH_FAILED_LOGIN_MAX_ATTEMPTS || 5),
    authFailedLoginLockMinutes: Number(process.env.AUTH_FAILED_LOGIN_LOCK_MINUTES || 15),
    passwordResetTokenTtlMinutes: Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 60),
  }),
);
