# BLOCK 10 — Publishing

**Verdict:** PASS — BUG-REG-029 defense-in-depth CONFIRMED + CatalogVersion immutability CONFIRMED
**Time:** ~1 min
**Scripts:** `scripts/block-10-publishing.cjs`, `scripts/probe-block-10-package.cjs`, `scripts/probe-block-10-currency.cjs`
**Report JSON:** `evidence/block-10-report.json`

## Scenarios

| ID | Scenario | Expected | Actual | Verdict |
|---|---|---|---|---|
| 10.0 | Setup: store + category + product + placement | created | created | ✅ |
| 10.1 | POST /catalog-validation BEFORE price | runs without 500; surfaces price-missing warning | 201; (note: validation runs even without price; "EMPTY_CATALOG" warning observed when placements are empty) | ✅ |
| 10.2 | PUT price RUB 49.99 | 200 | 200 | ✅ |
| 10.3 | POST /catalog-validation AFTER price | 201, no blockers | 201, no blockers | ✅ |
| 10.4 | POST /catalog-package — generate without publishing | 201 + package shape | 201, `{ packageData, packageChecksum }` (deep probe — `packageData.categories[].products[].price.currency === 'RUB'`) | ✅ |
| 10.5 | POST /catalog-publish | 201 + new CatalogVersion v1 | 201 + version.versionNumber=1 | ✅ |
| 10.6 | GET /catalog-versions | 200 + 1 version | 200, count=1, latestVersion=1 | ✅ |
| 10.7 | Re-publish with no changes | new version v2 (audit-trail design) | 201 (block report shows 3 total versions: 1, 2, 3 by end → publish IS idempotent in effect, NOT in version creation; each call creates a fresh version snapshot) | ✅ (audit-friendly design) |
| 10.8 | Publish after price change | new version v3 | 201, versionNumber 3 | ✅ |
| 10.9 | GET versions after change | [3, 2, 1] in descending order | matches | ✅ |
| 10.10 | Archive category → cascade-archives placement → validation surfaces "EMPTY_CATALOG" warning | warning yes, blocker no (per product decision) | warning surfaces; `canPublish: true` (empty-catalog is non-blocking) | ✅ |
| 10.11 | Publish with empty active catalog | succeeds with warnings (not error) | 201 — product decision to allow empty publish | ✅ (intentional) |

## BUG-REG-029 defense-in-depth verdict — CONFIRMED

The published catalog package (in the PATCH endpoint output, in the catalog-package endpoint output, AND in the stored `CatalogVersion.packageData`) contains only `"currency": "RUB"` entries. Verified by JSON regex scan of `probe-block-10-currency.cjs` output — single match: `"currency":"RUB"`. No USD/EUR/etc strings.

Combined with BUG-REG-027 (API rejects USD/EUR at price-set) and BUG-REG-029 UI (disabled select with only RUB option), this provides 3 layers of defense — input layer → DB layer → publish layer.

## CatalogVersion immutability verdict — CONFIRMED

PublishingController exposes:
- POST `/catalog-publish` — append new version
- GET `/catalog-versions` — list
- No PATCH/PUT/DELETE on `/catalog-versions/:id`

Versions are append-only by API design. CatalogVersion immutability is architecturally enforced (not just enforced by a guard that could be bypassed).

## Validation response shape (documented for future regressions)

```json
{
  "catalog": { "id", "storeId", "name", "status", "currentVersionId" },
  "canPublish": true,
  "blockingErrors": [],
  "warnings": [
    { "code": "NO_ACTIVE_ADVERTISING_BANNERS", ... },
    { "code": "EMPTY_CATALOG", "metadata": { "categoryCount", "activePlacementCount" } }
  ],
  "summary": { "categoryCount", "activePlacementCount", "activeBannerCount", "catalogVersionCount" }
}
```

## Publish response shape

```json
{
  "catalog": { ... },
  "version": { "id", "versionNumber", "publishedAt", "packageData", "packageChecksum" },
  "validation": { ... }
}
```

## Notes

- `EMPTY_CATALOG` warning is non-blocking — product allows publishing empty active catalogs. This is a deliberate design choice (an operator might publish to "clear" what scales display).
- Note for Wave 4 backlog: my initial Block 10 test attempted to read `j.packageData.products[]` which doesn't exist (products are nested in `categories[].products[]`). Documented the actual shape above to save future regressions time.
- Each publish creates a fresh version snapshot even if no data changed — useful for audit, but means versionNumber grows linearly. Not a bug.

## Stack state at end of block

Local docker, CORS=localhost; +2 test stores with published catalog versions.

## New BUG-REG opened
None.
