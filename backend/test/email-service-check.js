const assert = require('node:assert/strict');
const { EmailService } = require('../dist/email/email.service');
const { DisabledEmailProvider } = require('../dist/email/resend-email.provider');

class RecordingEmailProvider {
  constructor() {
    this.sent = [];
  }

  async sendEmail(input) {
    this.sent.push(input);
  }
}

function configService(frontendOrigin = 'https://staging.maksimfrelikh.ru') {
  return {
    getOrThrow(key) {
      assert.equal(key, 'app');
      return { frontendOrigin };
    },
  };
}

async function testInviteEmailLink() {
  const provider = new RecordingEmailProvider();
  const service = new EmailService(provider, configService());
  const expiresAt = new Date('2026-05-22T12:00:00.000Z');

  await service.sendInviteEmail({
    to: 'operator@example.test',
    token: 'invite-token-123',
    expiresAt,
  });

  assert.equal(provider.sent.length, 1);
  assert.equal(provider.sent[0].to, 'operator@example.test');
  assert.equal(provider.sent[0].subject, 'Scale Admin invitation');
  assert.match(provider.sent[0].text, /https:\/\/staging\.maksimfrelikh\.ru\/accept-invite\?token=invite-token-123/);
  assert.match(provider.sent[0].text, /2026-05-22T12:00:00.000Z/);
}

async function testPasswordResetEmailLink() {
  const provider = new RecordingEmailProvider();
  const service = new EmailService(provider, configService('https://maksimfrelikh.ru'));
  const expiresAt = new Date('2026-05-22T13:00:00.000Z');

  await service.sendPasswordResetEmail({
    to: 'admin@example.test',
    token: 'reset-token-456',
    expiresAt,
  });

  assert.equal(provider.sent.length, 1);
  assert.equal(provider.sent[0].to, 'admin@example.test');
  assert.equal(provider.sent[0].subject, 'Scale Admin password reset');
  assert.match(provider.sent[0].text, /https:\/\/maksimfrelikh\.ru\/reset-password\?token=reset-token-456/);
  assert.match(provider.sent[0].text, /2026-05-22T13:00:00.000Z/);
}

async function testDisabledProviderNoOpsOutsideProduction() {
  const provider = new DisabledEmailProvider({ nodeEnv: 'development' });
  await provider.sendEmail({
    to: 'operator@example.test',
    subject: 'ignored',
    text: 'ignored',
  });
}

async function testDisabledProviderFailsInProduction() {
  const provider = new DisabledEmailProvider({ nodeEnv: 'production' });
  await assert.rejects(
    () => provider.sendEmail({
      to: 'operator@example.test',
      subject: 'ignored',
      text: 'ignored',
    }),
    /Email provider is disabled/,
  );
}

(async () => {
  await testInviteEmailLink();
  await testPasswordResetEmailLink();
  await testDisabledProviderNoOpsOutsideProduction();
  await testDisabledProviderFailsInProduction();
  console.log('email-service-check: OK');
})().catch((error) => {
  console.error('email-service-check: FAIL');
  console.error(error);
  process.exit(1);
});
