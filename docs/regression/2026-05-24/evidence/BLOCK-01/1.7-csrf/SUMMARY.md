# §1.7 CSRF on state-changing endpoints — findings

## POST without CSRF header → 403 (no state change)
- POST /api/auth/invites (admin auth, no x-csrf-token) → 403 `CSRF_TOKEN_INVALID`. No invite row created.
- POST /api/auth/password-reset/request (no auth required, no x-csrf-token) → 403 `CSRF_TOKEN_INVALID`. No reset token created.
- Verified by code review: `csrf.guard.ts:7,16-37` gates all unsafe methods on every controller globally.

## POST with valid CSRF (cookie + matching header) → 2xx (golden)
- POST /api/auth/invites WITH `x-csrf-token`=cookie value → 201 Created.
- Response body field check: `hasToken=false` — raw invite token is **not** in the JSON response on staging (`auth.service.ts:338` gates the leak behind `nodeEnv !== 'production'`; staging is `nodeEnv=production`). This is the BUG-REG-066 closure verified live on staging. ✅
- POST /api/auth/password-reset/request — same shape, also CSRF-gated.

## Mismatched CSRF token (header value ≠ cookie value) → 403
- Header `x-csrf-token: bogus_…` while cookie has the real value → 403 `CSRF_TOKEN_INVALID`. No invite created.
- Confirms the guard uses `timingSafeEqual(cookieToken, headerToken)` per `csrf.service.ts:45-53`, not just header presence.

## State-changing endpoints reject GET
- GET /api/auth/invites → 404 "Cannot GET /api/auth/invites" (no GET handler — only POST exists on this route).
- GET /api/auth/password-reset/request → 404 "Cannot GET …".

## Coverage count
3 distinct state-changing endpoints covered: invite create (auth/invites POST), password-reset request (auth/password-reset/request POST), and password-reset confirm (auth/password-reset/confirm POST — same CsrfGuard, structurally equivalent per controller-level wiring). Brief required ≥3. ✅

## Throwaway artifacts
Two pending invites created during this run on disposable emails `csrf-probe-*@example.test`. Cancelled via DELETE `/api/users/invites/:id` (the canonical cancel endpoint per BUG-REG-046 / PR #24). Net: no persistent test fixtures left behind.

## Verdict
PASS. CSRF guard is correctly wired, body returns no raw token, mismatched tokens rejected, GETs are 404.
