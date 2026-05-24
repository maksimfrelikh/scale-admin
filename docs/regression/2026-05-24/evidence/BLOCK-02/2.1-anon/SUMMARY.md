# 2.1 Anonymous baseline — SUMMARY

Verdict: **PASS** (with brief-prediction deviation, see note).

10 probes run against staging without any session (empty `anon-jar.txt`) and without `Origin` mutation tokens.

| # | Method | Path | Status | Body shape |
|---|---|---|---|---|
| 01 | GET | `/api/users` | 401 | `{"message":"Требуется авторизация","error":"Unauthorized","statusCode":401}` |
| 02 | GET | `/api/stores` | 401 | same as 01 |
| 03 | GET | `/api/stores/{S001}/catalog/categories` | 401 | same as 01 |
| 04 | GET | `/api/products` | 401 | same as 01 |
| 05 | GET | `/api/stores/{S001}/prices` | 401 | same as 01 |
| 06 | GET | `/api/stores/{S001}/advertising/banners` | 401 | same as 01 |
| 07 | GET | `/api/logs/global` | 401 | same as 01 |
| 08 | GET | `/api/stores/{S001}/scales` | 401 | same as 01 |
| 09 | POST | `/api/stores` | 403 | `{"message":"Сессия формы истекла...","error":"Forbidden","code":"CSRF_TOKEN_INVALID","statusCode":403}` |
| 10 | POST | `/api/auth/logout` | 403 | same as 09 |

## Findings

- **All 8 GETs:** identical 401 body (byte-identical `Content-Length: 95`). No role hints, no "user not found"/"email exists", no endpoint-specific differentiation. Body is fully localized Russian. ✓
- **Both POSTs:** identical 403 CSRF body (byte-identical `Content-Length: 192`). The brief predicted 401, but staging applies CSRF middleware **before** `SessionGuard`. This is **not a security defect** — both POST endpoints surface the same generic "form session expired" message, no info leak about endpoint or user state. Order is defense-in-depth (CSRF can't be skipped by simply omitting auth).
- **No information disclosure across the matrix:** every endpoint (admin-only, operator-allowed, store-scoped, scale-CRUD, audit logs) returns the same authentication-denied body shape to an anonymous caller.

## Deviation from brief

Brief §2.1 expected POSTs to also return 401 ("no CSRF/auth → 401 before 400"). Observed: 403 CSRF_TOKEN_INVALID. Documented and accepted — the body is still uniform and doesn't leak. The brief's prediction conflated CSRF and auth ordering; actual implementation is CSRF→Session→Roles→StoreAccess.

## Evidence

Raw redacted curl responses: `01-get-users.txt` .. `10-post-logout.txt` in this directory.
