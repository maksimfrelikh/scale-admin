# BUG-UX-004 — Operator direct-open of Global Logs shows incorrect access-denied copy

## Title
Operator direct-open of Global Logs shows Users & Access access-denied copy

## Severity
Low

## Area
Frontend route messaging, operator RBAC UX, direct hash route consistency

## Environment
- Production: `https://maksimfrelikh.ru`
- Browser automation: Chromium headless via Playwright Docker image
- Date: 2026-05-16
- Role tested: operator QA account
- Credentials, passwords, tokens, and secret values were not stored in this report.

## Preconditions
1. User is authenticated as operator.
2. User opens admin-only hash routes directly.

## Steps to reproduce
1. Log in as operator.
2. Open `https://maksimfrelikh.ru/#global-logs` directly.
3. Refresh the same route.
4. Compare the route/hash to the displayed access-denied panel text.

## Expected result
The access-denied panel should match the route being opened:
- `#global-logs` should explain that Global Logs are admin-only;
- `#users-access` should explain that Users & Access is admin-only.

## Actual result
For operator direct-open of `#global-logs`:
- URL hash remains `#global-logs`.
- Sidebar does not expose Global Logs, which is expected.
- Access-denied panel heading says `Users & Access is admin-only`.
- Same incorrect copy persists after browser refresh on `#global-logs`.

## Evidence
Sanitized evidence file:
- `docs/evidence/navigation-regression-2026-05-16.json`

Relevant observations:
- Operator direct open `#global-logs`: hash `#global-logs`, no active admin nav item, `h2` = `Users & Access is admin-only`.
- Operator refresh `#global-logs`: same result.

## User impact
Low impact:
- Operator sees a misleading error message for a different admin-only section.
- This can confuse support/reproduction when users report route access problems.

## Workaround
None needed for security; access is denied. The issue is incorrect route-specific UX copy.

## Suggested fix direction
Use route-specific access-denied messages or pass the denied route/section name into the access-denied component.

## Status
Confirmed on production for operator on 2026-05-16.
