# UX Regression — Navigation and Route Consistency — 2026-05-16

## Scope
Focused frontend UX/runtime regression testing for navigation and route consistency only.

Production target: `https://maksimfrelikh.ru`

Roles tested:
- Admin QA account
- Operator QA account

Credentials, passwords, tokens, and secret values were not stored in this report, evidence, logs, or summaries.

## Method
- Browser automation: Chromium headless via Playwright Docker image.
- Backend health checked before testing: `GET /api/health` returned `200 OK` with service status `ok`.
- SPA tested through real production origin and hash routes.
- Network errors, failed requests, console errors, visible route state, selected nav state, refresh behavior, history behavior, logout/session changes, and 401 behavior were inspected.
- Business workflows such as catalog editing/publishing were not tested.

Sanitized evidence:
- `docs/evidence/navigation-regression-2026-05-16.json`

## Overall result
**FAIL** for navigation/runtime consistency.

Core sidebar navigation, direct valid hash opening, refresh on valid routes, and browser history mostly work for both roles. However, confirmed runtime/navigation defects remain around auth invalidation, malformed route recovery, multi-tab logout consistency, and operator access-denied route copy.

## Coverage performed

### Admin
Checked:
- Sidebar navigation: Overview, Stores, Products, Create store, Global Logs, Users & Access.
- Hash transitions: root, `#stores`, `#products`, `#store-create`, `#global-logs`, `#users-access`.
- Direct route opening for valid and invalid hashes.
- Browser refresh on routes.
- Browser back/forward after route transitions.
- Selected menu state for main routes.
- Multi-tab route opening with shared session.
- Logout from protected hash route.
- 401 behavior after cookie/session removal while SPA state remained mounted.

### Operator
Checked:
- Sidebar navigation: Overview, Stores, Products.
- Operator nav restriction display.
- Direct route opening for valid, admin-only, and invalid hashes.
- Browser refresh on routes.
- Browser back/forward after route transitions.
- Selected menu state for visible routes.
- Multi-tab route opening with shared session.
- Logout from protected hash route.
- 401 behavior after cookie/session removal while SPA state remained mounted.

## Passing observations
- `https://maksimfrelikh.ru/api/health` returned healthy production backend status.
- Admin sidebar navigation updated hash and active nav state correctly for:
  - Overview/root;
  - `#stores`;
  - `#products`;
  - `#global-logs`;
  - `#users-access`.
- Admin `#store-create` direct open and refresh rendered the New store route with Stores menu group active.
- Operator sidebar navigation updated hash and active nav state correctly for:
  - Overview/root;
  - `#stores`;
  - `#products`.
- Browser refresh preserved valid route rendering for checked valid routes.
- Browser back/forward restored prior hash route content for checked valid route sequences.
- Opening `#stores` and `#products` in separate tabs did not by itself desynchronize the visible route content between tabs.
- Operator sidebar did not expose admin-only navigation buttons.

## Confirmed defects

### BUG-UX-001 — SPA keeps authenticated dashboard visible after successful logout and session 401
Status: existing confirmed bug remains reproducible in this navigation/runtime scope.

Observed during this run:
- Single-tab logout from protected route returned `POST /api/auth/logout` → `200`, followed by `GET /api/auth/session` → `401`.
- SPA still displayed the authenticated dashboard on the protected hash route after waiting.
- Clearing cookies/session while SPA stayed mounted, then navigating to another protected route, produced API `401` errors but the dashboard remained visible until hard refresh.

Bug report:
- `docs/bugs/BUG-UX-001.md`

### BUG-UX-002 — Malformed hash routes render broken protected panels and backend errors
Status: new confirmed bug.

Observed during this run:
- `#store:` rendered a broken store route with Stores selected, no meaningful route heading, and malformed backend request returning `404`.
- `#product-edit:does-not-exist` rendered a broken product edit route with Products selected and backend `500`.
- Refreshing these malformed routes reproduced the same broken state for admin and operator.

Bug report:
- `docs/bugs/BUG-UX-002.md`

### BUG-UX-003 — Multi-tab navigation can make logout fail with stale CSRF state
Status: new confirmed bug.

Observed during this run:
- After opening a second protected route in another tab, logout from the first tab returned `403`.
- The first tab remained on the protected dashboard route and showed a CSRF/form-expired alert.
- This creates a navigation/session safety issue because normal multi-tab route use can block logout.

Bug report:
- `docs/bugs/BUG-UX-003.md`

### BUG-UX-004 — Operator direct-open of Global Logs shows incorrect access-denied copy
Status: new confirmed bug.

Observed during this run:
- Operator direct-open of `#global-logs` correctly denied access, but displayed heading `Users & Access is admin-only`.
- Same incorrect copy persisted after refresh.

Bug report:
- `docs/bugs/BUG-UX-004.md`

## Additional observations
- Unknown hash `#does-not-exist` renders the overview content while preserving the invalid hash. This did not create a dead-end during testing, but a cleaner redirect or route-not-found state would be more consistent.
- Operator direct-open of admin-only routes leaves no active selected menu item because those routes are not present in the operator sidebar. This is acceptable if intentional, but the route-specific denied copy must be correct.
- Console errors were observed for expected unauthenticated/session probes and for confirmed malformed route/backend failures. No separate unrelated failed network requests were confirmed in the tested scope.

## Not tested / intentionally out of scope
- Catalog editing.
- Publishing flow.
- Product/store create/save business workflow correctness.
- Price editing.
- User invite or access management workflow behavior beyond route visibility/copy.
- Scale device workflows.

## Final assessment
**FAIL** for the tested navigation/runtime scope.

Valid navigation basics are mostly functional, but production still has user-visible SPA consistency failures:
- authenticated dashboard remains visible after logout/session 401;
- malformed hash routes create broken/dead-end panels and backend errors;
- multi-tab route use can make logout fail;
- operator admin-only route messaging is inconsistent.

Navigation/runtime coverage for this session is complete; testing stopped at the requested scope.
