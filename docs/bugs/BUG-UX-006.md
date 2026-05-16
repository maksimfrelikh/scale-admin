# BUG-UX-006 — Operator foreign-store 403 can leave stale assigned-store details and controls visible

## Title
Operator foreign-store 403 can leave stale assigned-store details and controls visible

## Severity
High

## Area
RBAC frontend runtime state / stale data after forbidden response

## Environment
Production: `https://maksimfrelikh.ru`
Browser: Playwright Chromium headless
Date: 2026-05-16
Account role: Operator QA account

## Preconditions
- Operator is logged in.
- Operator has at least one assigned store.
- At least one admin-visible store exists that is not assigned to the operator.
- Operator first opens an assigned store details page successfully.

## Steps to reproduce
1. Open an assigned store as operator: `https://maksimfrelikh.ru/#store:<assigned-store-id>`.
2. Confirm the store details page loads with catalog/prices/forms sections.
3. Without refreshing, directly navigate in the same SPA session to a foreign store: `https://maksimfrelikh.ru/#store:<foreign-store-id>`.
4. Observe the UI after the backend returns forbidden responses.
5. Refresh the browser while still on the foreign-store hash.

## Expected result
After a foreign-store `403`, the UI should clear prior store data and controls immediately, then show a clean forbidden/error state for the requested foreign store. It must not leave an assigned store’s details or interactive controls visible under the foreign-store URL.

## Actual result
The backend correctly returns `403`, but the SPA initially leaves the previous assigned store’s details and many store controls visible under the foreign-store hash. The page shows forbidden errors above stale assigned-store content.

After a hard refresh on the same foreign-store hash, the stale content disappears and only the forbidden errors remain.

## Evidence
- Initial allowed route: `https://maksimfrelikh.ru/#store:<assigned-store-id>` → store details loaded successfully.
- Forbidden route: `https://maksimfrelikh.ru/#store:<foreign-store-id>`.
- Network observations on forbidden navigation:
  - `GET /api/stores/<foreign-store-id>` → `403`
  - `GET /api/stores/<foreign-store-id>/publishing/catalog-versions` → `403`
- UI after forbidden response: two `Недостаточно прав для выполнения запроса.` messages are shown, but stale assigned-store details and controls remain visible, including catalog, banner, device, price and history controls.
- Refresh recovers state: Yes — hard refresh on the foreign-store hash clears stale store details/controls and leaves only forbidden errors.
- Sanitized run evidence: `docs/evidence/rbac-regression-2026-05-16.json` (`operator direct foreign store details after assigned store`, `operator-refresh-on-foreign-store-forbidden`).

## User impact
This is a serious RBAC/frontend consistency defect. Even though backend access control denies the foreign store, the operator temporarily sees stale details and interactive controls from an allowed store while the URL points to a forbidden store. This can mislead users, cause edits/actions to be performed in the wrong context, and undermine confidence in store isolation.

## Workaround
Hard refresh the page after any forbidden store access, or navigate back to `Stores` before opening another store.

## Suggested fix direction
When the store query argument changes or returns an error, clear previous successful store data before rendering dependent child sections. Gate child tabs/controls on the current route store ID matching a successful current response, and render a single forbidden/error state on `403`.

## Status
Open
