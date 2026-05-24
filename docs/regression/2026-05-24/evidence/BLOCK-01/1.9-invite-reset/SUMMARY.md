# §1.9 Invite / reset — dummy token + real-flow leak check

## Frontend dummy-token pages
- GET /accept-invite?token=dummy-not-a-real-token → 200, 422-byte SPA shell, **no raw token** in HTML, no stack-trace markers.
- GET /reset-password?token=dummy-not-a-real-token → 200, 422-byte SPA shell, **no raw token** in HTML, no stack-trace markers.
- Server-side response is the SPA shell only; actual error rendering happens client-side via the SPA's API call. Static-HTML grep is clean.
- Browser-DOM check (document.body.innerHTML grep after SPA hydration) is **deferred** — Tester §3 browser-tool not available in this Manager-inline run. Code review (`frontend/src/features/auth/AcceptInvitePage.tsx` and `ResetPasswordPage.tsx` — not enumerated here) is consistent with the API-only token usage pattern: the SPA reads the token from query, sends it in a POST body, and never echoes it back to the DOM in the success/error path. The HTTP responses below confirm no server-side echo.

## API with dummy token
- POST /api/auth/invites/accept with dummy token → 404 `{"message":"Приглашение не найдено","error":"Not Found","statusCode":404}`. No raw token in body or headers. No 500. ✅
- POST /api/auth/password-reset/confirm with dummy token → 400 `{"message":"Ссылка для сброса пароля недействительна","error":"Bad Request","statusCode":400}`. No raw token in body or headers. No 500. ✅

## Real invite create — BUG-REG-066 regression check
- POST /api/auth/invites with a real disposable-email invite → 201.
- Response body top-level keys (verified live): `["invite"]`. **Top-level "token" field: absent.** Nested `invite.token`: absent.
- Full body: `{"invite":{"id":"834f33c1-382d-4314-a8be-b6135389449c","email":"wave1-invite-leak-probe-1779620755@example.test","role":"operator","expiresAt":"2026-05-25T11:05:55.000Z","acceptedAt":null,"createdAt":"2026-05-24T11:05:55.945Z"}}`
- This confirms BUG-REG-066 (nonprod raw auth token responses) closure is live on staging — `auth.service.ts:338` gates the token leak on `nodeEnv !== 'production'`, and staging is `nodeEnv=production` (per /api/version environment field).

## Real password reset request — BUG-REG-066 regression check
- POST /api/auth/password-reset/request for the seeded admin → 200.
- Response body: `{"accepted":true,"tokenExpiresAt":"2026-05-24T12:05:56.286Z"}`
- **No token field** in body. Same gating per `auth.service.ts:503`. ✅
- Nonexistent email → same shape 200 (no user enumeration via pwreset). ✅

## Verdict
PASS for all checks executable in this run. The brief's "DOM grep via document.body.innerHTML after hydration" is deferred — needs browser tool; recommended for next browser-enabled regression cycle.

## Throwaway artifacts
1 real invite created (`wave1-invite-leak-probe-…@example.test`) and cancelled via DELETE /api/users/invites/:id (200 `{cancelled:true}`).
1 password-reset token created for qa-admin@example.com. Token is unreachable (sent to email — Resend/disabled provider on staging) and will expire in 60 minutes per default `passwordResetTokenTtlMinutes=60`. Not a hygiene risk.
