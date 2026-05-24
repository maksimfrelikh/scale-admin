# §1.5 Session id regeneration / fixation defense — staging
Date: 2026-05-24T10:59:26Z

## Natural pre-vs-post-login (cookie-name-collision smoke)
- Pre-login cookies in jar: scale_admin_staging_csrf only.
- No session cookie before login (server only issues session cookie on successful login).
- Post-login cookies in jar: scale_admin_staging_csrf, scale_admin_staging_session.
- Session cookie length (post-login): 43.
- CSRF cookie length (pre): 43, (post): 43.
- CSRF cookie value rotated by /api/auth/csrf re-issue between probes: no. (Each call to /api/auth/csrf issues a fresh token + cookie pair — see csrf.service.ts:41.)

## Planted-cookie fixation defense
- Sent POST /api/auth/login with planted Cookie 'scale_admin_staging_session=<attacker value, len 65>'.
- Server issued a Set-Cookie session header on the response: length=43.
- New cookie value equals planted: no.
- Session probe using the planted value alone: 401 "Требуется авторизация". The attacker's planted value never becomes a valid session.

## Conclusion
PASS — login does not reuse a pre-existing session cookie value; the server always mints a fresh session token via createSessionToken() (session-token.util.ts:3-5) and overwrites whatever value the client sent. Session fixation via cookie-planting is not feasible.
