# 3.2 Products master — SUMMARY

**Verdict:** ✅ PASS
**Probes:** 17 (3 POST happy, 4 POST neg, 1 PATCH happy with warning, 1 PATCH archive, 5 GET search variants, 1 placement happy, 1 placement-on-archived neg, 1 list-category, 1 create-category support)

## Probes & results

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 01 | GET /api/products list baseline | 200 + paginated `{data, meta}` | 200, count=2, keys=['data','meta'] | ✅ |
| 02 | POST PRODUCT-WAVE3-01 full (kg) | 201 | 201, id=a98a4325-…, unit=kg, activePlacementCount=0 | ✅ |
| 03 | POST dup PLU | 409 | 409 "Товар с таким PLU уже существует" | ✅ |
| 04 | POST bad unit `liter` | 400 | 400 "Единица товара должна быть kg, g или piece" | ✅ |
| 05 | POST missing shortName | 400 | 400 "Короткое название товара обязательно..." | ✅ |
| 06 | POST missing PLU | 400 | 400 "PLU товара обязателен..." | ✅ |
| 07 | GET ?search=Wave3 (name) | 1 hit | 1, PRODUCT-WAVE3-01 | ✅ |
| 08 | GET ?search=PRODUCT-WAVE3-01 (PLU) | 1 hit | 1 | ✅ |
| 09 | GET ?search=4900000000031 (barcode) | 1 hit | 1, barcode match | ✅ |
| 10 | GET ?search=W3-SKU-001 (sku) | 1 hit | 1, sku match | ✅ |
| 11 | GET ?search=W3%20Apple (shortName) | 1 hit | 1, shortName match | ✅ |
| 12 | POST category in STORE-WAVE3-01 (support for placement test) | 201 | 201, id=a0d054d8-… | ✅ |
| 13 | POST active placement (CAT + P1) | 201 | 201, id=5c56e459-… | ✅ |
| 14 | **PATCH P1 used-in-active-placement** | 200 + warning marker | 200, warning.code=`PRODUCT_USED_IN_ACTIVE_CATALOG_PLACEMENTS`, message ru, activePlacementCount=1 | ✅ |
| 15 | POST PRODUCT-WAVE3-02 (piece) | 201 | 201, id=95938fd0-… | ✅ |
| 16 | PATCH P2 → archived | 200 + unavailableForNewActivePlacements=true + cascade marker | 200, status=archived, unavailableForNewActivePlacements=true, cascade.correlationId populated | ✅ |
| 17 | **POST active placement using archived P2** | 4xx blocked | **400 "Архивный или неактивный товар нельзя использовать в активном размещении"** | ✅ |

## PRD verification

- **PRD §6.5 required fields** — defaultPluCode/name/shortName/unit all enforced (probes 04-06).
- **PRD §6.5 unit enum {kg, g, piece}** — probe 04 confirms BadRequest on `liter`.
- **defaultPluCode uniqueness** — probe 03 confirms ConflictException on dup.
- **Used-in-catalog warning marker** — probe 14 returns structured `warning: {code, message, activePlacementCount}` alongside successful PATCH (200, not blocked — warning-only).
- **Search supports name + shortName + defaultPluCode + sku + barcode** — probes 07-11 all match expected products.
- **Archived product cannot be added to active placement** — probe 17 returns 400; the product itself also carries `unavailableForNewActivePlacements: true` flag on archive (probe 16).

## Entities created (used in later sub-blocks)

- PRODUCT-WAVE3-01 id=`a98a4325-60dd-4398-8db5-9bcd1f65f75e` — kg, active, placed in CAT (1 active placement)
- PRODUCT-WAVE3-02 id=`95938fd0-7e4d-4608-b713-dfaec72681dd` — piece, **archived**
- Category in STORE-WAVE3-01 id=`a0d054d8-5838-41ae-88e7-d4fde100d3bd`
- Placement id=`5c56e459-1329-49e8-acef-35bffe76015c` (active, P1↔CAT)

## Bugs filed

None.
