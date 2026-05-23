export type NodeEnvironment = 'development' | 'test' | 'production';
export type EmailProviderName = 'disabled' | 'resend';

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  DATABASE_URL: string;
  FRONTEND_ORIGIN: string;
  EMAIL_PROVIDER: EmailProviderName;
  EMAIL_FROM: string;
  EMAIL_REPLY_TO: string;
  RESEND_API_KEY: string;
  SESSION_COOKIE_NAME: string;
  SESSION_IDLE_TIMEOUT_MINUTES: number;
  SESSION_ABSOLUTE_TIMEOUT_DAYS: number;
  CSRF_COOKIE_NAME: string;
  CSRF_HEADER_NAME: string;
  AUTH_RATE_LIMIT_WINDOW_SECONDS: number;
  AUTH_LOGIN_RATE_LIMIT_MAX: number;
  AUTH_ACTION_RATE_LIMIT_MAX: number;
  AUTH_FAILED_LOGIN_MAX_ATTEMPTS: number;
  AUTH_FAILED_LOGIN_LOCK_MINUTES: number;
  PASSWORD_RESET_TOKEN_TTL_MINUTES: number;
}

const allowedNodeEnvironments: NodeEnvironment[] = ['development', 'test', 'production'];
const allowedEmailProviders: EmailProviderName[] = ['disabled', 'resend'];

// Historical compose default. Live in production with this value in the URL means
// the operator never populated .env and is running on the public-known credential.
// BUG-REG-049: detect at boot and refuse to start in production.
export const INSECURE_DEFAULT_DB_PASSWORD = 'scale_admin_password';

function requireString(config: Record<string, unknown>, key: keyof EnvironmentVariables, errors: string[]): string {
  const value = config[key];

  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${key} is required and must be a non-empty string`);
    return '';
  }

  return value.trim();
}

function extractEmailAddress(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/<([^<>]+)>$/);
  return (match?.[1] ?? trimmed).trim();
}

function validateEmailAddress(value: string, key: keyof EnvironmentVariables, errors: string[]) {
  const email = extractEmailAddress(value);
  if (!email || /\s/.test(email) || !email.includes('@') || email.startsWith('@') || email.endsWith('@')) {
    errors.push(`${key} must contain a valid email address`);
  }
}

function optionalString(config: Record<string, unknown>, key: keyof EnvironmentVariables, fallback: string): string {
  const value = config[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function optionalPositiveInteger(
  config: Record<string, unknown>,
  key: keyof EnvironmentVariables,
  fallback: number,
  errors: string[],
): number {
  const rawValue = config[key];
  const value = rawValue === undefined || rawValue === null || rawValue === '' ? fallback : Number(rawValue);

  if (!Number.isInteger(value) || value < 1) {
    errors.push(`${key} must be a positive integer`);
    return fallback;
  }

  return value;
}

function requirePort(config: Record<string, unknown>, errors: string[]): number {
  const rawValue = config.PORT;
  const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);

  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    errors.push('PORT is required and must be an integer between 1 and 65535');
    return 0;
  }

  return value;
}

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const errors: string[] = [];

  const nodeEnv = requireString(config, 'NODE_ENV', errors) as NodeEnvironment;
  const databaseUrl = requireString(config, 'DATABASE_URL', errors);
  const frontendOrigin = requireString(config, 'FRONTEND_ORIGIN', errors);
  const emailProvider = optionalString(config, 'EMAIL_PROVIDER', 'disabled') as EmailProviderName;
  let emailFrom = optionalString(config, 'EMAIL_FROM', '');
  let emailReplyTo = optionalString(config, 'EMAIL_REPLY_TO', '');
  let resendApiKey = optionalString(config, 'RESEND_API_KEY', '');
  const port = requirePort(config, errors);
  const sessionCookieName = optionalString(config, 'SESSION_COOKIE_NAME', 'scale_admin_session');
  const sessionIdleTimeoutMinutes = optionalPositiveInteger(config, 'SESSION_IDLE_TIMEOUT_MINUTES', 30, errors);
  const sessionAbsoluteTimeoutDays = optionalPositiveInteger(config, 'SESSION_ABSOLUTE_TIMEOUT_DAYS', 14, errors);
  const csrfCookieName = optionalString(config, 'CSRF_COOKIE_NAME', 'scale_admin_csrf');
  const csrfHeaderName = optionalString(config, 'CSRF_HEADER_NAME', 'x-csrf-token').toLowerCase();
  const authRateLimitWindowSeconds = optionalPositiveInteger(config, 'AUTH_RATE_LIMIT_WINDOW_SECONDS', 60, errors);
  const authLoginRateLimitMax = optionalPositiveInteger(config, 'AUTH_LOGIN_RATE_LIMIT_MAX', 5, errors);
  const authActionRateLimitMax = optionalPositiveInteger(config, 'AUTH_ACTION_RATE_LIMIT_MAX', 10, errors);
  const authFailedLoginMaxAttempts = optionalPositiveInteger(config, 'AUTH_FAILED_LOGIN_MAX_ATTEMPTS', 5, errors);
  const authFailedLoginLockMinutes = optionalPositiveInteger(config, 'AUTH_FAILED_LOGIN_LOCK_MINUTES', 15, errors);
  const passwordResetTokenTtlMinutes = optionalPositiveInteger(config, 'PASSWORD_RESET_TOKEN_TTL_MINUTES', 60, errors);

  if (nodeEnv && !allowedNodeEnvironments.includes(nodeEnv)) {
    errors.push(`NODE_ENV must be one of: ${allowedNodeEnvironments.join(', ')}`);
  }

  if (emailProvider && !allowedEmailProviders.includes(emailProvider)) {
    errors.push(`EMAIL_PROVIDER must be one of: ${allowedEmailProviders.join(', ')}`);
  }

  if (emailProvider === 'resend') {
    emailFrom = requireString(config, 'EMAIL_FROM', errors);
    emailReplyTo = requireString(config, 'EMAIL_REPLY_TO', errors);
    resendApiKey = requireString(config, 'RESEND_API_KEY', errors);
  }

  if (emailFrom) {
    validateEmailAddress(emailFrom, 'EMAIL_FROM', errors);
  }

  if (emailReplyTo) {
    validateEmailAddress(emailReplyTo, 'EMAIL_REPLY_TO', errors);
  }

  if (databaseUrl) {
    try {
      const url = new URL(databaseUrl);
      if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
        errors.push('DATABASE_URL must use the postgres:// or postgresql:// protocol');
      }
      if (nodeEnv === 'production' && url.password === INSECURE_DEFAULT_DB_PASSWORD) {
        errors.push(
          `DATABASE_URL is using the historical insecure default password '${INSECURE_DEFAULT_DB_PASSWORD}'. ` +
            `Populate POSTGRES_PASSWORD/DATABASE_URL in .env with a strong random secret before starting in production (see .env.example).`,
        );
      }
    } catch {
      errors.push('DATABASE_URL must be a valid PostgreSQL connection URL');
    }
  }

  if (frontendOrigin) {
    try {
      const url = new URL(frontendOrigin);
      if (!['http:', 'https:'].includes(url.protocol)) {
        errors.push('FRONTEND_ORIGIN must use the http:// or https:// protocol');
      }
      if (url.origin !== frontendOrigin) {
        errors.push('FRONTEND_ORIGIN must be an origin without path, query, hash, credentials, or trailing slash');
      }
      if (nodeEnv === 'production' && url.protocol !== 'https:') {
        errors.push('FRONTEND_ORIGIN must use https:// when NODE_ENV=production');
      }
    } catch {
      errors.push('FRONTEND_ORIGIN must be a valid URL origin');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n - ${errors.join('\n - ')}`);
  }

  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    DATABASE_URL: databaseUrl,
    FRONTEND_ORIGIN: frontendOrigin,
    EMAIL_PROVIDER: emailProvider,
    EMAIL_FROM: emailFrom,
    EMAIL_REPLY_TO: emailReplyTo,
    RESEND_API_KEY: resendApiKey,
    SESSION_COOKIE_NAME: sessionCookieName,
    SESSION_IDLE_TIMEOUT_MINUTES: sessionIdleTimeoutMinutes,
    SESSION_ABSOLUTE_TIMEOUT_DAYS: sessionAbsoluteTimeoutDays,
    CSRF_COOKIE_NAME: csrfCookieName,
    CSRF_HEADER_NAME: csrfHeaderName,
    AUTH_RATE_LIMIT_WINDOW_SECONDS: authRateLimitWindowSeconds,
    AUTH_LOGIN_RATE_LIMIT_MAX: authLoginRateLimitMax,
    AUTH_ACTION_RATE_LIMIT_MAX: authActionRateLimitMax,
    AUTH_FAILED_LOGIN_MAX_ATTEMPTS: authFailedLoginMaxAttempts,
    AUTH_FAILED_LOGIN_LOCK_MINUTES: authFailedLoginLockMinutes,
    PASSWORD_RESET_TOKEN_TTL_MINUTES: passwordResetTokenTtlMinutes,
  };
}
