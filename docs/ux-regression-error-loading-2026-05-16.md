# UX Regression — Error, Loading and Failed-request Recovery — 2026-05-16

## Scope
Focused frontend UX/runtime regression testing for error states, loading states and failed-request recovery only.

Production target: https://maksimfrelikh.ru

Roles tested:
- Admin
- Operator

Credential handling: credentials/passwords/tokens were not written to reports, evidence, logs or retained screenshots. Screenshots generated during automation were removed to avoid exposing account identifiers.

## Method
Browser-driven production testing with Playwright plus network observation/interception for safe failed-request scenarios.

Covered:
- Loading indicators on page/session load
- Loading indicators during list fetches and mutations
- Disabled states during pending mutation/refetch
- Duplicate click protection
- 400 validation errors
- 401 unauthenticated errors
- 403 forbidden/admin-only route behavior
- 404 not found errors
- 409 conflict/duplicate errors
- Stale UI after failed requests
- Recovery/retry after failed requests
- Error message clarity
- Empty states where reachable in tested pages
- Network failure display and retry
- Browser refresh recovery after failed requests
- Browser back/route recovery after failed request routes where applicable
- Console/runtime errors and failed network requests

Out of scope by request:
- Scale API testing
- Deep publishing/catalog business-flow testing

## Summary
Overall result: **FAIL for tested scope** due to stale authenticated UI after 401/session loss.

Checks executed: 13
- PASS: 11
- FAIL: 2
- Confirmed bugs: 1

Confirmed bug:
- `docs/bugs/BUG-UX-007.md` — SPA remains on authenticated dashboard with stale data after 401/session loss.

Evidence:
- `docs/evidence/error-loading-regression-2026-05-16.json`

## Results by area

### Loading states
PASS.

Observed loading indicators:
- Initial unauthenticated page: `Checking session...` / `Loading protected session state via RTK Query.`
- Admin dashboard: `Refreshing...` / `Loading admin dashboard...`
- Admin Stores: `Refreshing...` / `Loading stores via RTK Query...`
- Operator dashboard/stores: `Refreshing...` / `Loading assigned stores...`

No stuck spinner was confirmed in this scope.

### Pending mutation disabled state and duplicate click protection
PASS.

Admin Store create was tested with delayed intercepted `POST /api/stores` returning 409. The Save button became disabled during the pending request and a second click did not create a duplicate request.

Observed:
- POST count: 1
- Button disabled during pending request: yes
- Error rendered after response: `Store code already exists`

### 400 validation errors
PASS.

Admin Store create with an over-length timezone generated HTTP 400 and displayed a clear inline error:
- `Store timezone must be at most 128 characters`

No stale success state or misleading success message was observed.

### 401 unauthenticated errors
FAIL.

Admin and operator both remain inside an authenticated-looking dashboard after session invalidation and `GET /api/stores` returns 401. The inline message appears, but protected navigation, Logout and stale Stores data remain visible. Hard refresh recovers to login.

Bug filed:
- `docs/bugs/BUG-UX-007.md`

### 403 forbidden/admin-only behavior
PASS for tested frontend route guard.

Operator direct navigation to `/#users-access` displayed an Access denied panel instead of exposing user-management controls.

Note: this tested the frontend route-guard UX. No unsafe backend write was attempted for 403 generation.

### 404 not found
PASS.

Admin navigation to a nonexistent product edit route displayed `Product not found` and did not leave an editable form visible.

### 409 conflict/duplicate errors
PASS.

Admin Store create conflict returned/displayed a clear duplicate conflict message:
- `Store code already exists`

No duplicate click or misleading success state was observed.

### Network failure and retry recovery
PASS.

Admin and operator Stores requests were safely aborted in-browser. The UI displayed:
- `Backend недоступен. Проверьте, что сервер запущен, и повторите попытку.`

After restoring the route and clicking Refresh, the Stores page recovered and rendered data again.

### Console/runtime errors
No uncaught page errors were recorded.

Expected browser console resource errors were observed for intentionally induced/validated failed requests:
- 401 Unauthorized
- 400 Bad Request
- 404 Not Found
- 409 Conflict
- `net::ERR_FAILED` for simulated network failure

## Final assessment
FAIL for the tested error/loading-state scope until `BUG-UX-007` is fixed.

The main regression risk is auth/session runtime consistency: failed protected requests with 401 do not force the SPA into an unauthenticated state and leave stale protected UI/data visible until hard refresh.
