import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { Test, type TestingModule } from '@nestjs/testing';
import { I18nModule, I18nService } from 'nestjs-i18n';

const I18N_DIST_PATH = join(process.cwd(), 'dist', 'i18n');

type ErrorsBundle = Record<string, Record<string, string>>;

const RU_ERRORS = JSON.parse(
  readFileSync(join(I18N_DIST_PATH, 'ru', 'errors.json'), 'utf8'),
) as ErrorsBundle;
const EN_ERRORS = JSON.parse(
  readFileSync(join(I18N_DIST_PATH, 'en', 'errors.json'), 'utf8'),
) as ErrorsBundle;

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

const ERROR_MODULES = ['auth', 'users', 'stores', 'products', 'catalog'] as const;

describe('errors.*.* JSON integrity — every module key exists in both locales with locale-appropriate content', () => {
  it('RU and EN expose the same top-level module namespaces', () => {
    assert.deepEqual(Object.keys(RU_ERRORS).sort(), Object.keys(EN_ERRORS).sort());
    for (const module of ERROR_MODULES) {
      assert.ok(RU_ERRORS[module], `RU bundle missing errors.${module} namespace`);
      assert.ok(EN_ERRORS[module], `EN bundle missing errors.${module} namespace`);
    }
  });

  for (const module of ERROR_MODULES) {
    it(`RU and EN expose the same set of ${module}.* keys`, () => {
      const ruKeys = Object.keys(RU_ERRORS[module]).sort();
      const enKeys = Object.keys(EN_ERRORS[module]).sort();
      assert.deepEqual(ruKeys, enKeys);
    });

    it(`every RU ${module}.* value is non-empty and contains Cyrillic`, () => {
      for (const [key, value] of Object.entries(RU_ERRORS[module])) {
        assert.equal(typeof value, 'string', `${module}.${key} must be a string`);
        assert.ok(value.length > 0, `${module}.${key} must be non-empty`);
        assert.match(value, /[Ѐ-ӿ]/, `${module}.${key} RU value must contain Cyrillic`);
      }
    });

    it(`every EN ${module}.* value is non-empty and contains no Cyrillic`, () => {
      for (const [key, value] of Object.entries(EN_ERRORS[module])) {
        assert.equal(typeof value, 'string', `${module}.${key} must be a string`);
        assert.ok(value.length > 0, `${module}.${key} must be non-empty`);
        assert.doesNotMatch(value, /[Ѐ-ӿ]/, `${module}.${key} EN value must not contain Cyrillic`);
      }
    });
  }
});

describe('I18nModule — sample keys from each new module resolve in both locales (PR-B smoke)', () => {
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

  const SMOKE_KEYS: Array<{ key: string; module: 'users' | 'stores' | 'products' | 'catalog'; subKey: string }> = [
    { key: 'errors.users.userNotFound', module: 'users', subKey: 'userNotFound' },
    { key: 'errors.stores.storeNotFound', module: 'stores', subKey: 'storeNotFound' },
    { key: 'errors.products.productNotFound', module: 'products', subKey: 'productNotFound' },
    { key: 'errors.catalog.categoryNotFound', module: 'catalog', subKey: 'categoryNotFound' },
  ];

  for (const { key, module, subKey } of SMOKE_KEYS) {
    it(`${key} resolves to the RU JSON value and contains Cyrillic`, async () => {
      const value = await i18n.translate(key, { lang: 'ru' });
      assert.equal(value, RU_ERRORS[module][subKey]);
      assert.match(value as string, /[Ѐ-ӿ]/);
    });

    it(`${key} resolves to the EN JSON value and contains no Cyrillic`, async () => {
      const value = await i18n.translate(key, { lang: 'en' });
      assert.equal(value, EN_ERRORS[module][subKey]);
      assert.doesNotMatch(value as string, /[Ѐ-ӿ]/);
      assert.notEqual(value, RU_ERRORS[module][subKey]);
    });

    it(`${key} falls back to RU when an unsupported lang is requested`, async () => {
      const value = await i18n.translate(key, { lang: 'fr' });
      assert.equal(value, RU_ERRORS[module][subKey]);
    });
  }

  it('errors.users.reservedUserId interpolates the {value} arg in both locales', async () => {
    const ruValue = await i18n.translate('errors.users.reservedUserId', { lang: 'ru', args: { value: 'me' } });
    const enValue = await i18n.translate('errors.users.reservedUserId', { lang: 'en', args: { value: 'me' } });
    assert.match(ruValue as string, /'me'/);
    assert.match(ruValue as string, /зарезервированное слово/i);
    assert.match(enValue as string, /'me'/);
    assert.match(enValue as string, /reserved keyword/i);
  });

  it('errors.catalog.maxCategoryDepthExceeded interpolates the {max} arg in both locales', async () => {
    const ruValue = await i18n.translate('errors.catalog.maxCategoryDepthExceeded', { lang: 'ru', args: { max: 3 } });
    const enValue = await i18n.translate('errors.catalog.maxCategoryDepthExceeded', { lang: 'en', args: { max: 3 } });
    assert.match(ruValue as string, /3 уровней/);
    assert.match(enValue as string, /3 levels/);
  });
});
