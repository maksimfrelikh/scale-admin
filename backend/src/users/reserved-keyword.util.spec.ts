import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isReservedUserIdKeyword,
  RESERVED_USER_ID_KEYWORDS,
  reservedUserIdMessage,
} from './reserved-keyword.util.ts';

describe('isReservedUserIdKeyword (BUG-REG-058)', () => {
  describe('matches the documented reserved set', () => {
    it('flags "me" as reserved (canonical case)', () => {
      assert.equal(isReservedUserIdKeyword('me'), true);
    });

    it('flags "current" as reserved', () => {
      assert.equal(isReservedUserIdKeyword('current'), true);
    });

    it('flags "self" as reserved', () => {
      assert.equal(isReservedUserIdKeyword('self'), true);
    });

    it('matches case-insensitively (uppercase, mixed)', () => {
      assert.equal(isReservedUserIdKeyword('ME'), true);
      assert.equal(isReservedUserIdKeyword('Me'), true);
      assert.equal(isReservedUserIdKeyword('SELF'), true);
      assert.equal(isReservedUserIdKeyword('Current'), true);
    });

    it('exports the exact documented set (no accidental additions)', () => {
      assert.deepEqual([...RESERVED_USER_ID_KEYWORDS].sort(), ['current', 'me', 'self']);
    });
  });

  describe('does NOT flag legitimate userId shapes', () => {
    const LEGITIMATE_IDS = [
      '22222222-2222-4222-8222-222222222222',
      '00000000-0000-0000-0000-000000000000',
      'a3bb189e-8bf9-3888-9912-ace4e6543002',
    ];

    for (const id of LEGITIMATE_IDS) {
      it(`accepts ${id}`, () => {
        assert.equal(isReservedUserIdKeyword(id), false);
      });
    }

    it('does not flag random non-keyword strings', () => {
      assert.equal(isReservedUserIdKeyword('alice'), false);
      assert.equal(isReservedUserIdKeyword('not-a-uuid'), false);
      assert.equal(isReservedUserIdKeyword(''), false);
    });

    it('handles non-string inputs without throwing', () => {
      assert.equal(isReservedUserIdKeyword(undefined), false);
      assert.equal(isReservedUserIdKeyword(null), false);
      assert.equal(isReservedUserIdKeyword(42), false);
      assert.equal(isReservedUserIdKeyword({ id: 'me' }), false);
    });
  });

  describe('reservedUserIdMessage', () => {
    it('mentions the rejected keyword and points to /api/auth/session', () => {
      const message = reservedUserIdMessage('me');
      assert.match(message, /'me'/);
      assert.match(message, /\/api\/auth\/session/);
      assert.match(message, /reserved keyword/i);
    });
  });
});
