import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isUuid } from './uuid.util.ts';

describe('isUuid (BUG-REG-058)', () => {
  describe('accepts UUID-shaped strings (8-4-4-4-12 hex)', () => {
    const ACCEPT_CASES = [
      // v4 (canonical Prisma default(uuid()))
      'a3bb189e-8bf9-4888-9912-ace4e6543002',
      // all-zero (RFC nil)
      '00000000-0000-0000-0000-000000000000',
      // uppercase hex
      'A3BB189E-8BF9-4888-9912-ACE4E6543002',
      // v1
      'c232ab00-9414-11ec-b3c8-9f6bdeced846',
      // v7 (forward-compat)
      '018e8f8d-8c0e-7a3e-8c1d-0123456789ab',
    ];

    for (const id of ACCEPT_CASES) {
      it(`accepts ${id}`, () => {
        assert.equal(isUuid(id), true);
      });
    }
  });

  describe('rejects non-UUID strings — the BUG-REG-058 cases', () => {
    const REJECT_CASES = [
      { name: 'reserved keyword "me"', value: 'me' },
      { name: 'word "current"', value: 'current' },
      { name: 'arbitrary alpha', value: 'alice' },
      { name: 'short hex', value: 'abcdef' },
      { name: 'too many groups', value: '1-2-3-4-5-6' },
      { name: 'wrong group lengths', value: '12345678-1234-1234-1234-12345678901' },
      { name: 'non-hex char in last group', value: 'a3bb189e-8bf9-4888-9912-ace4e654300z' },
      { name: 'empty string', value: '' },
      { name: 'whitespace', value: '   ' },
      { name: 'uuid surrounded by spaces', value: ' a3bb189e-8bf9-4888-9912-ace4e6543002 ' },
    ];

    for (const { name, value } of REJECT_CASES) {
      it(`rejects ${name}: ${JSON.stringify(value)}`, () => {
        assert.equal(isUuid(value), false);
      });
    }

    it('rejects non-string inputs without throwing', () => {
      assert.equal(isUuid(undefined), false);
      assert.equal(isUuid(null), false);
      assert.equal(isUuid(42), false);
      assert.equal(isUuid({ id: 'a3bb189e-8bf9-4888-9912-ace4e6543002' }), false);
    });
  });
});
