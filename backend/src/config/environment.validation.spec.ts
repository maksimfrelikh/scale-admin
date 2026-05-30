import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { INSECURE_DEFAULT_DB_PASSWORD, validateEnvironment } from './environment.validation.ts';

const validBase = (): Record<string, unknown> => ({
  NODE_ENV: 'development',
  PORT: '3000',
  DATABASE_URL: 'postgresql://scale_admin:strongRandomP4ss@postgres:5432/scale_admin',
  FRONTEND_ORIGIN: 'http://localhost:5173',
});

const resendBase = (): Record<string, unknown> => ({
  ...validBase(),
  EMAIL_PROVIDER: 'resend',
  EMAIL_FROM: 'Администратор весов <invites@weighly.frelikh.dev>',
  EMAIL_REPLY_TO: 'frelikhmax@gmail.com',
  RESEND_API_KEY: 're_test_placeholder',
});

describe('validateEnvironment — required vars (BUG-REG-049)', () => {
  it('throws when NODE_ENV is missing', () => {
    const config = validBase();
    delete config.NODE_ENV;
    assert.throws(() => validateEnvironment(config), /NODE_ENV is required/);
  });

  it('throws when NODE_ENV is empty string', () => {
    assert.throws(() => validateEnvironment({ ...validBase(), NODE_ENV: '' }), /NODE_ENV is required/);
  });

  it('throws when NODE_ENV is whitespace only', () => {
    assert.throws(() => validateEnvironment({ ...validBase(), NODE_ENV: '   ' }), /NODE_ENV is required/);
  });

  it('throws when NODE_ENV is not in the allow-list', () => {
    assert.throws(() => validateEnvironment({ ...validBase(), NODE_ENV: 'staging' }), /NODE_ENV must be one of/);
  });

  it('throws when DATABASE_URL is missing', () => {
    const config = validBase();
    delete config.DATABASE_URL;
    assert.throws(() => validateEnvironment(config), /DATABASE_URL is required/);
  });

  it('throws when DATABASE_URL uses the wrong protocol', () => {
    assert.throws(
      () => validateEnvironment({ ...validBase(), DATABASE_URL: 'mysql://u:p@h:3306/d' }),
      /DATABASE_URL must use the postgres:\/\/ or postgresql:\/\/ protocol/,
    );
  });

  it('throws when DATABASE_URL is unparseable', () => {
    assert.throws(
      () => validateEnvironment({ ...validBase(), DATABASE_URL: 'not a url at all' }),
      /DATABASE_URL must be a valid PostgreSQL connection URL/,
    );
  });

  it('throws when FRONTEND_ORIGIN is missing', () => {
    const config = validBase();
    delete config.FRONTEND_ORIGIN;
    assert.throws(() => validateEnvironment(config), /FRONTEND_ORIGIN is required/);
  });

  it('throws when FRONTEND_ORIGIN uses an unsupported protocol', () => {
    assert.throws(
      () => validateEnvironment({ ...validBase(), FRONTEND_ORIGIN: 'ftp://example.com' }),
      /FRONTEND_ORIGIN must use the http:\/\/ or https:\/\/ protocol/,
    );
  });

  it('throws when FRONTEND_ORIGIN is not an origin-only value', () => {
    assert.throws(
      () => validateEnvironment({ ...validBase(), FRONTEND_ORIGIN: 'https://example.com/admin?next=1' }),
      /FRONTEND_ORIGIN must be an origin without path, query, hash, credentials, or trailing slash/,
    );
  });

  it('throws when production FRONTEND_ORIGIN does not use HTTPS', () => {
    assert.throws(
      () => validateEnvironment({ ...validBase(), NODE_ENV: 'production', FRONTEND_ORIGIN: 'http://example.com' }),
      /FRONTEND_ORIGIN must use https:\/\/ when NODE_ENV=production/,
    );
  });

  it('throws when EMAIL_PROVIDER is not supported', () => {
    assert.throws(
      () => validateEnvironment({ ...validBase(), EMAIL_PROVIDER: 'sendgrid' }),
      /EMAIL_PROVIDER must be one of: disabled, resend/,
    );
  });

  it('throws when RESEND_API_KEY is missing for the resend provider', () => {
    const config = resendBase();
    delete config.RESEND_API_KEY;
    assert.throws(() => validateEnvironment(config), /RESEND_API_KEY is required/);
  });

  it('throws when EMAIL_FROM is missing for the resend provider', () => {
    const config = resendBase();
    delete config.EMAIL_FROM;
    assert.throws(() => validateEnvironment(config), /EMAIL_FROM is required/);
  });

  it('throws when EMAIL_REPLY_TO is missing for the resend provider', () => {
    const config = resendBase();
    delete config.EMAIL_REPLY_TO;
    assert.throws(() => validateEnvironment(config), /EMAIL_REPLY_TO is required/);
  });

  it('throws when EMAIL_FROM does not contain an email address', () => {
    assert.throws(
      () => validateEnvironment({ ...resendBase(), EMAIL_FROM: 'Администратор весов' }),
      /EMAIL_FROM must contain a valid email address/,
    );
  });

  it('throws when EMAIL_REPLY_TO does not contain an email address', () => {
    assert.throws(
      () => validateEnvironment({ ...resendBase(), EMAIL_REPLY_TO: 'not-an-address' }),
      /EMAIL_REPLY_TO must contain a valid email address/,
    );
  });

  it('throws when PORT is out of range', () => {
    assert.throws(
      () => validateEnvironment({ ...validBase(), PORT: '70000' }),
      /PORT is required and must be an integer between 1 and 65535/,
    );
  });

  it('throws when PORT is not numeric', () => {
    assert.throws(
      () => validateEnvironment({ ...validBase(), PORT: 'abc' }),
      /PORT is required and must be an integer between 1 and 65535/,
    );
  });

  it('aggregates multiple errors into one thrown message', () => {
    let caught: Error | undefined;
    try {
      validateEnvironment({});
    } catch (err) {
      caught = err as Error;
    }
    assert.ok(caught, 'expected validateEnvironment({}) to throw');
    assert.match(caught.message, /NODE_ENV is required/);
    assert.match(caught.message, /DATABASE_URL is required/);
    assert.match(caught.message, /FRONTEND_ORIGIN is required/);
    assert.match(caught.message, /PORT is required/);
  });
});

describe('validateEnvironment — insecure default password (BUG-REG-049)', () => {
  it('refuses to start in production when DATABASE_URL still uses the historical insecure default', () => {
    const config = {
      ...validBase(),
      NODE_ENV: 'production',
      DATABASE_URL: `postgresql://scale_admin:${INSECURE_DEFAULT_DB_PASSWORD}@postgres:5432/scale_admin`,
    };
    assert.throws(() => validateEnvironment(config), /historical insecure default password/);
  });

  it('allows the historical default password in development (fresh-checkout dev convenience)', () => {
    const config = {
      ...validBase(),
      NODE_ENV: 'development',
      DATABASE_URL: `postgresql://scale_admin:${INSECURE_DEFAULT_DB_PASSWORD}@localhost:5432/scale_admin`,
    };
    const result = validateEnvironment(config);
    assert.equal(result.NODE_ENV, 'development');
  });

  it('allows the historical default password in test (CI fixture convenience)', () => {
    const config = {
      ...validBase(),
      NODE_ENV: 'test',
      DATABASE_URL: `postgresql://scale_admin:${INSECURE_DEFAULT_DB_PASSWORD}@localhost:5432/scale_admin`,
    };
    const result = validateEnvironment(config);
    assert.equal(result.NODE_ENV, 'test');
  });

  it('accepts production when the DB password is a strong random secret', () => {
    const config = {
      ...validBase(),
      NODE_ENV: 'production',
      FRONTEND_ORIGIN: 'https://weighly.frelikh.dev',
      DATABASE_URL: 'postgresql://scale_admin:owAfjDYLszWKVyZUYjnr6ZH9yD4MJds@postgres:5432/scale_admin',
    };
    const result = validateEnvironment(config);
    assert.equal(result.NODE_ENV, 'production');
    assert.equal(result.DATABASE_URL, 'postgresql://scale_admin:owAfjDYLszWKVyZUYjnr6ZH9yD4MJds@postgres:5432/scale_admin');
  });
});

describe('validateEnvironment — happy path and defaults', () => {
  it('returns trimmed, typed values with sensible defaults for optional vars', () => {
    const result = validateEnvironment(validBase());

    assert.equal(result.NODE_ENV, 'development');
    assert.equal(result.PORT, 3000);
    assert.equal(result.FRONTEND_ORIGIN, 'http://localhost:5173');
    assert.equal(result.EMAIL_PROVIDER, 'disabled');
    assert.equal(result.EMAIL_FROM, '');
    assert.equal(result.EMAIL_REPLY_TO, '');
    assert.equal(result.RESEND_API_KEY, '');
    assert.equal(result.SESSION_COOKIE_NAME, 'scale_admin_session');
    assert.equal(result.SESSION_IDLE_TIMEOUT_MINUTES, 30);
    assert.equal(result.SESSION_ABSOLUTE_TIMEOUT_DAYS, 14);
    assert.equal(result.CSRF_COOKIE_NAME, 'scale_admin_csrf');
    assert.equal(result.CSRF_HEADER_NAME, 'x-csrf-token');
    assert.equal(result.AUTH_RATE_LIMIT_WINDOW_SECONDS, 60);
    assert.equal(result.AUTH_LOGIN_RATE_LIMIT_MAX, 5);
    assert.equal(result.AUTH_ACTION_RATE_LIMIT_MAX, 10);
    assert.equal(result.AUTH_FAILED_LOGIN_MAX_ATTEMPTS, 5);
    assert.equal(result.AUTH_FAILED_LOGIN_LOCK_MINUTES, 15);
    assert.equal(result.PASSWORD_RESET_TOKEN_TTL_MINUTES, 60);
  });

  it('accepts resend provider when all required email vars are populated', () => {
    const result = validateEnvironment(resendBase());

    assert.equal(result.EMAIL_PROVIDER, 'resend');
    assert.equal(result.EMAIL_FROM, 'Администратор весов <invites@weighly.frelikh.dev>');
    assert.equal(result.EMAIL_REPLY_TO, 'frelikhmax@gmail.com');
    assert.equal(result.RESEND_API_KEY, 're_test_placeholder');
  });

  it('lower-cases CSRF_HEADER_NAME when explicitly set with mixed case', () => {
    const result = validateEnvironment({ ...validBase(), CSRF_HEADER_NAME: 'X-Csrf-Token' });
    assert.equal(result.CSRF_HEADER_NAME, 'x-csrf-token');
  });

  it('rejects non-positive integers in optional numeric vars', () => {
    assert.throws(
      () => validateEnvironment({ ...validBase(), SESSION_IDLE_TIMEOUT_MINUTES: '0' }),
      /SESSION_IDLE_TIMEOUT_MINUTES must be a positive integer/,
    );
  });
});
