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

function configService(frontendOrigin = 'https://staging.weighly.frelikh.dev') {
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
  assert.equal(provider.sent[0].subject, 'Приглашение в Администратор весов');
  assert.match(provider.sent[0].text, /https:\/\/staging\.weighly\.frelikh\.dev\/accept-invite\?token=invite-token-123/);
  assert.match(provider.sent[0].text, /2026-05-22T12:00:00.000Z/);
  assert.match(provider.sent[0].text, /Вас пригласили/);
  assert.match(provider.sent[0].html, /Вас пригласили/);
}

async function testInviteEmailLocaleRu() {
  const provider = new RecordingEmailProvider();
  const service = new EmailService(provider, configService());
  await service.sendInviteEmail({
    to: 'operator@example.test',
    token: 'invite-token-ru',
    expiresAt: new Date('2026-05-22T12:00:00.000Z'),
    locale: 'ru',
  });

  assert.equal(provider.sent[0].subject, 'Приглашение в Администратор весов');
  assert.match(provider.sent[0].text, /Вас пригласили в Администратор весов\./);
  assert.match(provider.sent[0].html, /<p>Вас пригласили в Администратор весов\.<\/p>/);
}

async function testInviteEmailLocaleEn() {
  const provider = new RecordingEmailProvider();
  const service = new EmailService(provider, configService());
  await service.sendInviteEmail({
    to: 'operator@example.test',
    token: 'invite-token-en',
    expiresAt: new Date('2026-05-22T12:00:00.000Z'),
    locale: 'en',
  });

  assert.equal(provider.sent[0].subject, 'Invitation to Scale Admin');
  assert.match(provider.sent[0].text, /You have been invited to Scale Admin\./);
  assert.match(provider.sent[0].text, /Accept invitation: https:\/\/staging\.weighly\.frelikh\.dev\/accept-invite\?token=invite-token-en/);
  assert.match(provider.sent[0].text, /The link is valid until 2026-05-22T12:00:00\.000Z\./);
  assert.match(provider.sent[0].html, /<p>You have been invited to Scale Admin\.<\/p>/);
  assert.match(provider.sent[0].html, /<a href="[^"]+">Accept invitation<\/a>/);
}

async function testInviteEmailInvalidLocaleFallsBackToRu() {
  for (const invalidLocale of ['fr', '', null, 42, undefined]) {
    const provider = new RecordingEmailProvider();
    const service = new EmailService(provider, configService());
    await service.sendInviteEmail({
      to: 'operator@example.test',
      token: 'invite-token-fallback',
      expiresAt: new Date('2026-05-22T12:00:00.000Z'),
      locale: invalidLocale,
    });

    assert.equal(
      provider.sent[0].subject,
      'Приглашение в Администратор весов',
      `invalid locale ${JSON.stringify(invalidLocale)} should fall back to RU`,
    );
    assert.match(provider.sent[0].text, /Вас пригласили/);
  }
}

async function testPasswordResetEmailLink() {
  const provider = new RecordingEmailProvider();
  const service = new EmailService(provider, configService('https://weighly.frelikh.dev'));
  const expiresAt = new Date('2026-05-22T13:00:00.000Z');

  await service.sendPasswordResetEmail({
    to: 'admin@example.test',
    token: 'reset-token-456',
    expiresAt,
  });

  assert.equal(provider.sent.length, 1);
  assert.equal(provider.sent[0].to, 'admin@example.test');
  assert.equal(provider.sent[0].subject, 'Сброс пароля в Администратор весов');
  assert.match(provider.sent[0].text, /https:\/\/weighly\.frelikh\.dev\/reset-password\?token=reset-token-456/);
  assert.match(provider.sent[0].text, /2026-05-22T13:00:00.000Z/);
  assert.match(provider.sent[0].text, /запрошен сброс пароля/);
}

async function testPasswordResetEmailLocaleRu() {
  const provider = new RecordingEmailProvider();
  const service = new EmailService(provider, configService('https://weighly.frelikh.dev'));
  await service.sendPasswordResetEmail({
    to: 'admin@example.test',
    token: 'reset-token-ru',
    expiresAt: new Date('2026-05-22T13:00:00.000Z'),
    locale: 'ru',
  });

  assert.equal(provider.sent[0].subject, 'Сброс пароля в Администратор весов');
  assert.match(provider.sent[0].text, /Для вашей учётной записи в Администратор весов запрошен сброс пароля\./);
  assert.match(provider.sent[0].html, /<p>Для вашей учётной записи в Администратор весов запрошен сброс пароля\.<\/p>/);
}

async function testPasswordResetEmailLocaleEn() {
  const provider = new RecordingEmailProvider();
  const service = new EmailService(provider, configService('https://weighly.frelikh.dev'));
  await service.sendPasswordResetEmail({
    to: 'admin@example.test',
    token: 'reset-token-en',
    expiresAt: new Date('2026-05-22T13:00:00.000Z'),
    locale: 'en',
  });

  assert.equal(provider.sent[0].subject, 'Password reset for Scale Admin');
  assert.match(
    provider.sent[0].text,
    /A password reset has been requested for your account in Scale Admin\./,
  );
  assert.match(provider.sent[0].text, /Reset password: https:\/\/weighly\.frelikh\.dev\/reset-password\?token=reset-token-en/);
  assert.match(provider.sent[0].text, /The link is valid until 2026-05-22T13:00:00\.000Z\./);
  assert.match(provider.sent[0].html, /<a href="[^"]+">Reset password<\/a>/);
}

async function testPasswordResetEmailInvalidLocaleFallsBackToRu() {
  for (const invalidLocale of ['fr', '', null, 42, undefined]) {
    const provider = new RecordingEmailProvider();
    const service = new EmailService(provider, configService('https://weighly.frelikh.dev'));
    await service.sendPasswordResetEmail({
      to: 'admin@example.test',
      token: 'reset-token-fallback',
      expiresAt: new Date('2026-05-22T13:00:00.000Z'),
      locale: invalidLocale,
    });

    assert.equal(
      provider.sent[0].subject,
      'Сброс пароля в Администратор весов',
      `invalid locale ${JSON.stringify(invalidLocale)} should fall back to RU`,
    );
    assert.match(provider.sent[0].text, /запрошен сброс пароля/);
  }
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
  await testInviteEmailLocaleRu();
  await testInviteEmailLocaleEn();
  await testInviteEmailInvalidLocaleFallsBackToRu();
  await testPasswordResetEmailLink();
  await testPasswordResetEmailLocaleRu();
  await testPasswordResetEmailLocaleEn();
  await testPasswordResetEmailInvalidLocaleFallsBackToRu();
  await testDisabledProviderNoOpsOutsideProduction();
  await testDisabledProviderFailsInProduction();
  console.log('email-service-check: OK');
})().catch((error) => {
  console.error('email-service-check: FAIL');
  console.error(error);
  process.exit(1);
});
