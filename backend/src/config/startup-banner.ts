// BUG-REG-049: render a startup banner showing critical config state without echoing secret values.
// The DATABASE_URL is parsed and only host/db/user are surfaced; password length is shown as a
// `[set, N chars]` indicator so operators can confirm a secret is populated without leaking it.

import type { EnvironmentVariables } from './environment.validation';

interface DatabaseSummary {
  host: string;
  database: string;
  user: string;
  passwordIndicator: string;
}

function summarizeDatabaseUrl(databaseUrl: string): DatabaseSummary {
  try {
    const url = new URL(databaseUrl);
    return {
      host: url.host || '(unknown)',
      database: url.pathname.replace(/^\//, '') || '(unknown)',
      user: url.username || '(unknown)',
      passwordIndicator: url.password ? `[set, ${url.password.length} chars]` : '[empty]',
    };
  } catch {
    return { host: '(unparseable)', database: '(unparseable)', user: '(unparseable)', passwordIndicator: '[unparseable]' };
  }
}

export function buildStartupBanner(env: EnvironmentVariables): string[] {
  const db = summarizeDatabaseUrl(env.DATABASE_URL);

  return [
    '────────────────────────────────────────────────────────────',
    '  scale-admin backend — startup config',
    '────────────────────────────────────────────────────────────',
    `  NODE_ENV          : ${env.NODE_ENV}`,
    `  PORT             : ${env.PORT}`,
    `  FRONTEND_ORIGIN  : ${env.FRONTEND_ORIGIN}`,
    `  DATABASE host    : ${db.host}`,
    `  DATABASE name    : ${db.database}`,
    `  DATABASE user    : ${db.user}`,
    `  DATABASE password: ${db.passwordIndicator}`,
    `  SESSION cookie   : ${env.SESSION_COOKIE_NAME} (idle ${env.SESSION_IDLE_TIMEOUT_MINUTES}m / absolute ${env.SESSION_ABSOLUTE_TIMEOUT_DAYS}d)`,
    `  CSRF header      : ${env.CSRF_HEADER_NAME}`,
    `  Auth rate limit  : ${env.AUTH_LOGIN_RATE_LIMIT_MAX} logins / ${env.AUTH_RATE_LIMIT_WINDOW_SECONDS}s, lock after ${env.AUTH_FAILED_LOGIN_MAX_ATTEMPTS} failures for ${env.AUTH_FAILED_LOGIN_LOCK_MINUTES}m`,
    '────────────────────────────────────────────────────────────',
  ];
}
