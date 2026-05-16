# BUG-UX-005 — Operator direct admin-only store form routes silently render overview while forbidden hash remains

## Title
Operator direct admin-only store form routes silently render overview while forbidden hash remains

## Severity
Medium

## Area
RBAC frontend routing / forbidden route handling

## Environment
Production: `https://maksimfrelikh.ru`
Browser: Playwright Chromium headless
Date: 2026-05-16
Account role: Operator QA account

## Preconditions
- Operator is logged in.
- Operator account has at least one assigned store.

## Steps to reproduce
1. Open `https://maksimfrelikh.ru/#store-create` directly as an operator.
2. Observe the rendered page and URL hash.
3. Open `https://maksimfrelikh.ru/#store-edit:<assigned-store-id>` directly as the same operator.
4. Observe the rendered page and URL hash.

## Expected result
Admin-only store creation/edit routes should either:
- render a clear access-denied state for the requested route; or
- redirect/hash-replace to a safe allowed route.

The UI state and URL should not disagree.

## Actual result
The SPA keeps the forbidden hash (`#store-create` or `#store-edit:<id>`) but renders the operator overview/dashboard instead of an access-denied page or redirecting to a valid route.

## Evidence
- Routes/pages:
  - `https://maksimfrelikh.ru/#store-create`
  - `https://maksimfrelikh.ru/#store-edit:<assigned-store-id>`
- UI state: operator dashboard/assigned-store overview is shown.
- URL state: forbidden admin-only hash remains in the address bar.
- Network observations: no admin-only create/edit request was sent during direct route open.
- Refresh recovers state: No; refresh on the same hash continues rendering the operator overview with the forbidden hash.
- Sanitized run evidence: `docs/evidence/rbac-regression-2026-05-16.json` (`operator direct store-create`, `operator direct assigned store-edit`).

## User impact
The application enters an inconsistent route/UI state. Operators are not exposed to admin data, but the URL indicates an admin-only page while the UI shows a different allowed page, which makes forbidden-route recovery and support diagnosis confusing.

## Workaround
Click an allowed navigation item such as `Stores` or `Overview` to replace the hash.

## Suggested fix direction
Handle unauthorized `store-create` and `store-edit` views explicitly for non-admin users: render route-specific access denied or replace the hash with a valid operator route.

## Status
Open
