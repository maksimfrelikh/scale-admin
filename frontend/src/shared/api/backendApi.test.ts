import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import i18n from '../../i18n';
import { setLocaleHeader } from './backendApi';

describe('setLocaleHeader — X-Locale derived from i18n.resolvedLanguage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ru');
  });

  afterAll(async () => {
    await i18n.changeLanguage('ru');
  });

  it('sets X-Locale to "ru" when i18n is on ru', () => {
    const headers = new Headers();
    setLocaleHeader(headers);
    expect(headers.get('X-Locale')).toBe('ru');
  });

  it('sets X-Locale to "en" after switching to en', async () => {
    await i18n.changeLanguage('en');
    const headers = new Headers();
    setLocaleHeader(headers);
    expect(headers.get('X-Locale')).toBe('en');
  });

  it('falls back to DEFAULT_LOCALE ("ru") when resolvedLanguage is unset', () => {
    const originalResolved = i18n.resolvedLanguage;
    Object.defineProperty(i18n, 'resolvedLanguage', { value: undefined, configurable: true });
    try {
      const headers = new Headers();
      setLocaleHeader(headers);
      expect(headers.get('X-Locale')).toBe('ru');
    } finally {
      Object.defineProperty(i18n, 'resolvedLanguage', { value: originalResolved, configurable: true });
    }
  });

  it('overwrites a pre-existing X-Locale header so the interceptor wins', async () => {
    await i18n.changeLanguage('en');
    const headers = new Headers({ 'X-Locale': 'fr' });
    setLocaleHeader(headers);
    expect(headers.get('X-Locale')).toBe('en');
  });
});
