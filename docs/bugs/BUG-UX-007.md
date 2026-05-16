# BUG-UX-007 — SPA remains in authenticated dashboard after 401/session loss

## Title
SPA remains on authenticated dashboard with stale data after a 401 unauthenticated response.

## Severity
High

## Area
Frontend auth/session runtime; failed-request recovery; protected route handling.

## Environment
- Production: https://maksimfrelikh.ru
- Date: 2026-05-16
- Roles tested: admin and operator
- Routes/pages: `/#stores` / Stores page

## Preconditions
- User is logged in as either admin or operator.
- Stores page has already loaded data.
- Session becomes invalid while the SPA remains mounted. In the test this was safely simulated by clearing browser cookies, then triggering a Stores refresh.

## Steps to reproduce
1. Log in as admin or operator.
2. Navigate to `/#stores`.
3. Let the Stores list load.
4. In the same browser context, invalidate the session cookies while keeping the SPA mounted.
5. Click `Refresh` on Stores.

## Expected result
- On HTTP 401, the SPA transitions to a valid unauthenticated state.
- Protected dashboard navigation and stale protected data are removed or hidden.
- User is sent to the login screen, or a clear re-authentication flow is shown without interactive authenticated UI.

## Actual result
- Stores refresh returns HTTP 401.
- The dashboard remains visible with `Logout`, protected navigation, and previously loaded Stores data still rendered.
- A generic authorization error is displayed inline, but the route remains interactive-looking and authenticated in appearance.
- A hard browser refresh recovers to the login screen.

## Evidence
- `docs/evidence/error-loading-regression-2026-05-16.json`
- Evidence check IDs:
  - `admin-401-session-expiry-recovery`
  - `operator-401-session-expiry-recovery`
- HTTP/network observation: `GET /api/stores` returned 401 after session invalidation.
- Refresh recovery: yes, hard refresh returns to login.

## User impact
Users with expired/revoked sessions can remain on a stale authenticated dashboard with old protected data and controls visible. This is confusing, undermines session-state correctness, and can mislead users into thinking they are still authenticated until a hard refresh.

## Workaround
Hard refresh the browser page after the authorization error; the app then returns to login.

## Suggested fix direction
Normalize 401 handling in the RTK Query base layer or auth/session slice: clear cached session/user state, invalidate protected cached data, and redirect/render login on unauthenticated responses from protected endpoints.

## Status
Confirmed on production.
