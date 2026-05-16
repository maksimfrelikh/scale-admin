# UX Regression — Publishing / Validation / Version UI — 2026-05-16

## Scope
Focused frontend UX/runtime regression testing for:
- Versions / Publishing tab
- validation button behavior
- blocking errors and warnings display
- publish button enabled/disabled state
- publish success state
- version history rendering
- stale validation/version behavior
- refresh and browser back/forward behavior
- duplicate-click/loading behavior
- API error display during validation/publish
- operator assigned-store publishing behavior, where available

Out of scope: deep scale API testing.

## Environment
- Production target: `https://maksimfrelikh.ru`
- Browser: Playwright Chromium headless
- Date: 2026-05-16
- Roles used: Admin QA account; Operator QA account attempted
- Evidence: `docs/evidence/publishing-regression-2026-05-16.json`
- QA store: `QA-PUB-20260516151112`
- Route: `/#store:10ea1987-c828-4c41-8b82-d44b1fea3821`

No passwords, tokens, cookies, or secrets were recorded in artifacts.

## Result
**FAIL for tested scope** due to one confirmed frontend/runtime consistency bug:
- `docs/bugs/BUG-UX-003.md` — Publish remains enabled after catalog changes invalidate a successful validation result.

Most core publishing UI behaviors passed: validation loading state, blocking errors, warnings, publish disabled/enabled transitions, publish success, version history refresh, duplicate publish protection, and refresh after publish.

## Checks performed

| Check | Status | Notes |
|---|---:|---|
| Admin login and route load | PASS | Store detail page and `Versions / Publishing` rendered. |
| Validation API error display | PASS | Injected validation failure displayed in alert area; no secret data captured. |
| Validation loading indicator | PASS | `Validating...` appeared during delayed validation request. |
| Duplicate validation click behavior | PASS | One validation POST observed while validation was loading. |
| Blocking errors display | PASS | Missing active positive price showed `ACTIVE_PLACEMENT_PRICE_MISSING`. |
| Publish disabled with blocking errors | PASS | `Publish catalog` disabled while validation had blocking error. |
| Warnings display | PASS | Valid catalog without active banners showed `NO_ACTIVE_ADVERTISING_BANNERS`. |
| Publish enabled after clean validation | PASS | `Ready to publish`, zero blocking errors, publish enabled. |
| Consistency after catalog change | FAIL | UI remained `Ready to publish` and publish stayed enabled after a new unpriced active placement was added. See `BUG-UX-003`. |
| Publish backend protection from stale UI | PASS backend / FAIL UX | Backend rejected stale publish (`400`), but UI allowed the attempt. |
| Refresh after stale validation | PASS | Refresh cleared local validation result and disabled publish. |
| Publish loading indicator | PASS | `Publishing...` appeared during publish request. |
| Duplicate publish click behavior | PASS | One publish POST observed while publishing was loading. |
| Publish success state | PASS | Success message displayed: published version `v1`. |
| Version history rendering | PASS | Version table rendered one row after publish. |
| Stale version data after publish | PASS | Current published catalog and version history updated to `v1`; refresh preserved it. |
| Browser back/forward after publish | PASS | Forward navigation restored store route and publishing section. |
| Operator assigned-store publishing behavior | BLOCKED | Operator account had no assigned stores visible via `/api/stores`, so assigned-store publishing UI could not be observed. |

## Confirmed bug

### BUG-UX-003 — Publish remains enabled after catalog changes invalidate a successful validation result
- Severity: Medium
- Route/page: `https://maksimfrelikh.ru/#store:10ea1987-c828-4c41-8b82-d44b1fea3821`
- Summary: After validation showed `Ready to publish`, adding a new unpriced active placement left the existing validation summary visible and kept `Publish catalog` enabled. Publish request then failed with backend validation error.
- Refresh recovery: Yes; refresh cleared validation state and disabled publish.
- Full report: `docs/bugs/BUG-UX-003.md`

## Network observations
Relevant sanitized network observations from the run:
- `POST /api/stores/{storeId}/publishing/catalog-validation` → `201` for blocking-error validation.
- `POST /api/stores/{storeId}/publishing/catalog-validation` → `201` for clean validation.
- `POST /api/stores/{storeId}/publishing/catalog-publish` → `400` when launched from stale `Ready to publish` UI.
- `POST /api/stores/{storeId}/publishing/catalog-publish` → `201` after rerunning validation against the corrected catalog.
- `GET /api/stores/{storeId}/publishing/catalog-versions` → `200`; version history rendered `v1` after successful publish.

## Notes
- The tested QA catalog intentionally used missing-price and no-banner states to verify blocking error and warning display.
- API setup used QA-only entities and did not perform destructive cleanup.
- No scale API deep testing was performed beyond observing current/published version UI behavior.
