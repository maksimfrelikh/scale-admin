# UX Regression Auth/Session Runtime — 2026-05-16

## Scope
Focused frontend runtime/UX regression for authentication and session behavior only.

Production target: `https://maksimfrelikh.ru`

Roles tested:
- Admin QA account
- Operator QA account

Credentials, passwords, tokens, cookies, CSRF values, and secret values were not written to this report.

## Result
FAIL

A stale-authenticated SPA state after logout was reproduced for both admin and operator.

## Evidence
Sanitized evidence files:
- `docs/auth-regression-evidence-2026-05-16.json`
- `docs/auth-post-logout-controls-evidence-2026-05-16.json`

Confirmed bug report:
- `docs/bugs/BUG-UX-001.md` — SPA keeps authenticated dashboard visible after successful logout

## Checks performed

### Backend availability
- `GET https://maksimfrelikh.ru/api/health` → `200`

### Direct protected hash route without session
Routes checked in fresh unauthenticated browser contexts:
- `https://maksimfrelikh.ru/#stores`
- `https://maksimfrelikh.ru/#products`
- `https://maksimfrelikh.ru/#users-access`

Observed:
- `GET /api/auth/session` → `401`
- Login screen displayed.
- Protected dashboard content was not visible.

Status: PASS

### Login
Both roles:
- Login completed successfully.
- `POST /api/auth/login` → `200`
- Follow-up `GET /api/auth/session` → `200`
- Dashboard displayed for the authenticated role.

Status: PASS

### Refresh while authenticated
Both roles on `/#stores`:
- Browser refresh preserved authenticated dashboard state.
- `GET /api/auth/session` → `200`
- Protected route remained usable.

Status: PASS

### Logout from `/#stores`
Both roles:
- `POST /api/auth/logout` → `200`
- Follow-up `GET /api/auth/session` → `401`
- SPA stayed on `/#stores`.
- Dashboard and protected controls remained visible.
- Login screen did not appear until hard refresh.

Status: FAIL — see `docs/bugs/BUG-UX-001.md`

### 401 handling after logout
Both roles after logout:
- Clicking visible protected `Refresh` controls triggered protected API requests returning `401`.
- Navigating to `Products` after logout triggered `GET /api/products` → `401`.
- UI still remained in authenticated dashboard shell with inline authorization error instead of transitioning to login.

Status: FAIL — covered by `BUG-UX-001`

### Browser back/forward after logout
Both roles:
- After logout from `/#stores`, browser back moved to `/#products`.
- Browser forward returned to `/#stores`.
- In both directions, the SPA continued showing authenticated dashboard content after server session invalidation.

Status: FAIL — covered by `BUG-UX-001`

### Hard refresh after logout
Both roles:
- Hard refresh on `/#stores` after logout recovered to login screen.
- `GET /api/auth/session` → `401`
- Protected content was removed only after refresh.

Status: PASS as recovery behavior; FAIL as logout UX because manual refresh is required.

## Coverage notes
Covered only auth/session/runtime behavior requested in this pass:
- login;
- logout;
- session invalidation;
- protected hash routes;
- direct protected routes without session;
- refresh behavior;
- browser back/forward behavior after logout;
- 401 handling;
- stale authenticated UI state;
- broken/protected controls after auth changes;
- RTK Query/session invalidation behavior;
- loading/error handling during auth transitions.

Catalog, prices, publishing, and data-management flows were not tested except where protected buttons/routes were used to reproduce auth/runtime behavior.

## Final assessment
Authentication/session runtime scope is not production-passable until `BUG-UX-001` is fixed. The backend invalidates the session, but the SPA keeps stale authenticated state and protected UI visible after logout.
