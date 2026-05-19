import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateInviteEmail } from './email-validation.util.ts';

describe('validateInviteEmail — RFC 5322 dot-atom-text local-part', () => {
  describe('rejects local-part patterns that violate RFC 5321/5322', () => {
    const REJECT_CASES: Array<{ name: string; email: string }> = [
      { name: 'local-part contains @ outside quotes (§4.1.2)', email: 'a@b@c.com' },
      { name: 'SP in unquoted local (§4.1.2)', email: 'has space@example.com' },
      { name: 'local-part starts with dot (§3.4.1)', email: '.user@example.com' },
      { name: 'consecutive dots in local-part', email: 'us..er@example.com' },
      { name: 'local-part ends with dot', email: 'user.@example.com' },
      { name: 'comma in unquoted local (§4.1.2)', email: 'a,b@example.com' },
    ];

    for (const { name, email } of REJECT_CASES) {
      it(`rejects ${name}: ${email}`, () => {
        const result = validateInviteEmail(email);
        assert.equal(result.valid, false);
        if (result.valid === false) {
          assert.equal(result.reason, 'Local part contains invalid characters');
        }
      });
    }
  });

  describe('accepts existing valid baselines', () => {
    const ACCEPT_CASES: Array<{ name: string; email: string }> = [
      { name: 'simple local-part', email: 'user@example.com' },
      { name: 'plus-addressing', email: 'user+tag@example.com' },
      { name: 'dot in local-part (dot-atom)', email: 'user.name@example.com' },
    ];

    for (const { name, email } of ACCEPT_CASES) {
      it(`accepts ${name}: ${email}`, () => {
        const result = validateInviteEmail(email);
        assert.equal(
          result.valid,
          true,
          `expected accept; got ${result.valid === false ? result.reason : ''}`,
        );
      });
    }
  });
});
