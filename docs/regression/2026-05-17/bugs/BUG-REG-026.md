# BUG-REG-026: `?status=active` query filter не работает на /catalog/categories и /catalog/placements (active package протекает archived)

- Severity: high
- Area: api/catalog
- Role: admin (operator не имеет доступа к foreign catalog, но в своём — та же поверхность)
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: curl
- Found: 2026-05-17 23:45
- Related: none

## Шаги воспроизведения

1. Logged in as qa-admin.
2. Создан STORE_A (`592f6799-0532-48c4-a013-36d89dd3bb76`) с Main catalog.
3. Создан root QA-A в catalog, child QA-A1, grandchild QA-A1i. Также 3 sibling: QA-A-S1, QA-A-S2, QA-A-S3.
4. Создан product PROD_A, placement в категорию (status=active).
5. Создан product PROD_C, placement в CAT_S3 (status=active).
6. Archive PROD_A (PATCH `/products/:id {status:archived}`).
7. Archive CAT_S3 (PATCH `/stores/:id/catalog/categories/:id {status:archived}`).
8. GET `/stores/:id/catalog/categories?status=active`
9. GET `/stores/:id/catalog/placements?status=active`

## Ожидаемое

`?status=active` query parameter должен фильтровать ответ:
- categories: только `status=active` категории, в `.children[]` — только `status=active`.
- placements: только активные размещения **где** product.status=active **и** category.status=active.

Активный пакет каталога (то, что в итоге публикуется на весы) не должен содержать archived entities.

## Фактическое

`?status=active` query parameter **игнорируется**.

GET `/stores/$STORE_A/catalog/categories?status=active`:
```json
[
  {"id":"7bb406ce...","name":"QA-A","status":"active","has_children":true,
    "child_statuses":["archived","archived","active","active"]},
  {"id":"2d44c353...","name":"QA-CAT-A","status":"archived"},
  {"id":"7d5fd20b...","name":"QA-CAT-A","status":"archived"},
  {"id":"544e5a49...","name":"QA-CHAIN-1","status":"archived"}
]
```
Возвращены 3 archived root + archived children внутри active root. Status filter не применён.

GET `/stores/$STORE_A/catalog/placements?status=active`:
```json
[
  {"id":"94f9482c...","status":"active","product_status":"archived","category_status":"active"},
  {"id":"a1fb0a55...","status":"active","product_status":"active","category_status":"archived"}
]
```
Обе записи имеют `status=active`, но одна — на archived product, другая — на archived category. Без status фильтра по transitive entities active package протекает.

## Network / Console

```
GET /api/stores/592f6799-0532-48c4-a013-36d89dd3bb76/catalog/categories?status=active
200 OK — returns categories regardless of status (filter silently ignored)

GET /api/stores/592f6799-0532-48c4-a013-36d89dd3bb76/catalog/placements?status=active
200 OK — returns placements where placement.status=active but ignores product/category statuses
```

## Impact

- Frontend, опирающийся на `?status=active` для построения "active package" view (что покажет фронт пользователю как "будет на весах"), увидит archived записи.
- Если scale device sync строит package через эту же поверхность — на весы попадают archived продукты/категории.
- Cascade archive отсутствует (см. также findings ниже): archive category НЕ архивирует placements внутри; archive product НЕ архивирует его placements. Это означает: после archive product placement остаётся `status=active`, но указывает на archived product. Без серверного filter — попадёт в package.

## Hypothesis

В route handler чтения категорий/placements `?status` параметр не парсится или передаётся в Prisma where как игнорируемый ключ. Для placements — нужно расширить WHERE до `AND product.status='active' AND category.status='active'`.

## Evidence

- block-07 раздел "B.2c / B.2d" в `docs/regression/2026-05-17/blocks/BLOCK-07-catalog.md`
- helpers: `docs/regression/2026-05-17/scripts/block-07-helpers.sh`

## Related findings (не отдельные баги, см. block-07 SUMMARY)

- archive category не cascades в children (active siblings/placements остаются active)
- archive product не cascades в placements
- create active child category под archived parent → 201 (placement в archived parent → 400; inconsistency)
- product archive action логируется как `product.updated`, а category archive — как `category.archived` (inconsistent action naming)
- create category без shortName → 201, shortName auto-fills name; OK дизайн
- sortOrder при create по умолчанию = 0; 3 sibling получают sortOrder=0 (need explicit PATCH чтобы упорядочить)
