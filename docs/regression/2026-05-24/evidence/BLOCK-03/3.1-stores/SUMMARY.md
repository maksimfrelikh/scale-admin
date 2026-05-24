# 3.1 Stores CRUD — SUMMARY

**Verdict:** ✅ PASS
**Probes:** 19 (4 POST happy/neg, 4 PATCH happy, 4 PATCH neg, 2 GET happy, 1 GET 404, 1 list, 2 status-transition, 1 archive list-filter)

## Probes & results

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 01 | POST create STORE-WAVE3-01 active | 201 + mainCatalog status=active | 201, mainCatalog id=f023319f-…, status=active, currentVersionId=null | ✅ |
| 02 | POST dup code | 409 | 409 "Магазин с таким кодом уже существует" | ✅ |
| 03 | POST bad timezone (>128 chars) | 400 | 400 "Часовой пояс магазина должен быть не длиннее 128 символов" | ✅ |
| 04 | POST create STORE-WAVE3-02 inactive | 201 + mainCatalog null | 201, mainCatalog=null | ✅ |
| 05 | GET list | 200, 3 stores | 200, STORE-001+WAVE3-01+WAVE3-02 | ✅ |
| 06 | GET by id (WAVE3-01) | 200 | 200 | ✅ |
| 07 | PATCH name | 200, updated | 200, name=Renamed | ✅ |
| 08 | PATCH timezone | 200, updated | 200, tz=Asia/Yekaterinburg | ✅ |
| 09 | PATCH status active→inactive | 200 | 200 | ✅ |
| 10 | PATCH status inactive→active | 200 | 200 | ✅ |
| 11 | PATCH bad status | 400 | 400 "Статус магазина должен быть active, inactive или archived" | ✅ |
| 12 | PATCH empty body | 400 | 400 "Укажите хотя бы одно поле магазина" | ✅ |
| 13 | PATCH status inactive→archived (WAVE3-02) | 200 + cascade marker | 200, cascade.correlationId populated, all dependents empty (none created yet) | ✅ |
| 14 | GET list (post-archive) | 2 stores (archived hidden) | 200, count=2 (STORE-001 + WAVE3-01), WAVE3-02 filtered out | ✅ |
| 15 | GET archived by id | 200 (direct lookup) | 200, status=archived returned | ✅ |
| 16 | GET unknown id 00000000-… | 404 | 404 "Магазин не найден" | ✅ |
| 17 | PATCH bad tz on update | 400 | 400 | ✅ |
| 18 | POST missing code | 400 | 400 "Код магазина обязателен..." | ✅ |
| 19 | POST missing name | 400 | 400 "Название магазина обязательно..." | ✅ |

## PRD verification

- **§6.3 auto-create primary active StoreCatalog on active store create** — ✅ verified (probe 01 returned `mainCatalog: {id, status:"active", currentVersionId:null}`).
- **active-vs-inactive gating of auto-catalog** — ✅ verified (probe 04 returned `mainCatalog: null` for inactive-created store).
- **archive filter on list** — ✅ list endpoint applies `status: { not: 'archived' }` by default (stores.service.ts:46-48).
- **archive cascade** — service computes `isCascadeArchive` and returns cascade payload with `correlationId`. Probe 13 shows empty arrays for storeCatalogs/categories/placements/prices/banners/scaleDevices because no dependents were created on WAVE3-02 — cross-entity archive cascade verification is deferred to 3.7 with WAVE3-01 (where dependents will exist).

## Entities created

- STORE-WAVE3-01 id=`3e38beb9-10cc-47d0-b700-d18e91fd351f`, status=active (renamed, tz=Asia/Yekaterinburg)
- STORE-WAVE3-02 id=`2fcd6729-abad-4378-a5dc-ce0c5a8e6e50`, status=**archived**
- mainCatalog for WAVE3-01 id=`f023319f-e2c5-476e-91cd-888df97bb62f`

## Evidence files

`01-create-active.txt(.raw)` … `19-post-no-name.txt(.raw)` — all under `evidence/BLOCK-03/3.1-stores/`.

## Bugs filed

None.
