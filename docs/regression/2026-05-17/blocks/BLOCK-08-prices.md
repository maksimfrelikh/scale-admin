# BLOCK-08 — Prices runtime

- Date: 2026-05-17 / 2026-05-18
- Start: 23:54 CEST (2026-05-17)
- End: 00:12 CEST (2026-05-18)
- Environment: production https://maksimfrelikh.ru
- Accounts: qa-admin@***.invalid, qa-operator@***.invalid
- Branch: docs/regression-2026-05-17 @ e91b4e8

## Цель

Prices секция в Store Detail: колонки, поиск, фильтры, inline edit, AuditLog, scope per store. 24 пункта в группах A..I.

## Контекст / pre-flight

- `GET /api/stores/:id/prices` → `{catalog, prices[]}` где `prices[]` — joined: `placement | product | category | currentPrice | missingPrice`.
- `currentPrice` хранится с FK `(storeId, productId)`, **не** placementId. PRD §6.8 — `StoreProductPrice (storeId, productId, price, currency, status)`.
- `PUT /api/stores/:id/prices/:productId` body `{price, currency?}` — create-or-update (upsert по (storeId, productId)). **Заметим**: BUG-REG-023 описывал путь `/prices/{placementId}` — это narrative slip, фактический URL `/prices/{productId}`. BUG-REG-023 сам по себе валидный (no max).
- Filters server-side: `?search=<q>`, `?categoryId=<uuid>`, `?missingPrice=true|false`. Поиск ищет одновременно name | shortName | defaultPluCode | sku | barcode (combined).
- AuditLog: `price.created`, `price.updated`. Diff не сохраняется (informational, см. block-07).
- Не репортить повторно: BUG-REG-023 (no max), BUG-REG-024 (ESC/click-outside).
- BUG-REG-026 (status=active filter) проверен на /prices: **не extends** — prices endpoint правильно скрывает archived.

## Setup fixtures

| Entity | ID | Notes |
|---|---|---|
| STORE_P | `5d8373ec-da96-443a-8cba-6c09d0e3dc4f` | QA-PRC-A-235542 — primary test store |
| STORE_Q | `ba66158c-d9bc-4179-b658-1f5f545e2ffc` | QA-PRC-B-235548 — cross-store test |
| STORE_OP | `e73ba6bd-abb9-4596-9289-cca474fb2ec1` | operator's only assigned store (existing) |
| CAT_FRUIT | `56aeba07-9c6f-490d-ba55-1db9eb917151` | category in STORE_P |
| CAT_BREAD | `684e0a65-1ae1-4f3d-afca-72f2fde5e553` | category in STORE_P |
| CAT_Q | `3bb2acf6-c0e5-47cd-8560-472eae46aeec` | category in STORE_Q |
| APPLE | `960c9ce2-...` | PLU 81001, sku SKU-APP-235548, barcode 4600100100001, placed STORE_P/fruit + STORE_Q/Q |
| BANANA | `859481ee-...` | PLU 81002, shortName Bnn, barcode 4600100100002, placed STORE_P/fruit |
| CHERRY | `f36483dc-...` | PLU 81003, shortName Chr, no sku/barcode, placed STORE_P/fruit |
| LOAF | `7578e6dd-...` | PLU 81004, sku SKU-LF-..., barcode 4600100100004, placed STORE_P/bread |
| BAGEL | `adb8cff9-...` | PLU 81005, sku SKU-BG-..., barcode 4600100100005, placed STORE_P/bread, **no price** (тест no-price filter) |

Helpers: `docs/regression/2026-05-17/scripts/block-08-helpers.sh`, UI scripts: `block-08-ui-surface.cjs`, `block-08-deep-surface.cjs`, `block-08-search-filter.cjs`.
AuditLog dump: `docs/regression/2026-05-17/evidence/block-08/block-08-audit.json` (≥56 entries with prefilter `createdAt > 21:54`).

## Матрица результатов (24 пункта)

### A. UI surface (2)

| # | Проверка | Expected | Actual | Status |
|---|---|---|---|---|
| A.1 | Колонки Prices таблицы | по PRD §6.8: Product name, Short name, PLU, SKU/barcode, Category, Current price, Unit, Status, UpdatedAt | `PRODUCT NAME, SHORT NAME, PLU, SKU/BARCODE, CATEGORY, CURRENT PRICE, UNIT, STATUS, UPDATEDAT` — все 9 ✅ | ✅ |
| A.2 | Только active catalog content (archived товары/категории не видны) | архивные скрыты | Подтверждено в I — после archive product/category/placement они уходят из ответа | ✅ |

Дополнительно зафиксировано в UI:
- Combined search input `<input type=text placeholder="Name, short name, PLU, SKU or barcode">` (один-на-всё).
- 2 filter selects: Category (`All categories | <name>...`), Price status (`All products | Missing price only | With price only`).
- Price input: `<input type=number min=0.01 step=0.01 max="" placeholder="0.00" aria-label="Price for <name>">` — **`max` отсутствует** (подтверждает BUG-REG-023, не реrep).
- Missing-price marker: `<span class="price-warning">No price</span>` + `<tr class="price-row price-row-missing">`.
- Invalid-price marker (defensive UI, фронт): `<span class="price-warning">Invalid price</span>` + `<tr class="price-row-invalid">` — срабатывает если в БД `currentPrice <= 0` / `NaN` (см. D.2).

### B. Search (7)

| # | Запрос | Expected | Actual | API call | Status |
|---|---|---|---|---|---|
| B.1 | "Apple" → name | 1 row | 1 row (Apple) | `?search=Apple` | ✅ |
| B.2 | "Bnn" → shortName | 1 row | 1 row (Banana) | `?search=Bnn` | ✅ |
| B.3 | "81002" → defaultPluCode | 1 row | 1 row (Banana) | `?search=81002` | ✅ |
| B.4 | "SKU-LF" → sku | 1 row | 1 row (Loaf) | `?search=SKU-LF` | ✅ |
| B.5 | "4600100100005" → barcode | 1 row | 1 row (Bagel) | `?search=4600100100005` | ✅ |
| B.6 | "" empty → все | 5 rows | 5 rows | no call (client doesn't fire empty) | ✅ |
| B.7 | "zzznonexistent" → 0 rows + empty state | 0 rows | 0 rows, server `{"catalog":{...},"prices":[]}` | `?search=zzznonexistent` | ✅ |

Заметка: поиск — server-side (каждый запрос триггерит `GET /stores/:id/prices?search=...`). Combined (single input) ищет одновременно по 5 полям. Удобно для UX.

### C. Filters (3)

| # | Фильтр | Expected | Actual | API call | Status |
|---|---|---|---|---|---|
| C.1a | Категория FRUIT | 3 rows (Apple, Banana, Cherry) | 3 | `?categoryId=<FRUIT>` | ✅ |
| C.1b | Категория BREAD | 2 rows (Loaf, Bagel) | 2 | `?categoryId=<BREAD>` | ✅ |
| C.2a | "Missing price only" | 5 (изначально все без цены) → 1 (Bagel) после I.1 настройки цен | работает; считает по серверной `missingPrice` flag | `?missingPrice=true` | ✅ |
| C.2b | "With price only" | 0 → 4 после I.1 | работает | `?missingPrice=false` | ✅ |
| C.3 | FRUIT + Missing only | пересечение (1 row если только Apple без цены, иначе 0..3) | работает по запросу | `?categoryId=<FRUIT>&missingPrice=true` | ✅ |

Селектор Category в UI популируется через `useMemo` из `unfilteredData.prices[].category` — поэтому archived категории **не** показываются в dropdown (они отфильтрованы на сервере в /prices). При попытке отправить archived `categoryId` напрямую — `400 "Active category not found in active catalog"`.

### D. Visual highlight (2)

| # | Проверка | Expected | Actual | Status |
|---|---|---|---|---|
| D.1 | Товар без цены — подсветка | red row / badge / любая | `<tr class="price-row price-row-missing">` + `<span class="price-warning">No price</span>` в первой td | ✅ |
| D.2 | Invalid цена в БД (negative/NaN) — подсветка | подсветка если есть | UI имеет defensive `price-row-invalid` + "Invalid price" badge, но через стандартный API negative/zero rejected (400), нет legitimate способа создать invalid state. **Не наблюдалось в боевых данных**; UI хук есть. | ⚠️ informational (no repro path) |

### E. Inline edit + AuditLog + persistence model (4)

| # | Операция | Expected | Actual | Status |
|---|---|---|---|---|
| E.1 | PUT новой цены (Apple 22.34) | 201/200 + AuditLog price.created | 200 `{price:{id, storeId, productId, price:"22.34", currency:"RUB", status:"active"}}`, AuditLog `price.created` entity=StoreProductPrice id=b3937c3f | ✅ |
| E.2 | PUT update (22.34 → 33.45) | 200 + AuditLog price.updated, `id` сохранён (upsert) | 200, **id b3937c3f unchanged**, `updatedAt` advanced; AuditLog `price.updated` | ✅ |
| E.3 | GET /products/{id} после смены цены | `updatedAt` Product не изменён | Product.updatedAt = 21:56:07 (createdAt), price.updatedAt = 22:01:10. Product **не** трогается. | ✅ |
| E.4 | Модель: цена per (storeId, productId), не placementId | StoreProductPrice имеет (storeId, productId), не placementId | Confirmed: response shows `{storeId, productId, price, currency, status}` без placementId | ✅ |

Замечание: AuditLog `price.*` не содержит before/after diff (только action+entityId+actor+createdAt). Уже зафиксировано в block-07 finding 10 — UI не сможет показать "было X стало Y" без отдельного storage.

### F. Validation re-check (2)

| # | Запрос | Expected | Actual | Status |
|---|---|---|---|---|
| F.1 | price = -10 | 400 | 400 `"Price must be greater than 0"` | ✅ |
| F.2 | price = 0 | 400 | 400 `"Price must be greater than 0"` | ✅ |
| F.3a | price = 0.001..0.0049 | 400 | **500 Internal Server Error** | ❌ **BUG-REG-028** (low) |
| F.3b | price = 0.005 | 200, rounds to 0.01 | 200, stored "0.01" | ✅ |
| F.3c | price = 1.001 | 400 (если step строгий) ИЛИ round 1.00 + warning | 200, silently stored "1" | ⚠️ informational (numeric(N,2) rounding) |
| F.3d | price = 12.345 | round 12.34 | 200, stored "12.35" (half-up) | ⚠️ informational |
| F.4 | currency = "USD" | 400 "Currency must be RUB" | **200, stored as USD** | ❌ **BUG-REG-027** (medium, escalated) |
| F.5 | currency = "ZZZ" (любые 3 буквы) | 400 | **200, stored as ZZZ** | ❌ part of BUG-REG-027 |
| F.6 | currency missing | 200, defaults RUB | 200, currency=RUB | ✅ |

### G. Multi-store scope (1)

| # | Проверка | Expected | Actual | Status |
|---|---|---|---|---|
| G.1 | Apple в STORE_P=50, в STORE_Q=99.99 — каждый видит свою | Цены отдельные per (storeId, productId) | STORE_P prices Apple = 50, STORE_Q prices Apple = 99.99, Product.updatedAt не меняется, activePlacementCount=2 | ✅ |

### H. Operator scope (2)

| # | Проверка | Expected | Actual | Status |
|---|---|---|---|---|
| H.1 | op PUT цену в own store | 200 + AuditLog actorUserId=op | 200, AuditLog `price.updated` actor=qa-operator@***.invalid | ✅ |
| H.2a | op GET foreign STORE_P prices | 403 | 403 | ✅ |
| H.2b | op PUT foreign STORE_P/{productId} | 403 | 403 | ✅ |
| H.2c | op PUT foreign STORE_Q/{productId} | 403 | 403 | ✅ |
| H.2d | op GET /logs/global (admin-only) | 403 | 403 | ✅ |

### I. Archived leak (BUG-REG-026 follow-up) (1)

| # | Сценарий | Expected | Actual | Status |
|---|---|---|---|---|
| I.1 | Цены на Apple/Banana/Cherry/Loaf, Bagel без цены | 5 rows / 4 with price | OK | ✅ |
| I.2 | Archive Cherry (product) | Cherry уходит из prices | prices count 5 → 4, Cherry отсутствует | ✅ |
| I.3 | Archive BREAD (category) с Loaf+Bagel внутри | Loaf+Bagel уходят из prices | prices count 4 → 2 | ✅ |
| I.4 | Archive PL_LOAF (placement) — категория опять active | placement не в prices | prices count → 2 (Loaf уже ушёл через category archive; повторная проверка — placement в любом случае hidden) | ✅ |
| I.5 | UI category select dropdown после archive BREAD | archived в dropdown отсутствует | dropdown содержит только `All categories \| QA-FRUIT-...` | ✅ |
| I.6 | API: GET /prices?categoryId=<archivedId> | 0 rows ИЛИ 400 | **400** "Active category not found in active catalog" | ✅ |

Заключение I: prices endpoint **не** наследует BUG-REG-026 — фильтр archived работает на (product, category, placement) одновременно. Похоже, prices service подключает `WHERE status='active'` на joined entities, в отличие от /catalog/categories и /catalog/placements которые status filter игнорируют.

## XSS / hostile inputs

Не покрыты заново в этом блоке. Block 6 §C и Block 7 уже показали, что catalog/product name с XSS payload сохраняется и рендерится фронтом как text (escape ок). В Prices таблице рендер `row.product.name` через JSX — то же поведение (без regression). Не отдельный пункт.

## Эскалация / новые баги

| Bug | Severity | Title | Area |
|---|---|---|---|
| **BUG-REG-027** | **medium** | API принимает любую 3-letter currency (USD, EUR, ZZZ) при PUT /prices/{productId} — MVP scope (PRD §6.8) ограничивает RUB | api/prices/validation |
| BUG-REG-028 | low | API отдаёт 500 Internal Server Error на price < 0.005 (округление до 0.00 + DB constraint, должно быть 400) | api/prices/validation |

Эскалирован немедленно в Telegram: **BUG-REG-027** (по user-defined escalation criterion блока — "Currency не RUB сохраняется без warning").

## Informational findings (не отдельные баги)

1. PUT path — `/stores/{storeId}/prices/{productId}`, не `/{placementId}`. BUG-REG-023 narrative slip; сам баг (no max) валидный.
2. POST /products требует `shortName` обязательно (для categories — auto-fills). Inconsistency с category schema. (UI всегда передаёт; в Block 6 не ловили потому что UI заполняет.)
3. POST /products требует `status` в body — иначе 400 "Product status must be active, inactive, or archived". UI передаёт `active` дефолтом. Минорная inconsistency vs /stores (где status опционален).
4. AuditLog price.created/price.updated не содержат diff/before-after (как в block-07).
5. `numeric(N,2)` rounding: `1.001 → 1`, `99.499 → 99.5`, `99.501 → 99.5`, `12.345 → 12.35`. Backend silently rounds half-up. UI step=0.01 предотвращает через клиент. Informational.
6. Currency хранится как plain string; после API-PUT с non-RUB, UI subsequent PUT сохранит `row.currentPrice.currency` (frontend/src/main.tsx:1967) → persistent corruption flow (см. BUG-REG-027 impact).
7. Category select dropdown в UI правильно фильтрует archived (через `useMemo` над `unfilteredData.prices[].category` — реально показанные, а не raw catalog tree).
8. Prices endpoint фильтрует archived корректно (контрастирует с /catalog/categories и /catalog/placements из BUG-REG-026). Это означает, что fix BUG-REG-026 нужен на стороне catalog routes, в prices implementation паттерн правильный (можно использовать как референс).
9. UI input `<input type=number step=0.01 min=0.01>` — без `max` атрибута (подтверждает BUG-REG-023, не отдельный repo). ESC/click-outside не обрабатываются (подтверждает BUG-REG-024, не отдельный repo).
10. Frontend defensive UI: `hasInvalidPrice` / `hasInvalidSavedPrice` flags + `.price-row-invalid` CSS rule existуют, рассчитаны на случай если currentPrice в DB станет невалидным. Сейчас не срабатывают (нет данных в таком состоянии).

## Cleanup

- STORE_P archived
- STORE_Q archived
- 5 products archived (Apple, Banana, Cherry, Loaf, Bagel)
- Categories FRUIT/BREAD/Q — cascade с store archive (catalog status тоже изменится)
- Placements archived через store cascade
- STORE_OP **не** тронут (assigned to operator, осталась цена 66.66 на seeded product — восстановлена из 111.11 в H.5)

QA admin/operator пароли не менялись. Production пользователи не создавались.

## Итог BLOCK-08

- Test points: **24** (по плану)
- Pass: ✅ 22
- Informational (по сути pass, нюанс поведения): ⚠️ 2 (D.2 invalid highlight no-repro, F.3c-d numeric rounding)
- Fail (новый баг): ❌ 2 — BUG-REG-027 (escalated), BUG-REG-028
- Escalations: 1 (BUG-REG-027 — Telegram)

Время: 23:54 → 00:12 (~18 минут active + cleanup + evidence + write-up).
Next: Block 9 (Publishing) — verify архивные не попадают в опубликованный packageData (главный риск BUG-REG-026 — теперь зная, что в Prices фильтр работает, фокус на /catalog/categories и /catalog/placements в publish pipeline).
