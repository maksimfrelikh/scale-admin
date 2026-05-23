# BUG-REG-041 — security defaults audit

Date: 2026-05-23

Scope: current `main` at `d822052` plus this PR diff. This is an MVP hardening pass, not a broad auth redesign.

## Fixed in this PR

- Production `FRONTEND_ORIGIN` now fails validation unless it is an exact HTTPS origin. This closes the production HTTPS/CORS default gap where `NODE_ENV=production` could boot with `http://...` or a non-origin URL.
- Scale API credentials are no longer accepted from query strings. Devices must send `x-scale-device-code` and `x-scale-api-token` headers, or body credentials on POST routes. This avoids bearer-style secrets in URLs, proxy logs, browser history, and request analytics.
- Image upload is now covered by the existing `RateLimitGuard` with an `upload` bucket.
- The admin invite UI no longer stores or displays a returned invite token. It shows the email-delivery success path only.

## Baseline covered by inspection

- Session cookies are server-side, `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Session tokens are generated randomly and stored only as `UserSession.sessionTokenHash`.
- Login creates a new session token; logout revokes the session and clears the cookie.
- Idle timeout and absolute timeout are enforced in `AuthService.getCurrentSession`.
- Password reset revokes existing user sessions after changing the password.
- CSRF is enforced globally for unsafe web methods; Scale API is explicitly exempt because it uses device token auth.
- Login, password reset, invite accept, Scale API, and now upload have rate limiting.
- Invite and password reset tokens are random, expiring, single-use, and stored by hash only.
- Scale device `apiToken` is generated randomly, stored only as `apiTokenHash`, and returned only on create/regenerate one-time admin actions.
- RBAC and operator store access are backend-enforced by guards; frontend hiding is not the security boundary.
- Upload validation checks extension, magic bytes, size, and uses server-generated filenames.
- Audit log writes go through `AuditLogService` redaction, and frontend-visible log APIs do not select raw audit payload JSON.
- No state-changing domain operation was found using GET. `GET /api/auth/csrf` sets a CSRF cookie by design and does not mutate domain state.

## Deferred findings

- BUG-REG-065: password hashing currently uses PBKDF2-SHA512, while the stricter baseline asks for Argon2id or bcrypt. This needs a compatibility and rehash rollout, so it is not a safe micro-fix.
- BUG-REG-066: production invite/password-reset responses omit raw tokens, but non-production responses can still include raw invite/reset tokens to support local verification with disabled email. Tightening this needs a replacement QA/local delivery path.

## Manual review points

- CSRF cookie is intentionally not `HttpOnly` under the double-submit pattern; the session cookie is `HttpOnly`.
- The in-memory rate limiter is acceptable for the current single-backend VPS deployment. Revisit before horizontal scaling.
- Scale device `apiToken` one-time create/regenerate responses are still an intentional provisioning exception; they must not be logged, persisted in frontend state, or shown again later.

## Deploy status

No staging deploy and no production deploy were performed for BUG-REG-041.
