# BUG-UX-013 — Other open tabs keep protected dashboard UI after logout/session invalidation

## Title
Other open tabs keep protected dashboard UI after logout/session invalidation and do not redirect on 401.

## Severity
High

## Area
Frontend UX/runtime — auth/session revalidation, multi-tab logout handling, protected route consistency

## Environment
- Production: `https://maksimfrelikh.ru`
- Tested: 2026-05-16
- Browser automation: Chromium via Playwright
- Roles: Admin QA user; Operator QA user spot-check
- Route/page: `/#stores`

## Preconditions
- Same QA account is authenticated in multiple tabs in the same browser context.
- One tab remains open on the protected Stores route.

## Steps to reproduce
1. Open production and sign in as a QA user.
2. Open a second tab on `/#stores`.
3. In another tab, invalidate/logout the same session.
4. Return to the still-open Stores tab.
5. Observe the protected UI before interaction.
6. Click the protected **Refresh** action on the stale Stores tab.
7. Hard-refresh the browser tab.

## Expected result
All open tabs should transition to unauthenticated state after logout/session invalidation. If a protected request receives HTTP 401, the SPA should clear protected UI and route/show login instead of keeping the user on an interactive protected page.

## Actual result
The second tab retained the protected dashboard/Stores UI after the session was invalidated in another tab. Clicking protected Refresh produced an HTTP 401, but the SPA remained on the protected route with stale protected UI. Hard refresh recovered and showed the login screen.

The same stale protected UI condition was also observed in an operator QA spot-check after background logout/session invalidation.

## Evidence
- Evidence file: `docs/evidence/cache-session-regression-2026-05-16.json`
- Relevant checks:
  - `background-logout-request-from-another-tab`: PASS, HTTP 200
  - `other-tab-after-logout-before-interaction`: FAIL
  - `stale-tab-interaction-after-logout-401-handling`: FAIL, one HTTP 401 observed
  - `hard-refresh-recovers-after-cross-tab-logout`: PASS
  - `operator-other-tab-after-logout-spot-check`: FAIL
- Console/runtime observation: browser console logged failed protected resources with HTTP 401 during stale-tab auth checks.

## User impact
A logged-out or invalidated session can still appear authenticated in other tabs. Users can attempt protected actions against a dead session and receive confusing inline errors instead of a clean login transition. This is a security/UX consistency issue for shared devices, role changes, blocked users, and expired sessions.

## Workaround
Hard-refresh each open tab after logout/session changes.

## Suggested fix direction
Add global auth failure/session invalidation handling:
- on any normalized 401 from protected APIs, invalidate/clear the `Session` cache and render login;
- broadcast logout/session invalidation across tabs using `BroadcastChannel` or storage events;
- enable session refetch on focus/visibility change for protected routes;
- ensure protected route UI is not left interactive after auth loss.

## Status
Confirmed
