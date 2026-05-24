# §1.8 Idle + absolute timeout — staging config check

## Live evidence (session row metadata)
- createdAt: `2026-05-24T11:07:29.551Z`
- expiresAt: `2026-06-07T11:07:29.551Z`
- lastUsedAt at first probe: `2026-05-24T11:07:29.722Z`
- expiresAt − createdAt = 1209600s ≈ 14 days.

## Config (verified)
- `.env.staging` lines 26-27:
  - `SESSION_IDLE_TIMEOUT_MINUTES=30`
  - `SESSION_ABSOLUTE_TIMEOUT_DAYS=14`
- Mirrored in code: `backend/src/config/app.config.ts:39-40`, used by `auth.service.ts:63-64` → both timeouts are wired into the AuthService at startup.

## Wire-in confirmation (code)
- **Absolute timeout** is set on the session row at login (`auth.service.ts:123`): `expiresAt = new Date(now.getTime() + absoluteTimeoutMs)`. Above we observed exactly 14 days, matching `SESSION_ABSOLUTE_TIMEOUT_DAYS=14`.
- **Idle timeout** is enforced on every `/api/auth/session` and `SessionGuard` request (`auth.service.ts:223-228`): if `now − lastUsedAt > idleTimeoutMs` the session is revoked with reason `idle_timeout`.
- **Cookie Max-Age** is set to `absoluteTimeoutMs` (`auth.service.ts:77`) → cookie expires from the browser at the same time the server-side session does. We previously observed `Max-Age=1209600` (14 days) in the Set-Cookie header (§1.4). ✅

## Live-wait policy
The brief explicitly allows config verification in lieu of long live-waits ("do NOT block Wave 1 on long-running timeouts if the config is verifiably correct"). The 30-min idle and 14-day absolute live-waits are skipped here; the wiring + observed expiresAt is sufficient for non-regression.

## Verdict
PASS — both timeouts are wired, observable on the session row, and bound to environment variables that are present in `.env.staging`.
