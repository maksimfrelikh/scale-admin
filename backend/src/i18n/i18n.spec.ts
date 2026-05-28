import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { Test, type TestingModule } from '@nestjs/testing';
import { I18nModule, I18nService } from 'nestjs-i18n';

const I18N_DIST_PATH = join(process.cwd(), 'dist', 'i18n');

const RU_ERRORS = JSON.parse(
  readFileSync(join(I18N_DIST_PATH, 'ru', 'errors.json'), 'utf8'),
) as { auth: Record<string, string> };
const EN_ERRORS = JSON.parse(
  readFileSync(join(I18N_DIST_PATH, 'en', 'errors.json'), 'utf8'),
) as { auth: Record<string, string> };

describe('I18nModule — errors.auth.* resolution by lang (proxy for X-Locale header)', () => {
  let app: TestingModule;
  let i18n: I18nService;

  before(async () => {
    app = await Test.createTestingModule({
      imports: [
        I18nModule.forRoot({
          fallbackLanguage: 'ru',
          loaderOptions: {
            path: I18N_DIST_PATH,
            watch: false,
          },
        }),
      ],
    }).compile();

    i18n = app.get(I18nService);
  });

  after(async () => {
    await app?.close();
  });

  it('resolves errors.auth.invalidCredentials in RU verbatim from the JSON file', async () => {
    const value = await i18n.translate('errors.auth.invalidCredentials', { lang: 'ru' });
    assert.equal(value, RU_ERRORS.auth.invalidCredentials);
    assert.match(value as string, /[Ѐ-ӿ]/, 'RU value must contain Cyrillic');
  });

  it('resolves errors.auth.invalidCredentials in EN semantic translation', async () => {
    const value = await i18n.translate('errors.auth.invalidCredentials', { lang: 'en' });
    assert.equal(value, EN_ERRORS.auth.invalidCredentials);
    assert.doesNotMatch(value as string, /[Ѐ-ӿ]/, 'EN value must not contain Cyrillic');
  });

  it('falls back to RU (fallbackLanguage) when an unsupported lang is requested', async () => {
    const value = await i18n.translate('errors.auth.invalidCredentials', { lang: 'fr' });
    assert.equal(value, RU_ERRORS.auth.invalidCredentials);
  });

  it('resolves the two structured-payload keys (loginTemporarilyLocked, csrfTokenInvalid) in both locales', async () => {
    const ruLocked = await i18n.translate('errors.auth.loginTemporarilyLocked', { lang: 'ru' });
    const enLocked = await i18n.translate('errors.auth.loginTemporarilyLocked', { lang: 'en' });
    assert.equal(ruLocked, RU_ERRORS.auth.loginTemporarilyLocked);
    assert.equal(enLocked, EN_ERRORS.auth.loginTemporarilyLocked);
    assert.notEqual(ruLocked, enLocked);

    const ruCsrf = await i18n.translate('errors.auth.csrfTokenInvalid', { lang: 'ru' });
    const enCsrf = await i18n.translate('errors.auth.csrfTokenInvalid', { lang: 'en' });
    assert.equal(ruCsrf, RU_ERRORS.auth.csrfTokenInvalid);
    assert.equal(enCsrf, EN_ERRORS.auth.csrfTokenInvalid);
    assert.notEqual(ruCsrf, enCsrf);
  });
});

describe('errors.auth.* JSON integrity — every AuthModule throw has a working key in both locales', () => {
  const ruKeys = Object.keys(RU_ERRORS.auth).sort();
  const enKeys = Object.keys(EN_ERRORS.auth).sort();

  it('RU and EN expose the same set of auth.* keys', () => {
    assert.deepEqual(ruKeys, enKeys);
  });

  it('every RU auth.* value is non-empty and contains Cyrillic', () => {
    for (const [key, value] of Object.entries(RU_ERRORS.auth)) {
      assert.equal(typeof value, 'string', `${key} must be a string`);
      assert.ok((value as string).length > 0, `${key} must be non-empty`);
      assert.match(value as string, /[Ѐ-ӿ]/, `${key} RU value must contain Cyrillic`);
    }
  });

  it('every EN auth.* value is non-empty and contains no Cyrillic', () => {
    for (const [key, value] of Object.entries(EN_ERRORS.auth)) {
      assert.equal(typeof value, 'string', `${key} must be a string`);
      assert.ok((value as string).length > 0, `${key} must be non-empty`);
      assert.doesNotMatch(value as string, /[Ѐ-ӿ]/, `${key} EN value must not contain Cyrillic`);
    }
  });
});
