# BUG-REG-068 — POST /api/auth/login leaks user-existence via response latency

**Status:** OPEN
**Severity:** medium (information leak, not auth bypass)
**Area:** backend / auth
**Found during:** REGRESSION-2026-05-24 Wave 1, sub-block §1.2 (2026-05-24 ~13:02 GMT+2)

## Summary
`POST /api/auth/login` returns the same generic 401 body for unknown-user and wrong-password cases, but the response time differs by ~3.24× — enough for an attacker to enumerate which emails exist in the database.

## Evidence (staging)
- Existing user (`qa-admin@example.com`) + wrong password — 4 samples: 161, 159, 174, 169 ms; avg **165 ms**.
- Nonexistent users (5 distinct `nonexistent-w1-N-…@example.test` emails, each unique to dodge the IP+email bucket-key) — 5 samples: 50, 51, 53, 53, 48 ms; avg **51 ms**.
- Ratio: ~3.24× (well above the brief's "flag >2× delta" threshold).
- Response body shape is identical (`{"message":"Неверный email или пароль","error":"Unauthorized","statusCode":401}`).
- Evidence: `docs/regression/2026-05-24/evidence/BLOCK-01/1.2-wrong-pw/wrong-pw-existing*.body.json`, `nonexistent-*.body.json`, `SUMMARY.md`.

## Mechanism (code review)
`backend/src/auth/auth.service.ts` lines 92-119:
1. `findFirst({ where: { emailNormalized, deletedAt: null }, include: { credential: true } })` — same query path for both branches.
2. If `!user || user.status !== 'active' || !user.credential` → `logLoginAttempt(null, …, 'invalid_credentials')` + throw 401 (FAST PATH, ~51ms observed).
3. Otherwise `verifyPassword(password, user.credential)` (`backend/src/auth/password.util.ts`, pbkdf2 / 210k iterations) runs before the password-invalid 401 (SLOW PATH, ~165ms observed).

Branch (3) is ~110ms slower because of the pbkdf2 verify. The branch is taken iff the email belongs to an existing active user, so latency directly leaks user-existence.

## Impact
- Allows enumeration of valid admin/operator emails without needing to brute-force passwords. An attacker can build a list of valid accounts then target them with phishing, credential-stuffing, or password-spray. Lockout (5 attempts / 15 min) makes spray harder but does nothing to stop pure enumeration via timing.
- Not an auth bypass; existing rate-limit (5/60s per IP+email) and lockout (5/15min per credential) still apply. Hence medium severity, not high.

## Recommended fix
Run a constant-time pbkdf2 verify against a fixed dummy hash even when the user lookup fails, so both branches do equivalent work. Pseudocode:
```
const DUMMY_CREDENTIAL = { passwordHash: <precomputed pbkdf2(secret, salt) of a throwaway string>, passwordHashAlgorithm: 'pbkdf2_sha512', passwordHashParams: { salt: <fixed>, iterations: 210000, keyLength: 64, digest: 'sha512', encoding: 'base64' } };
if (!user || user.status !== 'active' || !user.credential) {
  verifyPassword(password, DUMMY_CREDENTIAL); // burn the time
  await this.logLoginAttempt(null, normalizedEmail, false, 'invalid_credentials', context);
  throw new UnauthorizedException('Неверный email или пароль');
}
```
Alternative: gate by a small (~50-150ms) artificial floor inside `requireEmail`/`login` so both branches reach a constant minimum latency. The pbkdf2 dummy approach is preferable because it also resists CPU-load-based fingerprinting.

## Acceptance for closure
- 5-sample latency comparison existing vs nonexistent shows ratio ≤ 1.5× (or median delta ≤ 30ms, whichever is tighter) on staging.
- Response body shape stays identical (regression guard).

## Out of scope
- Replacing pbkdf2 with argon2id (separate hardening effort, see BUG-REG-065 password hashing upgrade).
- Removing the lockout / rate-limit — those are complementary controls and must stay.
