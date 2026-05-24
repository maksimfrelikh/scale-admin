# 5.1 — Pre-publish validation (PRD §6.11 blocking errors)

**Verdict:** ✅ PASS 9/9 assertions — 1 bug filed (BUG-REG-069, medium, banner FK→500)
**Codepath cited:** `backend/src/publishing/catalog-validation.service.ts`

| # | Blocker (PRD §6.11) | Validator code | Reachable via API? | Probe result |
|---|---------------------|----------------|--------------------|--------------|
| a | Active placement без price | `ACTIVE_PLACEMENT_PRICE_MISSING` (service:291-298) | ✅ YES | /validate canPublish=false → /publish 400 |
| b | Duplicate PLU | `DUPLICATE_DEFAULT_PLU_CODE` (service:316-337) | ❌ WRITE-TIME GUARDED (PATCH P2.PLU=P1.PLU → 409) | code path exists, defense-in-depth |
| c | Archived product в active placement | `ACTIVE_PLACEMENT_HAS_INACTIVE_PRODUCT` (service:273-281) | ❌ WRITE-TIME GUARDED (POST 400 for archived product; PATCH product→archived cascades placement→archived) | defense-in-depth |
| d | Active placement в archived category | `ACTIVE_PLACEMENT_IN_INACTIVE_CATEGORY` (service:252-259) | ❌ WRITE-TIME GUARDED (cascade-archive when category archived) | defense-in-depth |
| e | Сломанное дерево (cycle/foreign parent) | `CATEGORY_TREE_CYCLE` / `CATEGORY_PARENT_OUTSIDE_CATALOG` (service:189-216) | ❌ WRITE-TIME GUARDED (self-parent 400; bogus parent 400; depth>3 400 per W4 §4.2) | defense-in-depth |
| f | Active product без shortName | `PRODUCT_REQUIRED_FIELDS_MISSING` (service:282-289) | ❌ WRITE-TIME REQUIRED (POST empty shortName 400; PATCH empty 400) | defense-in-depth |
| g | Без defaultPluCode | `PRODUCT_REQUIRED_FIELDS_MISSING` (service:282-289) | ❌ WRITE-TIME REQUIRED (POST empty PLU 400; PATCH empty 400) | defense-in-depth |
| h | Invalid banner (FileAsset/URL) | `ACTIVE_BANNER_IMAGE_URL_MISSING` / `ACTIVE_BANNER_FILE_REFERENCE_MISSING` (service:340-391) | ❌ WRITE-TIME GUARDED (javascript:/data: 400, empty url 400; FK→500 = **BUG-REG-069**) | code path + bug filed |

## Reachable scenario (5.1.a) — full proof

1. Pre-state: catalog has 0 active placements, canPublish=true.
2. POST placement P1 (`108816a8-…`) in CAT_ROOT without price → 201.
3. GET `/api/stores/STORE-001/publishing/catalog-validation`:
   ```json
   { "canPublish": false,
     "blockingErrors": [{"code":"ACTIVE_PLACEMENT_PRICE_MISSING","message":"У товара в активном размещении нет активной положительной цены для магазина.","metadata":{"productId":"108816a8-…","storeId":"e4d711db-…"}}],
     "warnings": [...EMPTY_CATALOG-related...],
     "summary": { ... } }
   ```
4. POST `/api/stores/STORE-001/publishing/catalog-publish` → **HTTP 400**, payload `{"message":"В каталоге есть блокирующие ошибки проверки, поэтому его нельзя опубликовать","validation":{...full validation snapshot...}}`.
5. Fix: PUT `/api/stores/STORE-001/prices/<P1>` with `{price:99.99}` → 200. validate canPublish=true.

## Why most blockers are write-time guarded

PRD §6.11 says the publish validator "checks" for these conditions; the implementation matches that contract. In practice the API surface guards each precondition at write-time (product create/patch, placement add, category archive cascade) so the publish-time validator runs in a defense-in-depth role for direct DB writes. **W4 §4.2 confirmed the same fold** for tree-validation: write-time and validator both exist; only one is reachable end-to-end.

## Post-§5.1 catalog state (entering §5.2)

```json
{ "canPublish": true,
  "summary": {"categoryCount": 8, "activePlacementCount": 1, "activeBannerCount": 1, "catalogVersionCount": 0},
  "warnings": [], "blockingErrors": [] }
```

- 1 active placement: P1 (Wave5 Product 1, PLU `W5T-42108-1`, price 99.99 RUB) in Wave5-Test root
- 1 active banner: `5e2b476c-…` linked to FileAsset `9135d4c7-…`
- Wave5-Test-Child + P4 placement archived (5.1.d cascade)
- P2, P3 products archived (5.1.b/5.1.c side effects); P2 placement archived (cascade)

## Bug filed

- **BUG-REG-069 (medium):** POST banner with non-existent imageFileAssetId UUID returns 500 instead of 400/404. Code: `advertising.service.ts:86-110` lacks FK precheck. Data integrity intact (DB FK rejects); UX broken.

## Files in this dir

- `5.1a-no-price.txt` — primary reachable scenario
- `5.1a-fix-price.txt` — fix proof
- `5.1b-dup-plu.txt` — write-time 409
- `5.1c-archived-product.txt` — Path-A 400 + Path-B cascade
- `5.1d-archived-category.txt` — cascade proof
- `5.1e-broken-tree.txt` — self-parent + bogus parent 400
- `5.1f-no-shortname.txt` — POST/PATCH 400
- `5.1g-no-plu.txt` — POST/PATCH 400
- `5.1h-bad-banner.txt` — javascript:/data:/empty=400, bogus FK=500 (BUG-REG-069)
