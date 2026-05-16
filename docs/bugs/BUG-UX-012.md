# BUG-UX-012 — Store detail page remains stale in another open tab after store edit

## Title
Store detail page remains stale in another open tab after store edit.

## Severity
Medium

## Area
Frontend UX/runtime — multi-tab cache consistency, RTK Query store detail data

## Environment
- Production: `https://maksimfrelikh.ru`
- Tested: 2026-05-16
- Browser automation: Chromium via Playwright
- Role: Admin QA user
- Route/page: `/#store:<storeId>`

## Preconditions
- Admin QA user is authenticated in multiple tabs in the same browser context.
- A QA test store exists for cache/session regression testing.

## Steps to reproduce
1. Open production and sign in as the admin QA user.
2. Open Tab C on the QA store detail route, `/#store:<storeId>`.
3. In another authenticated tab, edit the same store name.
4. Return to Tab C without hard refresh.
5. Navigate away from the detail route, then reopen the same `/#store:<storeId>` route.

## Expected result
The store detail page should revalidate or show current store data after the same entity is changed in another tab.

## Actual result
The store detail page kept showing the previous store name. The stale detail state persisted after leaving and reopening the same store detail route. Hard refresh recovered the current value.

## Evidence
- Evidence file: `docs/evidence/cache-session-regression-2026-05-16.json`
- Relevant check: `cross-tab-store-detail-cache-after-edit`: FAIL
- Observed values in evidence:
  - `staleDetail: true`
  - `staleAfterRouteReturn: true`
  - `refreshRecovered: true`
- Network observation: no automatic `/api/stores/:id` revalidation was observed in the stale tab before hard refresh.

## User impact
A user can leave a store detail page open and unknowingly view outdated store metadata after another tab/session updates it. This is especially risky for admin workflows that rely on detail pages as the source of truth.

## Workaround
Hard-refresh the detail tab before relying on current store metadata.

## Suggested fix direction
Consider entity-level cross-tab cache invalidation/revalidation:
- invalidate `Stores` detail tags across tabs after store mutations;
- refetch store detail on focus or when reopening the same hash route;
- use `BroadcastChannel`/storage events to notify other tabs about store updates.

## Status
Confirmed
