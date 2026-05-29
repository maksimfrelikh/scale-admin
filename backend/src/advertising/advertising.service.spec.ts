import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateBannerImageUrl } from './image-url.util.ts';

// AdvertisingService.requireImageUrl() is a thin throw-wrapper around
// validateBannerImageUrl(); tests target the validator since the service
// class uses decorators + parameter properties that node's TypeScript
// strip-only test runner cannot parse. Acceptance §1–6 enforce identical
// rules on create and update, which both call the same validator.

describe('AdvertisingService — banner imageUrl validation (BUG-REG-040)', () => {
  describe('rejects non-http(s) and malformed URLs (acceptance §1, §2, §3, §5)', () => {
    const REJECT_CASES: Array<{ name: string; url: string }> = [
      { name: 'javascript: URI (§1)', url: 'javascript:alert(1)' },
      { name: 'data: HTML URI (§2)', url: 'data:text/html,<script>alert(1)</script>' },
      { name: 'data: PNG base64', url: 'data:image/png;base64,AAAA' },
      { name: 'plain not-a-url (§3)', url: 'not-a-url' },
      { name: 'ftp scheme (§5)', url: 'ftp://example.com/x.png' },
      { name: 'file scheme', url: 'file:///etc/passwd' },
      { name: 'protocol-relative //example.com (no scheme parses)', url: '//example.com/x.png' },
      { name: 'whitespace-only string', url: '   ' },
      { name: 'empty string', url: '' },
    ];

    for (const { name, url } of REJECT_CASES) {
      it(`rejects ${name}: ${JSON.stringify(url)}`, () => {
        const result = validateBannerImageUrl(url);
        assert.equal(result.valid, false, `expected reject; got accept`);
        if (result.valid === false) {
          assert.match(
            result.reasonKey,
            /^errors\.advertising\.(imageUrlMustBeHttpUrl|imageUrlRequired)$/,
          );
        }
      });
    }
  });

  describe('rejects non-string inputs', () => {
    const NON_STRING_CASES: Array<{ name: string; value: unknown }> = [
      { name: 'undefined', value: undefined },
      { name: 'null', value: null },
      { name: 'number', value: 123 },
      { name: 'object', value: { url: 'https://example.com/x.png' } },
    ];

    for (const { name, value } of NON_STRING_CASES) {
      it(`rejects ${name}`, () => {
        const result = validateBannerImageUrl(value);
        assert.equal(result.valid, false);
        if (result.valid === false) {
          assert.equal(result.reasonKey, 'errors.advertising.imageUrlRequired');
        }
      });
    }
  });

  describe('accepts valid http(s) URLs (acceptance §4)', () => {
    const ACCEPT_CASES: Array<{ name: string; url: string }> = [
      { name: 'https with path', url: 'https://example.com/x.png' },
      { name: 'http with path', url: 'http://example.com/x.png' },
      { name: 'https with port + query', url: 'https://cdn.example.com:8443/banner.jpg?v=1' },
      { name: 'https with deep path', url: 'https://example.com/a/b/c/banner.webp' },
    ];

    for (const { name, url } of ACCEPT_CASES) {
      it(`accepts ${name}: ${url}`, () => {
        const result = validateBannerImageUrl(url);
        assert.equal(
          result.valid,
          true,
          `expected accept; got ${result.valid === false ? result.reasonKey : ''}`,
        );
        if (result.valid === true) {
          assert.equal(result.value, url);
        }
      });
    }

    it('trims surrounding whitespace before validating', () => {
      const result = validateBannerImageUrl('  https://example.com/x.png  ');
      assert.equal(result.valid, true);
      if (result.valid === true) {
        assert.equal(result.value, 'https://example.com/x.png');
      }
    });
  });
});
