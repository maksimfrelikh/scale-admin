# 5.7 - Edge cases: banner-only / RBAC / concurrent

**Verdict:** PASS 11/12 assertions (1 bug filed BUG-REG-070, atomicity preserved)

## 5.7.A — Banner-only change creates new version (PRD §6.9 / §6.11)

- PATCH banner sortOrder 1→2 → 200
- POST /catalog-publish (no other changes) → 201
- v3: versionNumber=3, basedOnVersionId=v2.id (`3913b1d6-...`)
- v3.packageData.advertising.banners[0].sortOrder = 2 (new value)
- v3.packageChecksum = `920d59ae2d39...` (different from v2's, snapshot is fresh)

**Conclusion:** banner-only changes are first-class publishable diffs.

## 5.7.B — RBAC: operator publishes foreign store

- Admin created Wave5 Foreign Test Store (`bb6c1d1c-...`).
- Operator session (unit-cusp-slam, assigned STORE-001 only) attempts:

| Method | Path | Result |
|--------|------|--------|
| POST | `/api/stores/<foreign>/publishing/catalog-publish` | 403 |
| GET | `/api/stores/<foreign>/publishing/catalog-validation` | 403 |
| GET | `/api/stores/<foreign>/publishing/catalog-versions` | 403 |

**Watchpoint cleared:** 🔴 operator publishes for store он НЕ assigned (RBAC bypass) → **CLEAN**.
StoreAccessGuard at `publishing.controller.ts:17` (`@RequireStoreAccess('storeId', 'params')`) enforces store membership before the handler runs, byte-identical to W2 §2.4 pattern.

## 5.7.C — Concurrent publish race

- Two separate operator sessions (independent cookie jars, independent CSRF tokens), parallel POST `/catalog-publish` on STORE-001.
- Result: A→500, B→201 vn=5.
- COUNT(CatalogVersion) advanced by exactly 1 (was 4, now 5).
- currentVersionId moved exactly once (to v5).

**Atomicity intact:** only one version row created; no duplicate versionNumber; no torn state.

**BUG-REG-070 (medium) filed** — loser surfaces as 500 instead of 409 with structured `CATALOG_VERSION_RACE_CONFLICT` code. Root cause: `@@unique([catalogId, versionNumber])` violation thrown as Prisma P2002 (or P2034 in Serializable) not caught in `catalog-publishing.service.ts:105-171`. No data integrity impact; API contract issue only.

## Pre-race noise

The first concurrent attempt (single cookie jar, two CSRFs fetched back-to-back) hit a CSRF-rotation race instead of a publish race: A→403 CSRF_TOKEN_INVALID, B→201 vn=4. This is the same documented W4 §4.8.5a behavior (CSRF token rotates and invalidates the previous binding). The §5.7.C retry uses two separate sessions for a clean publish-race proof, identical to W4 §4.8.5b methodology.

`concurrent-A-csrf-rotation-race.json`, `concurrent-B-csrf-rotation-race.json` preserve the noisy run for transparency.

## Assertions

| # | Assertion | Result |
|---|-----------|--------|
| 1 | Banner-only PATCH 200 | PASS |
| 2 | /publish 201 produces new version | PASS |
| 3 | v3.versionNumber == v2 + 1 | PASS |
| 4 | v3.basedOnVersionId == v2.id | PASS |
| 5 | v3.packageData reflects banner sortOrder change | PASS |
| 6 | Foreign-store POST /publish → 403 | PASS |
| 7 | Foreign-store GET /validation → 403 | PASS |
| 8 | Foreign-store GET /catalog-versions → 403 | PASS |
| 9 | Concurrent race: exactly one 201 | PASS |
| 10 | Concurrent race: exactly one new version row | PASS |
| 11 | Concurrent race: currentVersionId advances exactly once | PASS |
| 12 | Concurrent race: loser returns 409 with structured code | **FAIL → BUG-REG-070 (medium)** |

## Files

- `5.7a-banner-only.txt`, `banner-patch.json`, `publish-v3-banner-only.json`
- `5.7b-rbac.txt` (3 foreign-store probes)
- `race-A.json` (500), `race-B.json` (201 vn=5), `race-versions.json` (post-race list)
- `concurrent-A-csrf-rotation-race.json`, `concurrent-B-csrf-rotation-race.json` (noisy pre-race)
