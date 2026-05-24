# 5.4 - Immutability

**Verdict:** PASS 16/16 assertions

## Routes that exist (allowed)

- GET `/api/stores/:storeId/publishing/catalog-versions` → 200, returns `{currentVersion, versions[]}` (list only)
- (Note: GET single `/catalog-versions/:id` does NOT exist → returns 404 — published packageData is only re-served via the original publish response. The PRD `8.2 Catalog Publishing Flow` only requires that published versions be readable by **scales** via `/api/scales/check-update` which serves `packageData`. Admin/operator only sees metadata via list endpoint. **Documented design deviation, not a bug**.)

## Mutation routes — all reject as expected

| Method | Path | Result |
|--------|------|--------|
| PATCH | `/api/stores/:storeId/publishing/catalog-versions/:id` | 404 (route absent) |
| PUT | same | 404 |
| DELETE | same | 404 |
| POST | same | 404 |
| PATCH | `/api/stores/:storeId/publishing/catalog-versions/:id/republish` | 404 |
| PATCH | `/api/stores/:storeId/publishing/catalog-versions/:id/status` | 404 |
| PUT/DELETE/POST variants | same | 404 |
| PATCH | `/api/catalog-versions/:id` (no store prefix) | 404 |
| PUT | same | 404 |
| DELETE | same | 404 |

## Indirect tampering paths — also rejected

- **PATCH `/api/stores/:storeId` with `{currentVersionId: <bogus-uuid>}`** → 400 "Укажите хотя бы одно поле магазина" (StoresService allow-list rejects `currentVersionId` as unknown field; verified post-state still v1).
- **Re-running POST `/catalog-publish` does not mutate v1** — it creates a new CatalogVersion (versionNumber+1, basedOnVersionId=v1.id) per §5.6. The pre-existing v1 row is immutable.

## Code path

- `publishing.controller.ts:14` declares only `GET catalog-versions`, `POST catalog-publish`, `GET/POST catalog-validation`, `GET/POST catalog-package`. No update/delete handlers.
- `catalog-publishing.service.ts:86-194` opens a Serializable transaction and only `.create`s — no `.update()` or `.delete()` on `catalogVersion`.
- `stores.service.ts` update allow-list does not include `currentVersionId`.

## Assertions

| # | Assertion | Result |
|---|-----------|--------|
| 1 | GET catalog-versions list returns v1 (200) | PASS |
| 2 | PATCH /catalog-versions/:id → 404 | PASS |
| 3 | PUT /catalog-versions/:id → 404 | PASS |
| 4 | DELETE /catalog-versions/:id → 404 | PASS |
| 5 | POST /catalog-versions/:id → 404 | PASS |
| 6 | PATCH /:id/republish → 404 | PASS |
| 7 | PUT /:id/republish → 404 | PASS |
| 8 | DELETE /:id/republish → 404 | PASS |
| 9 | POST /:id/republish → 404 | PASS |
| 10 | PATCH /:id/status → 404 | PASS |
| 11 | PUT /:id/status → 404 | PASS |
| 12 | DELETE /:id/status → 404 | PASS |
| 13 | POST /:id/status → 404 | PASS |
| 14 | PATCH/PUT/DELETE /api/catalog-versions/:id (no prefix) → 404 | PASS |
| 15 | PATCH /api/stores/:id with currentVersionId field → 400 (allow-list rejects) | PASS |
| 16 | currentVersion still v1 after all tampering probes | PASS |

## Watchpoint cleared

**🔴 published CatalogVersion mutable through any endpoint** → CLEAN. No mutation routes exist; allow-list blocks indirect tampering.

## Files

- `get-versions.json` — listing showing v1 intact
- `5.4-probes.txt` — full probe transcript (saved below)
