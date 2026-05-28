import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { UnauthorizedException } from '@nestjs/common';

// AuthService uses @Injectable() + parameter properties that node's
// TypeScript strip-only test runner cannot parse, so we import the
// compiled class from dist/. Same approach as scales.service.spec.ts.
import { AuthService } from '../../dist/auth/auth.service.js';

type TCall = { key: string; options?: { lang?: string } };

function makeI18n(calls: TCall[]) {
  return {
    t(key: string, options?: { lang?: string }) {
      calls.push({ key, options });
      if (options?.lang === 'en') {
        return `EN:${key}`;
      }
      if (options?.lang === 'ru') {
        return `RU:${key}`;
      }
      return `CTX:${key}`;
    },
  };
}

const FAKE_APP_CONFIG = {
  sessionCookieName: 'sid',
  sessionIdleTimeoutMinutes: 30,
  sessionAbsoluteTimeoutDays: 30,
  csrfCookieName: 'csrf',
  csrfHeaderName: 'x-csrf',
  nodeEnv: 'test',
  authFailedLoginMaxAttempts: 5,
  authFailedLoginLockMinutes: 15,
  authRateLimitWindowSeconds: 60,
  authLoginRateLimitMax: 10,
  authActionRateLimitMax: 30,
  passwordResetTokenTtlMinutes: 60,
};

function buildService(i18n: ReturnType<typeof makeI18n>): AuthService {
  const configService = {
    getOrThrow: (_: string) => FAKE_APP_CONFIG,
  };
  return new AuthService(
    /* prisma */ {} as never,
    /* auditLogs */ {} as never,
    configService as never,
    /* emails */ {} as never,
    i18n as never,
  );
}

describe('AuthService.getCurrentSession — lang parameter threading for guard-scope localization', () => {
  // Bug class recap: nestjs-i18n's I18nContext is null inside Nest guard
  // execution, so any throw that runs in guard scope and calls i18n.t(key)
  // without an explicit { lang } resolves to the default locale regardless
  // of X-Locale. SessionGuard delegates to getCurrentSession() — its
  // throws were the only remaining guard-reachable service-delegated
  // throw path after 249dccc. Option 1 fix: thread lang as an optional
  // parameter; guards pass it explicitly, non-guard callers omit it.

  it('passes { lang: "en" } to i18n.t so the thrown UnauthorizedException carries the EN message', async () => {
    const calls: TCall[] = [];
    const service = buildService(makeI18n(calls));

    await assert.rejects(
      () => service.getCurrentSession(undefined, 'en'),
      (err: unknown) => {
        assert.ok(err instanceof UnauthorizedException, 'should be UnauthorizedException');
        assert.equal((err as UnauthorizedException).message, 'EN:errors.auth.authRequired');
        return true;
      },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.key, 'errors.auth.authRequired');
    assert.deepEqual(calls[0]!.options, { lang: 'en' });
  });

  it('passes { lang: "ru" } to i18n.t so the thrown UnauthorizedException carries the RU message', async () => {
    const calls: TCall[] = [];
    const service = buildService(makeI18n(calls));

    await assert.rejects(
      () => service.getCurrentSession(undefined, 'ru'),
      (err: unknown) => {
        assert.ok(err instanceof UnauthorizedException, 'should be UnauthorizedException');
        assert.equal((err as UnauthorizedException).message, 'RU:errors.auth.authRequired');
        return true;
      },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.key, 'errors.auth.authRequired');
    assert.deepEqual(calls[0]!.options, { lang: 'ru' });
  });

  it('calls i18n.t WITHOUT a lang option when no lang is provided (non-guard callers rely on I18nContext fallback)', async () => {
    const calls: TCall[] = [];
    const service = buildService(makeI18n(calls));

    await assert.rejects(
      () => service.getCurrentSession(undefined),
      (err: unknown) => {
        assert.ok(err instanceof UnauthorizedException, 'should be UnauthorizedException');
        assert.equal((err as UnauthorizedException).message, 'CTX:errors.auth.authRequired');
        return true;
      },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.key, 'errors.auth.authRequired');
    assert.equal(
      calls[0]!.options,
      undefined,
      'second arg must be omitted so nestjs-i18n falls back to I18nContext',
    );
  });
});
