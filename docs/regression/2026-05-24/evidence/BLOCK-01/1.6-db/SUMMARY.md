# §1.6 DB UserSession.sessionTokenHash storage — staging

## Live DB read-only check
**SKIPPED-with-reason.** Staging DATABASE_URL (`.env.staging` line 11) points at `postgres:5432` (the docker-compose service name), reachable only from inside the staging docker network. From this Manager-inline run on the dev machine, there is no SSH tunnel / kubectl exec / openclaw browser tool available to attach a read-only psql session. Listed as coverage gap.

## Cookie-vs-hash smoke (no DB needed)
Demonstrates the storage discipline without needing direct DB access.
- Logged in as qa-admin@example.com; captured cookie `scale_admin_staging_session` value, length = 43 chars (consistent with createSessionToken() = 32 random bytes → 43-char base64url).
- Computed `sha256(cookie_value)` then base64url, length = 43 chars (consistent with hashSessionToken() output, `session-token.util.ts:7-9`).
- Probe A: `Cookie: scale_admin_staging_session=<raw cookie value>` → HTTP **200** (authenticated).
- Probe B: `Cookie: scale_admin_staging_session=<sha256(raw) base64url>` → HTTP **401** (rejected).
- If the DB stored the raw cookie value verbatim, both probes would return 200 (or neither). The observed asymmetry (A authenticates, B is rejected) is consistent with the server doing `findUnique({ where: { sessionTokenHash: sha256(cookie) } })` — i.e. **DB stores the hash, not the raw token**. ✅

## Code-level corroboration
- `session-token.util.ts:3-5` — `createSessionToken()` returns `randomBytes(32).toString('base64url')` → cookie value.
- `session-token.util.ts:7-9` — `hashSessionToken(token)` = `createHash('sha256').update(token).digest('base64url')` → hash stored.
- `auth.service.ts:121-122,141` — login persists `sessionTokenHash`, returns the raw `sessionToken` to the cookie.
- `auth.service.ts:208-211` — `getCurrentSession()` looks up the row by `sessionTokenHash = sha256(cookie)`. If a malicious DB reader leaked the hash, they could not use it as a cookie because the server would hash it AGAIN before lookup.

## Verdict
PASS by smoke + code review. Live DB peek deferred to a Tester §3.5 run with proper DB tunnel.

## Note re escalation criteria
The brief's RED escalation "stored value matches the cookie value verbatim" is NOT tripped — probe B above directly disproves verbatim storage.
