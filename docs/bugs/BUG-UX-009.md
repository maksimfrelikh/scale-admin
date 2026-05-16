# BUG-UX-009 — Store details tabs create page-level horizontal overflow for operator on narrow screens

## Title
Operator Store Details tabs expand beyond mobile/tablet viewport, especially prices/log table sections.

## Severity
High

## Area
Frontend responsive UX — Operator Store Details

## Environment
- Production: `https://maksimfrelikh.ru`
- Tested: 2026-05-16
- Viewports: 390x844, 430x932, 768x1024, 1024x768 orientation swap
- Role: Operator

## Preconditions
Authenticated operator QA user with at least one assigned store.

## Steps to reproduce
1. Open production in a 390x844 or 430x932 mobile viewport.
2. Sign in as an operator QA user.
3. Open **Stores**.
4. Tap **Details** for an assigned store.
5. Scroll through the store details tabs/sections.
6. Repeat at 768x1024 and after orientation/viewport swap.

## Expected result
Store Details tabs remain within the viewport. Wide tables should be contained in their own horizontal-scroll wrappers without widening the whole page, and action controls should remain reachable.

## Actual result
Store Details expands wider than the viewport:
- 390x844 and 430x932 mobile runs reported Store Details layout width ~983 px.
- 768x1024 tablet run reported document/body scroll width 983 px.
- Orientation-swapped 768 px width also reported document/body scroll width 983 px.

Table sections inside Store Details, including price/log-related tables, produce off-screen content and force page-level horizontal overflow rather than staying contained.

## Evidence
- Sanitized metrics: `docs/evidence/mobile-regression-2026-05-16.json`
- Relevant entries: operator `store-details-all-tabs`, `store-details-after-scroll`, and `orientation-swapped-current-view`.

## User impact
Operators on phones/tablets may miss right-side table columns/actions and must rely on horizontal panning/scrolling to inspect store details, prices, and logs.

## Workaround
Use a desktop-width viewport.

## Suggested fix direction
Audit Store Details child tabs for minimum-width tables/cards escaping their wrappers:
- apply `min-width: 0` to parent grid/flex children;
- keep wide tables inside `overflow-x: auto` wrappers that do not increase document width;
- consider mobile card layouts for prices/logs;
- verify both portrait and landscape breakpoints.

## Status
Confirmed
