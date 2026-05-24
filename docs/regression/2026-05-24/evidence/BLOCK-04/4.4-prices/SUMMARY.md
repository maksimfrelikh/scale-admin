# §4.4 Prices — filter/search/inline update/audit/currency

**Verdict:** ✅ PASS 21/21 (1 🔴 watchpoint CLEAN)
**Probes:** 21 across filter/search/update/negative/audit/Product-immutability

## Probe ledger

| # | Probe | Method | Path | Expected | Actual | File |
|---|-------|--------|------|----------|--------|------|
| 1 | pre-prices | GET | `/prices` | 200 3 items missingPrice:true | 200 ✓ | 01-pre-prices.txt |
| 2 | filter missingPrice=true | GET | `/prices?missingPrice=true` | 3 items | 200 ✓ | 02-filter-missingprice.txt |
| 3 | set price Apples 450.50 RUB | PUT | `/prices` (body productId) | 200 price.created | 200 ✓ price="450.5" | 03-set-apples-price.txt |
| 4 | update Apples 475.25 | PUT | `/prices` (same productId) | 200 price.updated, same id | 200 ✓ same id `370d0b04-…` price="475.25" updatedAt changed | 04-update-apples-price.txt |
| 5 | set Bananas 89.99 via PUT :productId | PUT | `/prices/:productId` | 200 | 200 ✓ | 05-set-bananas-price.txt |
| 6 | NEG price=0 | PUT | `/prices` | 400 | 400 ✓ "Цена должна быть больше 0" | 06-neg-price-zero.txt |
| 7 | NEG price=-50 | PUT | `/prices` | 400 | 400 ✓ same msg | 07-neg-price-negative.txt |
| 8 | NEG currency=XXX | PUT | `/prices` | 400 PRICE_CURRENCY_NOT_SUPPORTED | 400 ✓ `code:"PRICE_CURRENCY_NOT_SUPPORTED",allowedCurrencies:["RUB"],received:"XXX"` | 08-neg-currency-bad.txt |
| 9 | default currency (no field) → RUB | PUT | `/prices` | 200 currency:"RUB" | 200 ✓ Milk 150 currency:"RUB" | 09-default-currency-rub.txt |
| 10 | search by name "Apple" | GET | `/prices?search=Apple` | 1 hit Apples | 200 ✓ total:1 | 10-search-name.txt |
| 11 | search by PLU "1002" | GET | `/prices?search=1002` | 1 hit Bananas | 200 ✓ | 11-search-plu.txt |
| 12 | search by SKU "MILK-1L" | GET | `/prices?search=MILK-1L` | 1 hit Milk | 200 ✓ | 12-search-sku.txt |
| 13 | search by barcode "46…028" | GET | `/prices?search=4600000000028` | 1 hit Bananas | 200 ✓ | 13-search-barcode.txt |
| 14 | filter categoryId=Child | GET | `/prices?categoryId=…` | 1 hit Apples | 200 ✓ | 14-filter-category.txt |
| 15 | categories with prices | GET | `/prices/categories` | Child + GC | 200 ✓ 2 categories (only those with active placement+active product) | 15-categories-with-prices.txt |
| 16 | **🔴 Product unchanged after price update** | GET | `/api/products/:id` (admin) | Apples updatedAt = 2026-05-23 (BEFORE price updates) | 200 ✓ updatedAt=`2026-05-23T20:44:31.477Z` (unchanged from seed); price updates were at 13:01:50 — **Product not mutated by inline price** | 16-product-unchanged.txt |
| 17 | audit `/logs?entityType=StoreProductPrice` | GET | `/api/stores/:id/logs` | 4 events: 3 created + 1 updated | 200 ✓ matches | 17-audit-prices.txt |
| 18 | search shortName "Red Apples" | GET | `/prices?search=Red%20Apples` | 1 hit | 200 ✓ shortName field in haystack | 18-search-shortname.txt |
| 19 | filter missingPrice=false | GET | `/prices?missingPrice=false` | 3 items priced | 200 ✓ | 19-filter-no-missing.txt |
| 20 | NEG missingPrice=foo | GET | `/prices?missingPrice=foo` | 400 | 400 ✓ "missingPrice должно быть true или false" | 20-neg-missingprice-foo.txt |
| 21 | NEG set price for non-placed product | PUT | `/prices` | 400 | 400 ✓ "Перед назначением цены товар должен быть активен и размещён в активном каталоге" | 21-neg-nonplaced-product.txt |

## Findings

- **🔴 CRITICAL WATCHPOINT CLEAN:** Apples `Product.updatedAt = 2026-05-23T20:44:31.477Z` (seed time) AFTER 2 price ops on store-scoped table at 13:01:50 → confirmed inline price update DOES NOT mutate Product master record. Prices live in `StoreProductPrice` (store-scoped composite), as enforced by `prices.service.ts:179-237`.
- Update reuses existing row (same `id=370d0b04-…` across create+update) — only most-recent-updated active price is treated as "current," any duplicates archived as side-effect (`duplicateIds` cleanup at `prices.service.ts:209-212`).
- **Search haystack** confirmed to cover: name, shortName, defaultPluCode (PLU), sku, barcode — all single-hit on unique tokens (`prices.service.ts:154-164`).
- **`/prices/categories`** only returns categories that have ≥1 active placement of an active product — `Wave4-Root-Renamed` (which has no direct placements, only via descendants) is correctly excluded; only Wave4-Child + Wave4-Grandchild appear.
- `ALLOWED_CURRENCIES = ["RUB"]` is the only supported currency on staging — brief's "currency RUB default" satisfied + extension surface is gated.
- Audit log uses `price.created` for new and `price.updated` for existing — `prices.service.ts:217`.

## Deviations

None.

## Bugs filed

None.
