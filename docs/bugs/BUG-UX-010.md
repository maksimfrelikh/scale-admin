# BUG-UX-010 — Admin dashboard/store overview cards do not fit narrow viewports

## Title
Admin dashboard overview/stores layouts force wider-than-device content on mobile and slight overflow on tablet landscape.

## Severity
Medium

## Area
Frontend responsive UX — Admin dashboard and store list/overview

## Environment
- Production: `https://maksimfrelikh.ru`
- Tested: 2026-05-16
- Viewports: 390x844, 430x932, 1024x768
- Role: Admin

## Preconditions
Authenticated admin QA user.

## Steps to reproduce
1. Open production in a 390x844 or 430x932 viewport.
2. Sign in as an admin QA user.
3. Observe the dashboard overview.
4. Navigate to **Stores**.
5. Repeat at 1024x768 tablet landscape.

## Expected result
Dashboard cards, store panels, and action buttons fit within the viewport. Buttons wrap or stack without forcing a wider page.

## Actual result
Admin layout expands beyond the intended viewport width:
- 390x844 dashboard overview measured layout/document width ~682 px.
- 430x932 dashboard overview measured layout/document width ~682 px.
- 390x844/430x932 Stores page measured layout width ~535 px.
- 1024x768 dashboard overview measured document/body scroll width 1063 px.

This indicates page-level responsive overflow. Action rows/cards can become clipped or require horizontal movement instead of stacking cleanly.

## Evidence
- Sanitized metrics: `docs/evidence/mobile-regression-2026-05-16.json`
- Relevant entries: admin `dashboard-overview`, `stores`, and `tablet1024l dashboard-overview`.

## User impact
Admin users on phones/tablets get a layout that does not truly fit the device width; important dashboard/store controls may be partially clipped or awkward to access.

## Workaround
Use a wider viewport/desktop.

## Suggested fix direction
Review dashboard and store overview responsive constraints:
- add `min-width: 0` to grid/flex children;
- allow long headings/action rows to wrap;
- stack section heading rows earlier;
- ensure button labels do not set minimum panel width beyond viewport.

## Status
Confirmed
