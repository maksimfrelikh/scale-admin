import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { DUMMY_CREDENTIAL } from '../../src/auth/dummy-credential.ts';
import { hashPassword, verifyPassword } from '../../src/auth/password.util.ts';

// BUG-REG-068 — login response-latency parity between existing-user and
// nonexistent-user paths. Pre-fix the no-user branch skipped pbkdf2 and
// returned in ~50 ms while the existing-user wrong-password branch took
// ~165 ms (3.24× delta on staging). FIX 2 runs verifyPassword() against a
// fixed DUMMY_CREDENTIAL on the no-user branch so both paths burn the same
// pbkdf2 work. These specs pin the dummy credential shape, sanity behaviour,
// and the auth.service.ts no-user wiring.
describe('BUG-REG-068 — login timing leak', () => {
  describe('DUMMY_CREDENTIAL shape', () => {
    it('uses production hash params (pbkdf2_sha512 / 210000 / sha512 / 64-byte key)', () => {
      assert.equal(DUMMY_CREDENTIAL.passwordHashAlgorithm, 'pbkdf2_sha512'); // gitleaks:allow
      assert.equal(DUMMY_CREDENTIAL.passwordHashParams.iterations, 210_000);
      assert.equal(DUMMY_CREDENTIAL.passwordHashParams.keyLength, 64);
      assert.equal(DUMMY_CREDENTIAL.passwordHashParams.digest, 'sha512');
      assert.equal(DUMMY_CREDENTIAL.passwordHashParams.encoding, 'base64');
    });

    it('hash and salt are base64 strings of the expected byte sizes', () => {
      // 64-byte hash → 88 base64 chars; 32-byte salt → 44 base64 chars.
      assert.equal(typeof DUMMY_CREDENTIAL.passwordHash, 'string');
      assert.equal(typeof DUMMY_CREDENTIAL.passwordHashParams.salt, 'string');
      assert.equal(DUMMY_CREDENTIAL.passwordHash.length, 88);
      assert.equal(DUMMY_CREDENTIAL.passwordHashParams.salt.length, 44);
    });
  });

  describe('verifyPassword against DUMMY_CREDENTIAL', () => {
    it('always returns false (sanity — no submitted password matches the throwaway dummy)', () => {
      assert.equal(verifyPassword('anything', DUMMY_CREDENTIAL), false);
      assert.equal(verifyPassword('', DUMMY_CREDENTIAL), false);
      assert.equal(verifyPassword('12345678', DUMMY_CREDENTIAL), false);
      assert.equal(verifyPassword('QaRegression123!', DUMMY_CREDENTIAL), false);
    });

    it('runs the same pbkdf2 work as a real credential — dummy timing ≈ real timing', () => {
      // Warm up: amortize V8 / pbkdf2 library init outside the measurement.
      const warmup = hashPassword('warmup-password');
      verifyPassword('w', warmup);
      verifyPassword('w', DUMMY_CREDENTIAL);

      function totalMs(fn: () => void, iterations: number): number {
        const start = process.hrtime.bigint();
        for (let i = 0; i < iterations; i++) fn();
        const end = process.hrtime.bigint();
        return Number(end - start) / 1e6;
      }

      const N = 5;
      const realCred = hashPassword('production-shape-password');
      const realMs = totalMs(() => verifyPassword('wrong-password', realCred), N);
      const dummyMs = totalMs(() => verifyPassword('wrong-password', DUMMY_CREDENTIAL), N);

      // Both burn the same pbkdf2_sha512 / 210k iter / 64-byte work; ratios
      // outside [0.5, 2.0] would indicate the dummy is short-circuiting (or
      // the real credential isn't actually doing pbkdf2). Wide window absorbs
      // CI runner jitter.
      const ratio = dummyMs / realMs;
      assert.ok(
        ratio >= 0.5 && ratio <= 2.0,
        `expected dummy/real timing ratio in [0.5, 2.0], got ${ratio.toFixed(3)} (real=${realMs.toFixed(1)}ms dummy=${dummyMs.toFixed(1)}ms over ${N} iter)`,
      );

      // Also prove pbkdf2 actually ran: ≥ 25 ms per call (≥ 125 ms for N=5)
      // on any reasonable hardware. Without the fix the dummy call wouldn't
      // exist; with the fix it must do real work.
      assert.ok(dummyMs >= 125, `expected dummy total ≥ 125ms across ${N} iter, got ${dummyMs.toFixed(1)}ms (pbkdf2 likely short-circuited)`);
    });
  });

  describe('auth.service.ts no-user branch wires DUMMY_CREDENTIAL', () => {
    it('source calls verifyPassword(password, DUMMY_CREDENTIAL) before throw on no-user branch', () => {
      const source = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'auth', 'auth.service.ts'), 'utf8');
      // The DUMMY_CREDENTIAL import landed.
      assert.match(source, /DUMMY_CREDENTIAL/, 'DUMMY_CREDENTIAL must be imported');
      // The no-user branch calls verifyPassword(password, DUMMY_CREDENTIAL).
      assert.match(
        source,
        /verifyPassword\s*\(\s*password\s*,\s*DUMMY_CREDENTIAL\s*\)/,
        'no-user branch must invoke verifyPassword(password, DUMMY_CREDENTIAL) before throwing 401',
      );
    });
  });
});
