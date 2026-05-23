import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// AuthService uses @Injectable() + parameter properties that node's TypeScript
// strip-only runner cannot parse, so this spec imports the compiled class from
// dist/ after the CI build step.
import { AuthService } from '../../dist/auth/auth.service.js';

function configService(nodeEnv = 'development') {
  return {
    getOrThrow(key: string) {
      assert.equal(key, 'app');
      return {
        nodeEnv,
        sessionCookieName: 'scale_admin_session',
        csrfCookieName: 'scale_admin_csrf',
        csrfHeaderName: 'x-csrf-token',
        sessionIdleTimeoutMinutes: 30,
        sessionAbsoluteTimeoutDays: 7,
        passwordResetTokenTtlMinutes: 15,
        authFailedLoginMaxAttempts: 5,
        authFailedLoginLockMinutes: 10,
        frontendOrigin: 'https://example.test',
        emailProvider: 'disabled',
        emailFrom: 'Администратор весов <invites@maksimfrelikh.ru>',
        emailReplyTo: 'frelikhmax@gmail.com',
        resendApiKey: '',
      };
    },
  };
}

function responseKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const keys: string[] = [];
  for (const [key, nested] of Object.entries(value)) {
    keys.push(key);
    keys.push(...responseKeys(nested));
  }
  return keys;
}

function assertNoRawAuthTokenFields(response: unknown) {
  const forbidden = new Set(['token', 'inviteToken', 'resetToken', 'passwordResetToken']);
  const keys = responseKeys(response);
  for (const key of keys) {
    assert.equal(forbidden.has(key), false, 'response must not contain raw auth token field ' + key);
  }
}

describe('AuthService - BUG-REG-066 raw auth token responses', () => {
  it('does not return a raw invite token in non-production responses', async () => {
    const sentEmails: Array<{ token: string }> = [];
    const createdAt = new Date('2026-05-23T18:00:00.000Z');
    const prisma = {
      user: {
        findFirst: async () => null,
      },
      userInvite: {
        deleteMany: async () => ({ count: 0 }),
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
        userInvite: {
          create: async ({ data }: { data: Record<string, unknown> }) => ({
            id: '11111111-1111-4111-8111-111111111111',
            ...data,
            acceptedAt: null,
            createdAt,
          }),
        },
      }),
    };
    const auth = new AuthService(
      prisma as never,
      { create: async () => undefined } as never,
      configService('development') as never,
      { sendInviteEmail: async (input: { token: string }) => sentEmails.push(input) } as never,
    );

    const response = await auth.createInvite(
      {
        email: 'operator@example.test',
        role: 'operator',
        expiresAt: '2026-05-30T18:00:00.000Z',
      },
      'admin-user-id',
      {},
    );

    assert.equal(sentEmails.length, 1, 'email delivery still receives the one-time invite token');
    assert.ok(sentEmails[0].token.length > 0, 'invite token must be generated for the email link');
    assertNoRawAuthTokenFields(response);
    assert.equal(JSON.stringify(response).includes(sentEmails[0].token), false);
  });

  it('does not return a raw password reset token in non-production responses', async () => {
    const sentEmails: Array<{ token: string }> = [];
    const resetExpiresAt = new Date('2026-05-23T18:15:00.000Z');
    const prisma = {
      user: {
        findFirst: async () => ({
          id: '22222222-2222-4222-8222-222222222222',
          email: 'operator@example.test',
        }),
      },
      passwordResetToken: {
        deleteMany: async () => ({ count: 0 }),
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
        passwordResetToken: {
          create: async ({ data }: { data: Record<string, unknown> }) => ({
            id: '33333333-3333-4333-8333-333333333333',
            ...data,
            expiresAt: resetExpiresAt,
          }),
        },
      }),
    };
    const auth = new AuthService(
      prisma as never,
      { create: async () => undefined } as never,
      configService('test') as never,
      { sendPasswordResetEmail: async (input: { token: string }) => sentEmails.push(input) } as never,
    );

    const response = await auth.requestPasswordReset('operator@example.test', {});

    assert.equal(sentEmails.length, 1, 'email delivery still receives the one-time reset token');
    assert.ok(sentEmails[0].token.length > 0, 'reset token must be generated for the email link');
    assert.equal(response.accepted, true);
    assert.equal(response.tokenExpiresAt, resetExpiresAt.toISOString());
    assertNoRawAuthTokenFields(response);
    assert.equal(JSON.stringify(response).includes(sentEmails[0].token), false);
  });

  it('does not return a raw password reset token when the email is unknown', async () => {
    const prisma = {
      user: {
        findFirst: async () => null,
      },
    };
    const auth = new AuthService(
      prisma as never,
      { create: async () => undefined } as never,
      configService('development') as never,
      { sendPasswordResetEmail: async () => undefined } as never,
    );

    const response = await auth.requestPasswordReset('missing@example.test', {});

    assert.equal(response.accepted, true);
    assertNoRawAuthTokenFields(response);
  });
});
