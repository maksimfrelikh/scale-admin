# BUG-UX-001 — SPA keeps authenticated dashboard visible after successful logout

## Title
SPA keeps authenticated dashboard visible after successful logout and session 401

## Severity
High

## Area
Frontend auth/session runtime, RTK Query session invalidation, protected hash routes

## Environment
- Production: `https://maksimfrelikh.ru`
- Browser automation: Chromium headless via Playwright
- Date: 2026-05-16
- Roles tested: admin QA account, operator QA account
- Credentials, passwords, tokens, and secret values were not stored in this report.

## Preconditions
1. User is authenticated as admin or operator.
2. Browser is on protected route `https://maksimfrelikh.ru/#stores`.

## Steps to reproduce
1. Open `https://maksimfrelikh.ru`.
2. Log in with a QA account.
3. Navigate to `https://maksimfrelikh.ru/#stores`.
4. Click `Logout`.
5. Observe the route, visible UI, and auth/session network requests.
6. Without refreshing, click visible protected controls such as `Refresh` or navigate to `Products`.
7. Hard refresh the browser on the same hash route.

## Expected result
After logout succeeds, the SPA must immediately transition to a valid unauthenticated state:
- protected dashboard content is removed;
- login screen is shown, or user is redirected to an unauthenticated route;
- protected controls are no longer visible/clickable;
- stale session/user data is cleared;
- 401 from `/api/auth/session` is handled as unauthenticated state without requiring manual refresh.

## Actual result
For both admin and operator:
- `POST /api/auth/logout` returns `200`.
- Follow-up `GET /api/auth/session` returns `401`.
- SPA remains on `/#stores`.
- Dashboard remains visible with previous role/session presentation and `Logout` still visible.
- Protected route navigation via browser back/forward keeps showing protected dashboard content after logout.
- Clicking visible protected controls after logout triggers API `401` responses and inline auth errors, but the app still does not transition to the login screen.
- Hard refresh finally recovers the UI to the login screen while retaining the hash route.

## Evidence
Sanitized evidence files:
- `docs/auth-regression-evidence-2026-05-16.json`
- `docs/auth-post-logout-controls-evidence-2026-05-16.json`

Relevant network observations from reproduction:

Admin and operator logout from `/#stores`:
- `POST /api/auth/logout` → `200`
- `GET /api/auth/session` → `401`
- UI remained dashboard instead of login.

Post-logout protected controls:
- Admin: `GET /api/stores` → `401`, `GET /api/products` → `401`
- Operator: `GET /api/stores` → `401`, `GET /api/products` → `401`
- UI remained authenticated dashboard with inline authorization error.

Hard refresh recovery:
- Refreshing `https://maksimfrelikh.ru/#stores` after logout sends `GET /api/auth/session` → `401` and displays the login screen.

## User impact
High impact:
- Users believe they are still logged in after logout.
- Protected/stale data remains visible on screen after the server session is invalidated.
- Users can continue navigating stale protected SPA routes and encounter broken/partial UI with 401 errors.
- Shared-device/logout expectations are violated until manual hard refresh.

## Workaround
Manual browser refresh after logout returns the SPA to the login screen. This is not acceptable as the primary logout behavior.

## Suggested fix direction
- On successful logout, explicitly clear cached auth/session/user state and protected query data.
- Treat `401` from `/api/auth/session` as authoritative unauthenticated state even when previous session data exists in RTK Query cache.
- Consider `api.util.resetApiState()` or equivalent cache/session clearing after logout and on session 401.
- Navigate to a stable unauthenticated route or clear protected hash route after logout.
- Ensure protected route components unmount immediately when session becomes invalid.

## Status
Confirmed on production for admin and operator on 2026-05-16.
