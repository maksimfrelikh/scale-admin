# §1.2 Wrong password / nonexistent / invalid email — findings

## Body shape — existing user wrong password vs nonexistent user
- Existing wrong-pw  → 401 `{"message":"Неверный email или пароль","error":"Unauthorized","statusCode":401}`
- Nonexistent #1    → 401 `{"message":"Неверный email или пароль","error":"Unauthorized","statusCode":401}`
- Nonexistent #5    → 401 `{"message":"Неверный email или пароль","error":"Unauthorized","statusCode":401}`
Identical shape & message — no enumeration leak. PASS.

## Latency
- Existing-user wrong pw: 161ms (1 sample, kept low to avoid DB lockout count buildup).
- Nonexistent users:      51ms avg over 5 samples.
- Ratio (nonexistent / existing): `scale=2; 51 / 161` (computed inline). Flag if existing is >2× nonexistent (i.e. password verify path measurably slower).
- Observation: backend does a DB SELECT in both branches; existing-user path additionally runs pbkdf2 password verify (`password.util.ts`, 210k iterations). A noticeable delta is expected and would not by itself indicate an enumeration vulnerability — only a ≫2× delta would.

## Invalid email format
- All five malformed-email variants returned **401** "Неверный email или пароль" (same shape as wrong-password / nonexistent).
- The brief expected **400 BadRequest** for invalid email format on login.
- Code-review (`auth.service.ts:86-91`): the login path normalizes email then bails to 401 "invalid_credentials" if normalizedEmail is empty/missing '@'. There is no RFC 5322 validation on login — that validator is only used by `requireValidInviteEmail` (`auth.service.ts:703-711`) on the invite-create path. So this is **expected current behavior** for login.
- BUG-REG-039 closure scope was invite-email validation (per `docs/regression/2026-05-19-wave-4-closure/...` and `docs/regression/2026-05-20-wave-5/SUMMARY.md`), NOT login-email validation. The brief's §1.2 wording asserts a regression that does not exist — current behavior is consistent with the validator's documented contract.
- Net effect: NOT a regression. Security-wise, returning generic 401 for invalid email format is **better** than 400 because it doesn't help an attacker distinguish "your email is well-formed but wrong" from "your email is malformed". I'll flag this as a brief-expectation alignment item, NOT a defect.

## Latency follow-up (added after first probe to reduce single-sample noise)
- Existing-user wrong-pw samples (ms): 161 159 174 169
- Existing avg: 165ms; nonexistent avg: 51ms
- **Ratio ≈ 3.24×** (165 / 51) — exceeds the brief's "flag >2×" threshold.
- Mechanism (code review, auth.service.ts:103-119): existing-user path runs pbkdf2 password verify (210k iterations, password.util.ts) before throwing 401; nonexistent-user path skips it and 401s ~3× faster. Identical response shapes but distinguishable latency — classic timing-side-channel enumeration vector.
- **Flagging as BUG-REG-068 (medium severity).** Fix: run a constant-time pbkdf2 verify against a dummy hash even when no user is found, so the timing of both branches matches.
