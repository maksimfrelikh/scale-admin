import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import i18n from '../../i18n';
import { normalizeError, setLocaleHeader } from './backendApi';

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

describe('normalizeError — backend localized message passthrough for 401/403/429', () => {
  it('401: returns backend EN message verbatim (no RU override)', () => {
    const result = normalizeError({
      status: 401,
      data: { message: 'Invalid email or password', statusCode: 401 },
    });
    expect(result.status).toBe(401);
    expect(result.message).toBe('Invalid email or password');
  });

  it('401: returns backend RU message verbatim', () => {
    const result = normalizeError({
      status: 401,
      data: { message: 'Неверный email или пароль', statusCode: 401 },
    });
    expect(result.status).toBe(401);
    expect(result.message).toBe('Неверный email или пароль');
  });

  it('403: returns backend EN message verbatim (no RU override)', () => {
    const result = normalizeError({
      status: 403,
      data: { message: 'CSRF token required or invalid', statusCode: 403 },
    });
    expect(result.status).toBe(403);
    expect(result.message).toBe('CSRF token required or invalid');
  });

  it('429: returns backend EN message verbatim (no RU override)', () => {
    const result = normalizeError({
      status: 429,
      data: { message: 'Too many requests. Please retry later.', statusCode: 429 },
    });
    expect(result.status).toBe(429);
    expect(result.message).toBe('Too many requests. Please retry later.');
  });

  it('400: returns backend EN message verbatim (no client-side dict translation)', () => {
    const result = normalizeError({
      status: 400,
      data: { message: 'User with this email already exists', statusCode: 400 },
    });
    expect(result.status).toBe(400);
    expect(result.message).toBe('User with this email already exists');
  });

  it('falls back to "Сервер вернул HTTP {N}" when backend supplies no message', () => {
    const result = normalizeError({
      status: 500,
      data: {},
    });
    expect(result.status).toBe(500);
    expect(result.message).toBe('Сервер вернул HTTP 500');
  });
});
