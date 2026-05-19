# BUG-REG-039: Invite email validation accepts several RFC 5321 violations (BUG-REG-020 fix incomplete)

- **Status:** OPEN
- **Severity:** medium
- **Area:** auth / invites / validation
- **Role:** admin
- **Environment:** local docker stack against `main @ bd3d5e2` (production-built bundle, `FRONTEND_ORIGIN=http://localhost:5173`, `VITE_API_BASE_URL=http://localhost:3000`)
- **Browser/Tool:** Playwright + direct API
- **Found during:** Wave 3 full regression, Block 2 (`probe-block-02-emails.cjs`)
- **Related:** BUG-REG-020 (RFC 5321 invite email validation fix, commit `1f1c84f`)

## Шаги воспроизведения

```bash
# Login as admin → grab CSRF + session cookie
curl -s -c /tmp/c -H "Origin: http://localhost:5173" http://localhost:3000/api/auth/csrf
TOKEN=$(jq -r .csrfToken /tmp/c.json)

# POST invite with a syntactically invalid email per RFC 5321
curl -s -i -H "Content-Type: application/json" -H "Origin: http://localhost:5173" \
  -H "X-CSRF-Token: $TOKEN" -H "Cookie: scale_admin_csrf=$TOKEN; scale_admin_session=<...>" \
  -X POST http://localhost:3000/api/auth/invites \
  -d '{"email":"a@b@c.example.com","role":"operator","fullName":"X","expiresAt":"2026-05-26T00:00:00.000Z"}'
```

Reproduced for the following local-part patterns (each created a real invite row, status 201):

| Email pattern | Why it violates RFC 5321 | Result |
|---|---|---|
| `a@b@c.com` | Local-part contains `@` outside quotes — §4.1.2 forbids | 201 (invite created) |
| `has space@example.com` | SP (0x20) requires Quoted-string — §4.1.2 | 201 (invite created) |
| `.user@example.com` | Local-part starts with dot — §3.4.1 (per RFC 2822 dot-atom-text) | 201 (invite created) |
| `us..er@example.com` | Consecutive dots in local-part — §3.4.1 | 201 (invite created) |
| `user.@example.com` | Local-part ends with dot — §3.4.1 | 201 (invite created) |
| `a,b@example.com` | Comma in local-part requires Quoted-string — §4.1.2 | 201 (invite created) |

Compare with what the validator DOES reject (correct):

| Email pattern | Result |
|---|---|
| `tab\tuser@example.com` | 400 "Valid email is required" |
| `bad\nuser@example.com` | 400 "Valid email is required" |
| domain w/ unicode (`x@пример.рф`) | 400 |
| domain w/ leading/trailing dot | 400 |
| local part > 64 chars | 400 |
| domain label > 63 chars | 400 |
| empty | 400 |

## Ожидаемое

Per BUG-REG-020 commit message ("tighten invite email validation per RFC 5321"), the validator should reject all unquoted local-part syntactic violations. Concretely:
- Reject `@` inside unquoted local-part (multi-`@` emails)
- Reject SP/HTAB/comma/`(`/`)`/`<`/`>`/`:`/`;`/`"`/`,`/`[`/`]`/`\` in unquoted local-part
- Reject leading/trailing/consecutive `.` in local-part
- Either accept Quoted-string local-parts properly OR reject all special-char locals uniformly

Expected status: **400 "Email is invalid"** (or similar) for all six patterns above.

## Фактическое

All six patterns return **201 Created** with a real invite UUID and persist a row in `user_invite` table.

## Network / Console

```
POST /api/auth/invites
→ 201 { "id": "<uuid>", "email": "a@b@c.example.com", ... }
```

(see `evidence/probe-block-02-emails.txt` for full stdout dump)

## Hypothesis (не утверждение)

`backend/src/auth/email-validation.util.ts` — `validateInviteEmail()`:
- Uses `lastIndexOf('@')` which makes `a@b@c.com` parse as local=`a@b`, domain=`c.com` and accepts because the @ in local is not in the rejected character set.
- The local-part character loop only rejects control chars `< 0x20`, `0x7f`, `<`, `>`. SP (0x20), `,`, `.` (leading/trailing/consecutive), `@`, etc. are not on the deny list.
- No dot-atom rules enforced on local-part.

Possible fix: tighten the local-part check to a dot-atom-text regex (e.g. `/^[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+)*$/`) and reject any local-part not matching dot-atom-text (deferring Quoted-string support since the MVP doesn't accept quoted email addresses).

## Impact

- **Direct:** these invites can be created but cannot be accepted by anyone — the invitee literally cannot receive email at e.g. `.user@example.com` because mail servers will reject it. Result: junk rows in `user_invite`.
- **Indirect:** if a future flow surfaces the invite email (UI rendering, audit log, copy-link button) and an admin manually crafts a similar string, it can become a phishing/UX trap (e.g. `admin@evil.com@trusted.com` — `lastIndexOf('@')` parses domain as `trusted.com`, which the admin reads but mail clients route to `evil.com`).
- **Data hygiene:** BUG-REG-020 SLA was "tighten invite email validation per RFC 5321"; partial completion means audit trail of which patterns are/aren't blocked is unclear.

## Acceptance criteria

1. All six patterns above return 400 with a validation error.
2. Existing valid emails (`user@example.com`, `user+tag@example.com`, `user.name@example.com`) still 201.
3. Unit test added under `backend/src/auth/email-validation.util.spec.ts` covering at least these 6 patterns + 3 valid baselines.

## Out of scope

- Internationalized email addresses (IDN domains, UTF-8 local-parts) — separate ticket if needed.
- Quoted-string local-parts (e.g. `"a b"@example.com`) — keep rejecting in MVP.

## Evidence

- `docs/regression/2026-05-19-full-regression-post-wave-2/scripts/probe-block-02-emails.cjs` (reproduction script)
- `docs/regression/2026-05-19-full-regression-post-wave-2/evidence/block-02-report.json` (Block 2 full report — scenario 2.4)
- Six invite UUIDs persisted in local DB (cleanup TODO during regression close)
