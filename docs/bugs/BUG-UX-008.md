# BUG-UX-008 — Global Logs layout forces page-level horizontal overflow on mobile/tablet

## Title
Global Logs page expands far wider than narrow/tablet viewports, clipping filters and log tables.

## Severity
High

## Area
Frontend responsive UX — Admin Global Logs

## Environment
- Production: `https://maksimfrelikh.ru`
- Tested: 2026-05-16
- Viewports: 390x844, 430x932, 768x1024, 1024x768
- Role: Admin

## Preconditions
Authenticated admin session.

## Steps to reproduce
1. Open production in a narrow/mobile viewport, e.g. 390x844 or 430x932.
2. Sign in as an admin QA user.
3. Navigate to **Global Logs**.
4. Repeat at 768x1024 and 1024x768.

## Expected result
Global Logs remains usable within the viewport. Filters stack or wrap, log tables scroll inside their own table containers, and the page itself does not require horizontal scrolling to reach controls/content.

## Actual result
Global Logs forces a very wide page/content layout:
- 390x844 mobile run expanded CSS/layout width to ~1377 px.
- 430x932 mobile run expanded CSS/layout width to ~1376 px.
- 768x1024 tablet run reported document/body scroll width 1376 px.
- 1024x768 tablet run reported document/body scroll width 1376 px.

Filters and log table content extend beyond the viewport; right-side columns/fields are not visible without horizontal movement, making the page hard to use on narrow screens.

## Evidence
- Sanitized metrics: `docs/evidence/mobile-regression-2026-05-16.json`
- Relevant entries: admin `global-logs` for `mobile390`, `mobile430`, `tablet768p`, `tablet1024l`.

## User impact
Admin users on phones/tablets cannot comfortably inspect or filter logs. Important log columns and filter controls are clipped/off-screen.

## Workaround
Use a wider desktop viewport or manually pan/scroll horizontally where the browser permits it.

## Suggested fix direction
Make the Global Logs layout responsive:
- constrain log cards to `max-width: 100%` / `min-width: 0` inside grid/flex parents;
- ensure `.logs-table-wrap` owns horizontal scrolling without expanding the page;
- stack/wrap filter fields and action buttons at tablet/mobile breakpoints;
- test with 390, 430, 768, and 1024 px viewport widths.

## Status
Confirmed
