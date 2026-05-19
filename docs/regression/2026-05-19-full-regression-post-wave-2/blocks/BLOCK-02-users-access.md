# BLOCK 2 — Users & Access

**Verdict:** PASS-with-1-bug
**Time:** ~2 min
**Scripts:** `scripts/block-02-users-access.cjs`, `scripts/probe-block-02-emails.cjs`
**Report JSON:** `evidence/block-02-report.json`

## Scenarios

| ID | Scenario | Expected | Actual | Verdict |
|---|---|---|---|---|
| 2.1 | Admin GET /api/users — list | 200 + ≥2 users | 200 + 26 users, both qa-admin and qa-operator present | ✅ |
| 2.2 | Admin GET /api/users/:id (own profile) | 200 + own email | 200 + qa-admin@gmail.com | ✅ |
| 2.3 | Invite create — valid email + valid expiresAt | 201 + invite token | (corrected via probe — initial test missed expiresAt) 201 ✅ | ✅ |
| 2.4 | Invite create — invalid emails (RFC 5321) | 400 for all | 4 of 10 patterns wrongly accepted → **BUG-REG-039** | ❌ |
| 2.5 | GET /api/auth/invites | endpoint may not exist | 404 — endpoint not implemented (no admin listing) | ⏭️ (out of MVP) |
| 2.6 | Invite revoke | n/a | skipped (no invite ID from 2.3 with broken expiresAt) | ⏭️ (covered by probe) |
| 2.7 | Password-reset request — existing vs non-existent | both 200, same shape (no enumeration) | both 200, identical payload shape, only `tokenExpiresAt` ms differs | ✅ |
| 2.8 | UI /password-reset — static notice | renders static notice | renders notice "Обратитесь к администратору" (BUG-REG-025 closure) | ✅ |
| 2.9 | Operator forbidden from user-mgmt | 403 on /users, 403 on POST invites, 404 on GET invites (no endpoint) | 403/403/404 | ✅ |
| 2.10 | Operator UI does NOT show "Users & Access" nav | nav link absent | absent | ✅ |

## Adjacent finding — BUG-REG-039

**Severity:** medium
**Title:** Invite email validation accepts several RFC 5321 violations (BUG-REG-020 fix incomplete)

Six unquoted-local-part patterns create invites with HTTP 201:
- `a@b@c.com` (multiple `@`)
- `has space@example.com` (SP without quoting)
- `.user@example.com` (leading dot)
- `us..er@example.com` (consecutive dots)
- `user.@example.com` (trailing dot in local-part)
- `a,b@example.com` (comma without quoting)

Validator does correctly reject: control chars (tab/newline), unicode domains, label-length violations, total-length violations, missing `@`, empty, domain leading/trailing/consecutive-dot.

See `docs/regression/2026-05-17/bugs/BUG-REG-039-invite-email-rfc5321-gaps.md` for full repro + acceptance criteria.

## Issues / Notes

- `/api/auth/invites` has no GET — list endpoint is admin-only and just doesn't exist. Confirmed by reading `backend/src/auth/auth.controller.ts` — only POST + accept exist. Not a regression; MVP shape.
- Password reset is correctly stateless from the caller's POV — same 200 response for existing/non-existent emails, no enumeration leak.
- 6 garbage invites in local DB (`user_invite` table) from BUG-REG-039 probe. Will leave for now — they don't affect tests for downstream blocks. (Cleanup noted in final SUMMARY.)

## Stack state at end of block

Local docker, CORS=localhost, +6 garbage invites in local `user_invite`.

## New BUG-REG opened
- **BUG-REG-039** (medium) — Invite email validation gaps
