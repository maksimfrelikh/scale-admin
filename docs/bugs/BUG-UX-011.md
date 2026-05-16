# BUG-UX-011 — Store list remains stale in another open tab after store edit

## Title
Store list remains stale in another open tab after store edit and route/history navigation.

## Severity
Medium

## Area
Frontend UX/runtime — multi-tab cache consistency, RTK Query store list data

## Environment
- Production: `https://maksimfrelikh.ru`
- Tested: 2026-05-16
- Browser automation: Chromium via Playwright
- Role: Admin QA user
- Route/page: `/#stores`

## Preconditions
- Admin QA user is authenticated in multiple tabs in the same browser context.
- A QA test store exists for cache/session regression testing.

## Steps to reproduce
1. Open production and sign in as the admin QA user.
2. Open Tab B on `/#stores` and confirm the QA store is visible.
3. In another authenticated tab, edit the same store name.
4. Return to Tab B without hard refresh.
5. Navigate away to `/#products`, then back to `/#stores`.
6. Use browser back/forward around the affected routes.

## Expected result
The Stores list should revalidate or otherwise reflect the updated store name after another tab mutates store data, especially after route return or browser history navigation.

## Actual result
Tab B continued showing the previous store name after the edit. The stale value persisted through route switch away/back and browser back/forward. Hard refresh/manual refresh recovered the correct value.

## Evidence
- Evidence file: `docs/evidence/cache-session-regression-2026-05-16.json`
- Relevant checks:
  - `cross-tab-store-list-after-edit-without-refresh`: FAIL
  - `stale-rtk-data-after-route-switch-away-and-back`: FAIL
  - `browser-back-forward-after-store-mutation`: FAIL
  - `hard-refresh-recovers-store-list-cache`: PASS
- Network observation: no automatic `/api/stores` revalidation was observed in the stale tab during route return/history checks.

## User impact
Admins/operators can see outdated store records in already-open tabs after changes are made elsewhere. This can lead to wrong operational decisions or repeated edits against stale visible state.

## Workaround
Use the page Refresh button or hard-refresh the browser tab before relying on the Stores list.

## Suggested fix direction
Consider cross-tab/session cache revalidation for store list data:
- enable RTK Query `refetchOnFocus` / `refetchOnReconnect` and/or route remount revalidation where appropriate;
- use `BroadcastChannel` or storage events to invalidate caches across tabs after mutations;
- revalidate list queries when returning to `/#stores` if cached data may be stale.

## Status
Confirmed
