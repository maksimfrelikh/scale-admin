import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { coerceLocale, getRequestLocale } from './coerce-locale.ts';

describe('coerceLocale', () => {
  it('returns "en" only when the value is exactly the string "en"', () => {
    assert.equal(coerceLocale('en'), 'en');
  });

  it('returns "ru" for "ru", any unknown locale, and non-string inputs (defensive default)', () => {
    assert.equal(coerceLocale('ru'), 'ru');
    assert.equal(coerceLocale('fr'), 'ru');
    assert.equal(coerceLocale('EN'), 'ru');
    assert.equal(coerceLocale(''), 'ru');
    assert.equal(coerceLocale(undefined), 'ru');
    assert.equal(coerceLocale(null), 'ru');
    assert.equal(coerceLocale(123), 'ru');
  });
});

describe('getRequestLocale', () => {
  it('reads x-locale header and coerces to a supported locale', () => {
    assert.equal(getRequestLocale({ 'x-locale': 'en' }), 'en');
    assert.equal(getRequestLocale({ 'x-locale': 'ru' }), 'ru');
    assert.equal(getRequestLocale({ 'x-locale': 'fr' }), 'ru');
  });

  it('handles array-valued headers by taking the first entry', () => {
    assert.equal(getRequestLocale({ 'x-locale': ['en', 'ru'] }), 'en');
    assert.equal(getRequestLocale({ 'x-locale': ['fr'] }), 'ru');
  });

  it('falls back to "ru" when headers are missing or x-locale is absent', () => {
    assert.equal(getRequestLocale(undefined), 'ru');
    assert.equal(getRequestLocale({}), 'ru');
    assert.equal(getRequestLocale({ 'x-locale': undefined }), 'ru');
  });
});
