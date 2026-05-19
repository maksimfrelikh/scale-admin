const assert = require('node:assert/strict');
const { BadRequestException } = require('@nestjs/common');
const { AuthService } = require('../dist/auth/auth.service');
const { validateInviteEmail } = require('../dist/auth/email-validation.util');

function configService(nodeEnv = 'test') {
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
      };
    },
  };
}

function buildService() {
  const created = [];
  const prisma = {
    user: {
      findFirst: async () => null,
    },
    $transaction: async (callback) => {
      const tx = {
        userInvite: {
          create: async ({ data }) => {
            const invite = {
              id: '11111111-1111-4111-8111-111111111111',
              ...data,
              acceptedAt: null,
              createdAt: new Date(),
            };
            created.push(invite);
            return invite;
          },
        },
      };
      return callback(tx);
    },
  };
  const auditLogs = { create: async () => undefined };
  const service = new AuthService(prisma, auditLogs, configService());
  return { service, created };
}

function buildInput(email) {
  return {
    email,
    role: 'operator',
    expiresAt: '2026-12-31T20:00:00.000Z',
  };
}

const CTRL_SOH = String.fromCharCode(0x01);
const CTRL_NUL = String.fromCharCode(0x00);
const CTRL_DEL = String.fromCharCode(0x7f);

const REJECT_CASES = [
  { name: 'no @ — abc', email: 'abc' },
  { name: 'empty domain — a@', email: 'a@' },
  { name: 'empty local — @b.c', email: '@b.c' },
  { name: 'domain no dot — a@b', email: 'a@b' },
  { name: 'trailing dot — a@b.c.', email: 'a@b.c.' },
  { name: 'leading dot — a@.b.c', email: 'a@.b.c' },
  { name: 'consecutive dots — a@b..c', email: 'a@b..c' },
  { name: 'local > 64 chars', email: `${'a'.repeat(65)}@example.test` },
  { name: 'total > 254 chars', email: `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(60)}.test` },
  { name: 'local with <script>', email: 'qa+<script>alert(1)</script>@example.test' },
  { name: 'local with >', email: 'a>b@example.test' },
  { name: 'local with control char SOH', email: `a${CTRL_SOH}b@example.test` },
  { name: 'local with NUL', email: `a${CTRL_NUL}b@example.test` },
  { name: 'local with DEL', email: `a${CTRL_DEL}b@example.test` },
  { name: '1000-char local', email: `${'a'.repeat(1000)}@example.test` },
  { name: 'whitespace only', email: '   ' },
  { name: 'empty string', email: '' },
  // BUG-REG-039: RFC 5321/5322 dot-atom-text gaps
  { name: 'multi-@ — a@b@c.com', email: 'a@b@c.com' },
  { name: 'SP in local — has space@example.com', email: 'has space@example.com' },
  { name: 'leading dot in local — .user@example.com', email: '.user@example.com' },
  { name: 'consecutive dots in local — us..er@example.com', email: 'us..er@example.com' },
  { name: 'trailing dot in local — user.@example.com', email: 'user.@example.com' },
  { name: 'comma in local — a,b@example.com', email: 'a,b@example.com' },
];

const ACCEPT_CASES = [
  { name: 'minimal valid — a@b.co', email: 'a@b.co' },
  { name: 'plus addressing — qa+filter@example.test', email: 'qa+filter@example.test' },
  { name: 'happy path — admin@maksimfrelikh.ru', email: 'admin@maksimfrelikh.ru' },
  { name: 'local exactly 64 chars', email: `${'a'.repeat(64)}@example.test` },
  { name: 'subdomain — user@mail.example.test', email: 'user@mail.example.test' },
  // BUG-REG-039 acceptance baselines
  { name: 'simple — user@example.com', email: 'user@example.com' },
  { name: 'plus addressing — user+tag@example.com', email: 'user+tag@example.com' },
  { name: 'dot in local — user.name@example.com', email: 'user.name@example.com' },
];

function testValidatorRejectsBadInputs() {
  for (const { name, email } of REJECT_CASES) {
    const result = validateInviteEmail(email);
    assert.equal(result.valid, false, `validator should reject: ${name}`);
  }
}

function testValidatorAcceptsValidInputs() {
  for (const { name, email } of ACCEPT_CASES) {
    const result = validateInviteEmail(email);
    assert.equal(result.valid, true, `validator should accept: ${name} (got reason: ${result.valid === false ? result.reason : '-'})`);
  }
}

function testValidatorRejectsNonStrings() {
  const cases = [null, undefined, 42, {}, [], true];
  for (const value of cases) {
    const result = validateInviteEmail(value);
    assert.equal(result.valid, false, `validator should reject non-string: ${typeof value}`);
  }
}

async function testCreateInviteRejectsBadEmails() {
  for (const { name, email } of REJECT_CASES) {
    const { service } = buildService();
    await assert.rejects(
      () => service.createInvite(buildInput(email), 'actor-id', {}),
      (error) => {
        assert.ok(error instanceof BadRequestException, `expected BadRequestException for: ${name}`);
        return true;
      },
    );
  }
}

async function testCreateInviteAcceptsValidEmail() {
  const { service, created } = buildService();
  const result = await service.createInvite(buildInput('admin@maksimfrelikh.ru'), 'actor-id', {});
  assert.equal(created.length, 1, 'invite should be persisted via mock prisma');
  assert.equal(result.invite.email, 'admin@maksimfrelikh.ru');
  assert.equal(result.invite.role, 'operator');
}

async function testCreateInviteAcceptsPlusAddressing() {
  const { service, created } = buildService();
  const result = await service.createInvite(buildInput('qa+filter@example.test'), 'actor-id', {});
  assert.equal(created.length, 1);
  assert.equal(result.invite.email, 'qa+filter@example.test');
}

(async () => {
  testValidatorRejectsBadInputs();
  testValidatorAcceptsValidInputs();
  testValidatorRejectsNonStrings();
  await testCreateInviteRejectsBadEmails();
  await testCreateInviteAcceptsValidEmail();
  await testCreateInviteAcceptsPlusAddressing();
  console.log('AUTH_INVITES_EMAIL_VALIDATION=PASS');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
