# BUG-UX-002 — Malformed hash routes render broken protected panels and backend errors

## Title
Malformed hash routes render broken protected panels and backend errors instead of recovering to a safe route

## Severity
Medium

## Area
Frontend routing, hash-route validation, route recovery, error handling

## Environment
- Production: `https://maksimfrelikh.ru`
- Browser automation: Chromium headless via Playwright Docker image
- Date: 2026-05-16
- Roles tested: admin QA account, operator QA account
- Credentials, passwords, tokens, and secret values were not stored in this report.

## Preconditions
1. User is authenticated as admin or operator.
2. Browser can open direct hash routes on the production SPA.

## Steps to reproduce
1. Log in as admin or operator.
2. Open `https://maksimfrelikh.ru/#store:` directly.
3. Refresh the same route.
4. Open `https://maksimfrelikh.ru/#product-edit:does-not-exist` directly.
5. Refresh the same route.
6. Observe rendered content, selected navigation state, console, and API responses.

## Expected result
The SPA should validate hash route parameters and recover predictably:
- empty or invalid IDs should not call malformed backend endpoints;
- route should redirect/fallback to a valid list/overview route or show a clear not-found state;
- page should retain a meaningful header/body and no dead-end blank panel;
- invalid product/store IDs should not surface generic backend/internal errors as the main UX.

## Actual result
For both admin and operator:
- `#store:` renders with `Stores` selected, but no meaningful page heading/content.
- API request is made to a malformed endpoint: `/api/stores//publishing/catalog-versions` → `404`.
- The user-facing error is `Cannot GET /api/stores/publishing/catalog-versions`.
- `#product-edit:does-not-exist` renders with `Products` selected, but no meaningful page heading/content.
- API request `/api/products/does-not-exist` returns `500`.
- The user-facing error is generic `Internal server error`.
- Refreshing these malformed hash routes reproduces the same state.

## Evidence
Sanitized evidence file:
- `docs/evidence/navigation-regression-2026-05-16.json`

Relevant observations:
- Admin direct `#store:`: active nav `Stores`, no `h2`, alert `Cannot GET /api/stores/publishing/catalog-versions`, HTTP `404`.
- Operator direct `#store:`: same result.
- Admin direct `#product-edit:does-not-exist`: active nav `Products`, no `h2`, alert `Internal server error`, HTTP `500`.
- Operator direct `#product-edit:does-not-exist`: same result.

## User impact
Medium impact:
- Users can land in dead-end or confusing protected pages by opening/copying malformed hash URLs.
- Browser refresh preserves the broken route.
- Backend errors are exposed as UX instead of route-level recovery.
- This increases support burden and makes SPA route state feel unreliable.

## Workaround
Manually edit the URL hash or use the sidebar to navigate back to `#stores`, `#products`, or the overview route.

## Suggested fix direction
- Validate hash route parameters before rendering route components.
- Treat empty IDs and obviously invalid IDs as route-not-found/client-side validation failures.
- Redirect malformed `#store:` / `#store-edit:` / `#product-edit:` routes to safe list routes or show a dedicated not-found panel.
- Avoid issuing API requests with empty IDs.
- Ensure backend returns `404` rather than `500` for nonexistent product IDs, but frontend should still recover gracefully.

## Status
Confirmed on production for admin and operator on 2026-05-16.
