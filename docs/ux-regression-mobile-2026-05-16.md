# Mobile / Responsive UX Runtime Regression — 2026-05-16

## Scope
Focused frontend UX/runtime regression for mobile and responsive behavior only.

Production target: `https://maksimfrelikh.ru`

Tested viewports:
- 390x844
- 430x932
- 768x1024
- 1024x768
- Orientation/viewport swap where feasible

Roles tested:
- Admin QA account
- Operator QA account

Credential handling: account credentials, passwords, tokens, and secrets are not recorded in this report. Evidence JSON was sanitized; screenshots were not retained because the application header displays QA account identifiers.

## Working directory / artifact location check
- `pwd` before testing: `/home/clawd/projects/scale-admin`
- Required artifact root used: `/home/clawd/projects/scale-admin/docs/`

## Evidence
- Sanitized run evidence: `docs/evidence/mobile-regression-2026-05-16.json`
- Confirmed bugs:
  - `docs/bugs/BUG-UX-008.md`
  - `docs/bugs/BUG-UX-009.md`
  - `docs/bugs/BUG-UX-010.md`

## Coverage performed

### Login / session entry
Status: PASS with caveat
- Login screen loads and accepts narrow viewport interaction.
- No failed network requests were recorded during the responsive run.
- No credential values are stored in final evidence.

Caveat: authenticated admin dashboard immediately exposes responsive overflow issues after login; documented separately as BUG-UX-010.

### Dashboard layout
Status: FAIL
- Admin dashboard overview does not consistently fit mobile/tablet widths.
- Confirmed page/layout widths exceed requested viewports.
- See `BUG-UX-010`.

Operator dashboard was more stable at the tested narrow widths; no separate operator dashboard-only bug confirmed.

### Sidebar/header/navigation
Status: PASS with caveat
- Navigation wraps into multiple rows on narrow screens and remains tappable.
- Admin navigation items remained reachable.
- Operator navigation note remained visible in tested paths.

Caveat: navigation itself was not the primary overflow source, but pages opened from navigation can overflow.

### Store list layout
Status: FAIL for admin, PASS for operator tested store list
- Admin Stores page expanded beyond 390/430 mobile viewport width.
- Operator assigned-store list remained usable in the tested mobile paths.
- See `BUG-UX-010` for admin store/dashboard responsive overflow.

### Store details tabs
Status: FAIL for operator responsive behavior
- Operator Store Details expanded to ~983 px layout/document width on 390/430 mobile and 768 tablet paths.
- Price/log table sections contribute off-screen content and page-level overflow.
- See `BUG-UX-009`.

### Tables on narrow screens
Status: FAIL for Global Logs and Operator Store Details; PASS/acceptable for Product catalog wrappers
- Product catalog tables were wide internally but remained contained by horizontal-scroll wrappers in tested runs; no page-level overflow was confirmed there.
- Admin Global Logs produced page-level overflow up to ~1376 px and clipped filters/table content.
- Operator Store Details produced page-level overflow around ~983 px.
- See `BUG-UX-008` and `BUG-UX-009`.

### Forms and modals on narrow screens
Status: PASS for tested forms; modals not confirmed in this scope
- Admin Create Store form stacked correctly at narrow widths.
- Admin Create Product form stacked correctly at narrow/tablet widths.
- Users & Access form mostly worked, with a minor 1024 px overflow observed, but not filed separately because stronger related layout failures are already documented.

### Buttons/action bars visibility
Status: FAIL in affected layouts
- Dashboard/store/global logs action areas can force wider layouts or become clipped.
- Store Details table/action content can move off-screen.
- Covered by `BUG-UX-008`, `BUG-UX-009`, `BUG-UX-010`.

### Horizontal overflow / clipped text / unreachable controls
Status: FAIL
Confirmed page-level overflow:
- Admin Global Logs: ~1376 px document/body width at 768/1024 tablet and expanded mobile layout widths.
- Operator Store Details: ~983 px document/body width at 768 tablet and mobile Store Details paths.
- Admin dashboard/stores: 535–682 px mobile layout width and 1063 px at 1024 landscape.

### Scroll behavior
Status: FAIL where page-level horizontal overflow is required
- Vertical scrolling works.
- Horizontal page overflow is required or implied in affected layouts, which is a mobile UX failure.

### Touch-size issues
Status: Not separately failed
- Many controls are close to mobile minimum size, but no control was confirmed unusable solely due to touch target size in this pass.
- The more severe issue is layout overflow/clipping.

### Orientation / viewport changes
Status: FAIL for affected Store Details path
- Operator Store Details remained wider than a 768 px orientation-swapped viewport.
- See `BUG-UX-009`.

## Bug list

| Bug | Severity | Summary | Status |
| --- | --- | --- | --- |
| BUG-UX-008 | High | Global Logs forces page-level horizontal overflow on mobile/tablet | Confirmed |
| BUG-UX-009 | High | Operator Store Details tabs/tables force page-level horizontal overflow | Confirmed |
| BUG-UX-010 | Medium | Admin dashboard/store overview cards do not fit narrow viewports | Confirmed |

## Final assessment for this scope
FAIL.

Mobile/responsive coverage found confirmed user-impacting overflow defects in admin Global Logs, operator Store Details, and admin dashboard/store overview layouts. The app is not ready to PASS mobile/responsive UX regression for the tested scope.
