const assert = require('node:assert/strict');
const { ServiceUnavailableException } = require('@nestjs/common');
const { AuthService } = require('../dist/auth/auth.service');

function configService(nodeEnv = 'production') {
  return {
    getOrThrow(key) {
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
        emailProvider: 'resend',
        emailFrom: 'Администратор весов <invites@weighly.frelikh.dev>',
        emailReplyTo: 'frelikhmax@gmail.com',
        resendApiKey: 're_test_placeholder',
      };
    },
  };
}

function buildInviteScenario() {
  const inviteId = '11111111-1111-4111-8111-111111111111';
  const state = { inviteRow: null };
  const prisma = {
    user: {
      findFirst: async () => null,
    },
    userInvite: {
      deleteMany: async ({ where }) => {
        assert.equal(where.id, inviteId);
        assert.equal(where.acceptedAt, null);
        const count = state.inviteRow ? 1 : 0;
        state.inviteRow = null;
        return { count };
      },
    },
    $transaction: async (callback) => callback({
      userInvite: {
        create: async ({ data }) => {
          state.inviteRow = {
            id: inviteId,
            ...data,
            acceptedAt: null,
            createdAt: new Date('2026-05-21T12:00:00.000Z'),
          };
          return state.inviteRow;
        },
      },
    }),
  };
  return { prisma, state };
}

async function testInviteCleanupOnDeliveryFailure() {
  const { prisma, state } = buildInviteScenario();
  const capturedInputs = [];
  const auth = new AuthService(
    prisma,
    { create: async () => undefined },
    configService(),
    {
      sendInviteEmail: async (input) => {
        capturedInputs.push(input);
        throw new Error('mock delivery failure');
      },
    },
  );

  await assert.rejects(
    () => auth.createInvite({
      email: 'operator@example.test',
      role: 'operator',
      expiresAt: '2026-05-28T12:00:00.000Z',
    }, 'actor-id', {}),
    (error) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match(error.message, /Не удалось отправить письмо с приглашением/);
      return true;
    },
  );
  assert.equal(state.inviteRow, null, 'failed delivery must delete the invite row');
  assert.equal(capturedInputs.length, 1);
  assert.equal(capturedInputs[0].locale, undefined, 'no locale supplied → forwarded as undefined (RU fallback)');
}

async function testInviteCleanupForwardsLocale() {
  for (const localeCase of [
    { input: 'ru', expected: 'ru' },
    { input: 'en', expected: 'en' },
    { input: 'fr', expected: 'fr' },
  ]) {
    const { prisma } = buildInviteScenario();
    const capturedInputs = [];
    const auth = new AuthService(
      prisma,
      { create: async () => undefined },
      configService(),
      {
        sendInviteEmail: async (input) => {
          capturedInputs.push(input);
          throw new Error('mock delivery failure');
        },
      },
    );

    await assert.rejects(
      () => auth.createInvite({
        email: 'operator@example.test',
        role: 'operator',
        expiresAt: '2026-05-28T12:00:00.000Z',
        locale: localeCase.input,
      }, 'actor-id', {}),
      ServiceUnavailableException,
    );
    assert.equal(
      capturedInputs[0].locale,
      localeCase.expected,
      `AuthService must forward locale=${localeCase.input} to EmailService`,
    );
  }
}

function buildPasswordResetScenario() {
  const resetTokenId = '22222222-2222-4222-8222-222222222222';
  const state = { resetTokenRow: null };
  const prisma = {
    user: {
      findFirst: async () => ({ id: '33333333-3333-4333-8333-333333333333', email: 'admin@example.test' }),
    },
    passwordResetToken: {
      deleteMany: async ({ where }) => {
        assert.equal(where.id, resetTokenId);
        assert.equal(where.usedAt, null);
        const count = state.resetTokenRow ? 1 : 0;
        state.resetTokenRow = null;
        return { count };
      },
    },
    $transaction: async (callback) => callback({
      passwordResetToken: {
        create: async ({ data }) => {
          state.resetTokenRow = {
            id: resetTokenId,
            ...data,
            usedAt: null,
            createdAt: new Date('2026-05-21T12:00:00.000Z'),
          };
          return state.resetTokenRow;
        },
      },
    }),
  };
  return { prisma, state };
}

async function testPasswordResetCleanupOnDeliveryFailure() {
  const { prisma, state } = buildPasswordResetScenario();
  const capturedInputs = [];
  const auth = new AuthService(
    prisma,
    { create: async () => undefined },
    configService(),
    {
      sendPasswordResetEmail: async (input) => {
        capturedInputs.push(input);
        throw new Error('mock delivery failure');
      },
    },
  );

  await assert.rejects(
    () => auth.requestPasswordReset('admin@example.test', {}),
    (error) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match(error.message, /Не удалось отправить письмо для сброса пароля/);
      return true;
    },
  );
  assert.equal(state.resetTokenRow, null, 'failed delivery must delete the reset token row');
  assert.equal(capturedInputs.length, 1);
  assert.equal(capturedInputs[0].locale, undefined, 'no locale supplied → forwarded as undefined (RU fallback)');
}

async function testPasswordResetCleanupForwardsLocale() {
  for (const localeCase of [
    { input: 'ru', expected: 'ru' },
    { input: 'en', expected: 'en' },
    { input: 'fr', expected: 'fr' },
  ]) {
    const { prisma } = buildPasswordResetScenario();
    const capturedInputs = [];
    const auth = new AuthService(
      prisma,
      { create: async () => undefined },
      configService(),
      {
        sendPasswordResetEmail: async (input) => {
          capturedInputs.push(input);
          throw new Error('mock delivery failure');
        },
      },
    );

    await assert.rejects(
      () => auth.requestPasswordReset('admin@example.test', {}, localeCase.input),
      ServiceUnavailableException,
    );
    assert.equal(
      capturedInputs[0].locale,
      localeCase.expected,
      `AuthService must forward locale=${localeCase.input} to EmailService`,
    );
  }
}

(async () => {
  await testInviteCleanupOnDeliveryFailure();
  await testInviteCleanupForwardsLocale();
  await testPasswordResetCleanupOnDeliveryFailure();
  await testPasswordResetCleanupForwardsLocale();
  console.log('email-delivery-cleanup-check: OK');
})().catch((error) => {
  console.error('email-delivery-cleanup-check: FAIL');
  console.error(error);
  process.exit(1);
});
