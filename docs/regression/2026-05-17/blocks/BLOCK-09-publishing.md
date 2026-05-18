# BLOCK-09 — Publishing UX

- Date: 2026-05-18
- Start: 00:12 CEST
- End: 00:25 CEST (=22:25 UTC 2026-05-17)
- Duration: 13 min
- Environment: production https://maksimfrelikh.ru
- Accounts: qa-admin@***.invalid (admin), qa-operator@***.invalid (operator)
- Branch: docs/regression-2026-05-17 @ e91b4e8

## Цель

Publishing endpoints: validation, immutable CatalogVersion, packageData по PRD §6.12, follow-up для BUG-REG-026 (archived leak) и BUG-REG-027 (non-RUB currency) на финальной packageData. 27 пунктов в группах A..H.

## Endpoint surface (`backend/src/publishing/`)

| Method | Path | Назначение |
|---|---|---|
| POST/GET | `/stores/:storeId/publishing/catalog-validation` | Run validation, returns `{catalog, canPublish, blockingErrors, warnings, summary}` |
| POST/GET | `/stores/:storeId/publishing/catalog-package` | Generate package preview (draft, без записи CatalogVersion) |
| GET | `/stores/:storeId/publishing/catalog-versions` | List versions + currentVersion |
| POST | `/stores/:storeId/publishing/catalog-publish` | Publish (creates CatalogVersion, updates `StoreCatalog.currentVersionId`, AuditLog) |

Guards: SessionGuard → RolesGuard(admin|operator) → StoreAccessGuard. На foreign store оператор → 403 (через StoreAccessGuard).

## Pre-read insights (из кода ДО тестов — подтверждены empirically ниже)

1. `catalog-package.service.ts:115-156` фильтрует categories `status:'active'`, placements `category.status='active' && product.status='active'`, banners `status:'active'`, prices `status:'active' && price>0`. **Поэтому BUG-REG-026 (status=active leak в /catalog/*) НЕ extends на packageData** — package service делает явный server-side filter. D.3 подтвердил.
2. `catalog-package.service.ts:218-225` копирует `currency` прямо из `StoreProductPrice.currency` без enum-валидации. **BUG-REG-027 (non-RUB в БД через API) extends на packageData**. D.4 подтвердил → BUG-REG-029 (high).
3. `prisma/schema.prisma:414` `@@unique([catalogId, versionNumber])` + tx isolation `Serializable` — гонка double-publish защищена на data-integrity layer; на error-mapping layer проигравшая транзакция возвращает 500 (см. BUG-REG-030).
4. На CatalogVersion **нет** PATCH/PUT/DELETE endpoints в контроллере. Все мутации после create возвращают 404 (E.1 подтвердил).

## Fixtures

| Entity | ID | Notes |
|---|---|---|
| STORE_PUB | `021acd90-f270-4e64-b23c-5edb330adb2d` | clean store, owned by admin, used for A..F. Archived в cleanup. |
| CAT_PUB | `62404a97-f25d-4b48-8b67-f6f184ff2445` | Main catalog of STORE_PUB |
| STORE_OP | `e73ba6bd-abb9-4596-9289-cca474fb2ec1` | operator's only assigned store (G.1) |
| CAT_OP | `ab84f2e4-644d-41cf-a30f-7b29bb6be807` | Main catalog of STORE_OP |
| STORE_FOREIGN | `5d8373ec-da96-443a-8cba-6c09d0e3dc4f` | STORE_P from block-08 — для G.2 (operator → foreign → 403) |
| APPLE | `a34ae399-fab2-4ed0-85a7-44db4d63b50b` | PLU 90001734 — fruit |
| BREAD | `a51fa522-9f04-467f-8522-ee38910eb41e` | PLU 91001734 |
| BAGEL | `b465e128-2b8a-4005-bce8-27a2a502e4bf` | PLU 92001734 — использовался для D.4 (USD currency) |

Helpers: `docs/regression/2026-05-17/scripts/block-09-helpers.sh`, race: `block-09-race.sh`.
Evidence: `docs/regression/2026-05-17/evidence/block-09/`.

## Матрица результатов (27 пунктов)

### A. Validation API (3)

| # | Проверка | Expected | Actual | Status |
|---|---|---|---|---|
| A.1 | Найти validate endpoint | `POST/GET /stores/:id/publishing/catalog-validation` существует | confirmed (controller `publishing.controller.ts:25-33`) | ✅ |
| A.2 | Validation на чистом каталоге (2 cat, 3 placement+price, 1 banner) | empty blocking + empty warnings + canPublish=true | `{canPublish:true, blockingErrors:[], warnings:[], summary:{categoryCount:2,activePlacementCount:3,activeBannerCount:1,catalogVersionCount:0}}` (`A2-clean-validation.json`) | ✅ |
| A.3 | Response разделяет blocking vs warnings | поля `blockingErrors[]` и `warnings[]` с `code, message, entityType, entityId, metadata` | confirmed; на empty catalog warnings = [`NO_ACTIVE_ADVERTISING_BANNERS`, `EMPTY_CATALOG`] (`A1-empty-validation.json`) | ✅ |

### B. Blocking errors PRD §6.11 (5)

| # | Сценарий | Expected | Actual | Status |
|---|---|---|---|---|
| B.1 | Active placement product без цены | blocking `ACTIVE_PLACEMENT_PRICE_MISSING` | confirmed (`B1-noprice.json`) — `canPublish:false`, blocking содержит code + entityId placement + productId | ✅ |
| B.2 | Archived product в active placement | blocking `ACTIVE_PLACEMENT_HAS_INACTIVE_PRODUCT` | confirmed (`B2-archived-product.json`) — metadata.productStatus=archived | ✅ |
| B.3 | Active placement в archived category | blocking `ACTIVE_PLACEMENT_IN_INACTIVE_CATEGORY` | confirmed (`B3-archived-category.json`) — metadata.categoryStatus=archived | ✅ |
| B.4 | Дубль PLU в active package | blocking `DUPLICATE_DEFAULT_PLU_CODE` | precondition unreachable через API: `Product.defaultPluCode` UNIQUE → 409 при create-with-dup-PLU; placement of same product in 2 categories → 400 "Product already has an active placement in this catalog" (`B4-create-dup-plu-attempt.json`, `B4-second-placement.json`). Правило валидации — defense-in-depth, недостижимо. | ⏭ unreachable |
| B.5 | Категория без name/shortName в active placement | blocking `CATEGORY_REQUIRED_FIELDS_MISSING` | precondition unreachable: create/PATCH с пустыми name/shortName → 400 на categories layer. Правило валидации — defense-in-depth. | ⏭ unreachable |

### C. Successful publication (7)

| # | Проверка | Expected | Actual | Status |
|---|---|---|---|---|
| C.1 | Чистый каталог setup | 2 cat, 3 placements+prices, 1 banner | confirmed (validation summary до publish) | ✅ |
| C.2 | POST publish → 200 | + body `version`, `catalog`, `validation` | 201 Created (`C-publish-1.json`) с тремя ключами | ✅ |
| C.3 | versionNumber = previous + 1 | first publish → 1 | v1.versionNumber=1, v2=2 (после изменения данных), v3..v6 (race iterations) — все incrementally unique | ✅ |
| C.4 | basedOnVersionId = previous | first → null; second → v1.id | v1.basedOnVersionId=null; v2.basedOnVersionId=f4b42a6e... (=v1.id) | ✅ |
| C.5 | packageChecksum non-empty sha256 hex | 64-char hex | v1: `1fba7405396e6cd2c4c97d9c016b065431c5f92c35401f1c06a3b172ead26e75`; v2: `b648b824a8ab601de5f931a9cf3a1f44e843f6332d8ad0e0bd5367d5c6687c2e` | ✅ |
| C.6 | publishedAt, publishedByUserId | timestamp + admin UID | v1.publishedAt=`2026-05-17T22:19:48.045Z`, publishedByUserId=`4df893ce-...` (=admin) | ✅ |
| C.7 | StoreCatalog.currentVersionId | = new version.id | `currentVersionId=d2a9ae0c-...` после v2 (`C7-versions-after-v1.json` + post-v2 check) | ✅ |

### D. packageData structure PRD §6.12 (5)

| # | Проверка | Expected | Actual | Status |
|---|---|---|---|---|
| D.1 | Top-level keys `version, store, catalog, categories, advertising` | все есть | confirmed (keys: advertising/catalog/categories/store/version; `D-packageData-v1.json`) | ✅ |
| D.2 | items[] поля productId, plu, name, shortName, price, currency, unit, sortOrder, imageUrl, +description/barcode/sku | все 9+ полей | confirmed; sample APPLE: `{productId,plu,name,shortName,description,imageUrl,barcode,sku,unit,price,currency,sortOrder}` | ✅ |
| D.3 | BUG-REG-026 follow-up: archived в packageData | НЕТ ни одного archived (category/product/placement/banner) | 5 archived IDs созданы pre-publish, все absent в packageData v2 (`grep` count: 0/5). package service фильтрует архивные на DB-уровне (`catalog-package.service.ts:115-156`). **BUG-REG-026 НЕ extends на scales.** | ✅ |
| D.4 | BUG-REG-027 follow-up: non-RUB currency leak в packageData | reject либо нормализация в RUB | **LEAK: USD доходит до packageData**: `{plu:"92001734","shortName":"Bgl","price":3,"currency":"USD"}` в опубликованной v2. Checksum заморозил эту корруптацию. → **BUG-REG-029 (high)** | ❌ BUG-REG-029 |
| D.5 | Sort order соблюдён | categories по sortOrder, items внутри по sortOrder | QA-Fruit(1) → QA-Bread(2); внутри QA-Bread: WBr(1) → Bgl(2) — корректно | ✅ |

### E. Immutability (3)

| # | Проверка | Expected | Actual | Status |
|---|---|---|---|---|
| E.1 | PATCH/PUT/DELETE на CatalogVersion | reject (404/405) | все 4 попытки (`PATCH /publishing/catalog-versions/:id`, `PUT`, `DELETE`, `PATCH /catalog-versions/:id`) → 404. Routes не существуют. | ✅ |
| E.2 | Изменить рабочие данные после publish | packageData published version не меняется | BAGEL price USD→RUB после v2 → checksums v1 и v2 в versions list = тем же, что в момент publish (`1fba7405...` и `b648b824...`). | ✅ |
| E.3 | currentVersionId остаётся до новой publish | старый id | После BAGEL price change → currentVersionId всё ещё `d2a9ae0c-...` (=v2.id). Preview package показывает свежие данные (RUB), а опубликованная v2 заморожена с USD. | ✅ |

### F. Double-publish race (1)

| # | Проверка | Expected | Actual | Status |
|---|---|---|---|---|
| F.1 | 2 параллельных POST publish | одна версия, второй 409 либо тот же versionId | 2 запуска race-скрипта: победитель → 201 + новый versionNumber (5, потом 6); проигравший → **500 Internal Server Error**. Data integrity OK (versions 1..6 уникальны), error mapping — нет. → **BUG-REG-030 (low)** | 🟡 BUG-REG-030 |

### G. Operator scope (2)

| # | Проверка | Expected | Actual | Status |
|---|---|---|---|---|
| G.1 | qa-operator publish в assigned store | 200, AuditLog actor=operator UID | 201 Created в STORE_OP, version.publishedByUserId=`c46be3c5-...` (=operator UID). AuditLog (H.1) содержит запись с actor.email=`qa-operator@***.invalid`. | ✅ |
| G.2 | qa-operator publish в foreign store | 403 | 403 Forbidden `{"message":"Store access denied"}` (`StoreAccessGuard`). | ✅ |

### H. AuditLog + history (2)

| # | Проверка | Expected | Actual | Status |
|---|---|---|---|---|
| H.1 | `/api/logs/global` содержит `catalog_version.published` с actor + entityId=versionId | да | 13 записей `catalog_version.published` за сессию; каждая с `action`, `entityType: CatalogVersion`, `entityId` = versionId, `storeId`, `actor: {id, email, fullName}`, `store: {id, code, name}` (`H1-audit-publish.json`) | ✅ |
| H.2 | История версий: versionNumber, publishedAt, publishedBy | да | `GET /publishing/catalog-versions` → `currentVersion + versions[]`, каждая запись содержит id, versionNumber, status, publishedAt, publishedBy (fullName), publishedByUserId, packageChecksum | ✅ |

## Итог

- Pass: 23 / 27
- Skip (validation rule unreachable through API): 2 (B.4, B.5)
- Fail / new bug: 2
  - **BUG-REG-029 high**: non-RUB currency leak в packageData (BUG-REG-027 → reaches scales)
  - **BUG-REG-030 low**: double-publish race loser → 500 instead of 409
- Existing follow-ups status:
  - **BUG-REG-026 (high)** archived leak in /catalog/*: НЕ extends на packageData. Package service делает proper server-side filter (`catalog-package.service.ts:115-156`). Risk for scale device sync — устранён.
  - **BUG-REG-027 (medium)** non-RUB API: extends → BUG-REG-029 (high).

## Findings (не-баги, но заметно)

1. Validation `summary.categoryCount` включает archived (через `findMany without status filter`); package data — только active. Расхождение названия и содержания suburface; не баг, но non-obvious для UI.
2. Validation rules `DUPLICATE_DEFAULT_PLU_CODE` и `CATEGORY_REQUIRED_FIELDS_MISSING` — defense-in-depth, недостижимы через API surface (DB UNIQUE + service-level required validators ловят раньше). Полезны как страховка от прямого DB write, но в regression unreachable.
3. Backend response для validation на чистом каталоге включает summary с counts, которые могут быть полезны для UI dashboard.
4. PATCH product / category / placement → archived НЕ каскадно. После archived продукта его active placement остаётся active, и publish с такой конфигурацией ловится валидацией как `ACTIVE_PLACEMENT_HAS_INACTIVE_PRODUCT` (good). Согласовано с known-finding из block-07.

## Cleanup

Архивировано:
- 6 products (APPLE, BREAD, BAGEL, P_NOPR, PA, PB)
- 2 categories (CAT_FRUIT, CAT_BREAD)
- 1 banner (active test banner)
- STORE_PUB (status=archived)

Версии 1..6 в STORE_PUB и v1 в STORE_OP остаются — they're immutable by design. Archived ids of CA/PA/PB/PLB/BA из D.3 setup также удалены (set status=archived).

Версии STORE_OP v1 публиковалась operator-ом в его assigned store — оставлена.

## Evidence (всё в `docs/regression/2026-05-17/evidence/block-09/`)

- `A1-empty-validation.json` — validation response на полностью empty catalog
- `A2-clean-validation.json` — validation на clean ready catalog (empty/empty)
- `B1-noprice.json`, `B2-archived-product.json`, `B3-archived-category.json` — blocking errors
- `B4-create-dup-plu-attempt.json`, `B4-second-placement.json` — Б.4 unreachable
- `C-publish-1.json`, `C-publish-2.json` — full publish responses (включают packageData)
- `C7-versions-after-v1.json` — versions list confirmation
- `D-packageData-v1.json` — full v1 packageData
- `F1-race.log` — оба запуска race-скрипта
- `G1-operator-publish.json` — operator publish in own store
- `H1-audit-publish.json` — audit log filtered by action=catalog_version.published
- `setup-banner.json` — banner create response

Scripts: `docs/regression/2026-05-17/scripts/block-09-helpers.sh`, `block-09-race.sh`.
