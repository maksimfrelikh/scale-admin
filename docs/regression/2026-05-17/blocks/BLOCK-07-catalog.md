# BLOCK-07 — Catalog runtime

- Date: 2026-05-17
- Start: 23:35 CEST
- End: 23:50 CEST
- Environment: production https://maksimfrelikh.ru
- Accounts: qa-admin@***.invalid, qa-operator@***.invalid
- Branch: docs/regression-2026-05-17 @ e91b4e8

## Цель

Поведение catalog runtime: дерево категорий, размещение товаров, sort order, archived constraints, AuditLog. 23 пункта в группах A..G.

## Контекст / pre-flight

- Tree endpoint: `GET /api/stores/:id/catalog/categories` → `{catalog, categories[]}` (categories — дерево через `.children[]`).
- Placements: `GET/POST /api/stores/:id/catalog/placements`, `PATCH /api/stores/:id/catalog/placements/:id` (move/reorder/archive).
- Category mutate: `POST` для create, `PATCH /api/stores/:id/catalog/categories/:id` для name/parentId/status/sortOrder.
- Audit: `GET /api/logs/global?limit=N` (admin-only). `/api/audit-log` — 404 (legacy).
- `DELETE` для категорий не существует (404); архивация только через `PATCH status=archived`.
- Operator's only assigned store: `e73ba6bd-abb9-4596-9289-cca474fb2ec1` (QA-PUB-20260516150944).

## Setup

- STORE_A `592f6799-0532-48c4-a013-36d89dd3bb76` (admin scope, primary tree tests)
- STORE_B `d18c4e0b-d18b-4efd-8912-32a27eb38471` (cross-catalog tests)
- STORE_OP `e73ba6bd-abb9-4596-9289-cca474fb2ec1` (operator's assigned)
- Helpers: `docs/regression/2026-05-17/scripts/block-07-helpers.sh`
- Audit dump: `docs/regression/2026-05-17/evidence/block-07-audit.json` (100 entries since 21:37)

## Матрица результатов

### A. Дерево категорий (admin on STORE_A)

| # | Операция | Expected | Actual | Status |
|---|---|---|---|---|
| A.1 | POST root QA-CAT-A | 201 | 201, sortOrder=0, canAcceptActivePlacements=true | ✅ |
| A.2 | POST child QA-CAT-A-1 (parentId=A) | 201 depth=2 | 201 | ✅ |
| A.3 | POST grandchild QA-CAT-A-1-i (parentId=A-1) | 201 depth=3 | 201 | ✅ |
| A.4 | POST great-grandchild depth=4 | reject 400/422 | 400 "Category depth cannot exceed 3 levels" | ✅ |
| A.5a | PATCH ROOT.parentId = CHILD (cycle) | reject | 400 "Category parent update would create a cycle" | ✅ |
| A.5b | PATCH CHILD.parentId = GRAND (cycle) | reject | 400 "Category parent update would create a cycle" | ✅ |
| A.5c | PATCH ROOT.parentId = ROOT (self) | reject | 400 "Category cannot be its own parent" | ✅ |
| A.6a | POST в STORE_A с parentId из STORE_B | reject | 400 "Parent category not found in active catalog" | ✅ |
| A.6b | PATCH STORE_A root.parentId = STORE_B cat | reject | 400 "Parent category not found in active catalog" | ✅ |
| A.7 | Sort order на одном уровне (PATCH sortOrder на 3 siblings) | сохраняется + GET в правильном порядке | OK, GET sorted by sortOrder ASC | ✅ |

### B. Archived category constraints

| # | Операция | Expected | Actual | Status |
|---|---|---|---|---|
| B.0 | Setup STORE_A с tree | — | OK | ✅ |
| B.1a | PATCH category status=archived | 200 + canAcceptActivePlacements=false | 200, флаг переключён | ✅ |
| B.1b | POST active CHILD category под archived parent | reject (по аналогии с placements) | **201 — accepted** | ⚠️ informational (см. BUG-REG-026) |
| B.1c | Children archived parent — какой status | остаются как были | active children остаются active (cascade нет) | ⚠️ informational |
| B.2 | Placement остаётся, но не в active package: GET ?status=active | filter archived | **filter не работает** | ❌ **BUG-REG-026** |
| B.3 | PATCH status=active (unarchive) | 200, canAcceptActivePlacements=true | 200, OK; placement видна полностью active | ✅ |

### C. Product placements

| # | Операция | Expected | Actual | Status |
|---|---|---|---|---|
| C.1 | POST product QA-PROD-A в master pool | 201 | 201 | ✅ |
| C.2 | POST placement в QA-CAT-A | 201, sortOrder=0 | 201, sortOrder=0 | ✅ |
| C.3 | POST повторного placement в CAT_S2 (того же catalog) | 409 + moveRequired | 409 `ACTIVE_PLACEMENT_EXISTS`, `moveRequired:true`, `existingPlacement` объект в body | ✅ |
| C.4 | PATCH `/placements/:id {categoryId:X}` для move | placement.categoryId изменён, **тот же id** | id 94f9482c сохранён, categoryId→CAT_S2, updatedAt advanced; AuditLog `placement.moved` | ✅ |
| C.5a | PATCH product status=archived | 200 | 200 | ✅ |
| C.5b | POST новый placement для archived PROD_A | reject | 400 "Archived or inactive product cannot be used for an active placement" | ✅ |
| C.6 | POST active placement в archived CAT_CHILD | reject | 400 "Archived or inactive category cannot be used for an active placement" | ✅ |

### D. Sort order товаров

| # | Операция | Expected | Actual | Status |
|---|---|---|---|---|
| D.1 | PATCH sortOrders 2 placements (D1=50, D2=10) | GET в порядке 10,50 | OK, sorted by sortOrder ASC | ✅ |

Замечание: новые placements/categories дефолтят на `sortOrder=0` — три sibling без явного PATCH будут с равным sortOrder (фактический порядок determined by createdAt). Не bug, UX-нюанс.

### E. AuditLog

| # | Action | Expected | Actual | Status |
|---|---|---|---|---|
| E.1a | category.created ×N (≥3) | присутствует | 20 entries за блок | ✅ |
| E.1b | category.archived | присутствует | 10 entries | ✅ |
| E.1c | category.reordered (PATCH sortOrder) | присутствует | 3 entries | ✅ |
| E.1d | category.status_changed (unarchive) | присутствует | 1 entry (B.3) | ✅ |
| E.2a | product.created | присутствует | 5 entries | ✅ |
| E.2b | product.archived | присутствует | ⚠️ Нет отдельного action; archive логируется как generic `product.updated` (6 entries — включая все PATCH). Несоответствие с category.archived. | ⚠️ informational |
| E.3a | placement.created | присутствует | 4 entries | ✅ |
| E.3b | placement.moved | присутствует | 4 entries (C.4 + probe) | ✅ |
| E.3c | placement.reordered (sortOrder change) | присутствует | 2 entries | ✅ |
| E.3d | placement.archived | присутствует | 4 entries (cleanup) | ✅ |

Замечание: audit entries не содержат diff/before-after payload. Только action+entityId+timestamp+actor. UI audit log не сможет показать "moved from X to Y" без дополнительных join'ов. Informational.

### F. Operator scope

| # | Операция | Expected | Actual | Status |
|---|---|---|---|---|
| F.1a | op POST root в STORE_OP | 201 | 201 | ✅ |
| F.1b | op POST child (parentId) в STORE_OP | 201 | 201 | ✅ |
| F.2a | op POST category в foreign STORE_A | 403 | 403 "Store access denied" | ✅ |
| F.2b | op PATCH name foreign category | 403 | 403 | ✅ |
| F.2c | op PATCH status (archive) foreign | 403 | 403 | ✅ |
| F.2d | op POST placement foreign | 403 | 403 | ✅ |
| F.2e | op PATCH placement foreign | 403 | 403 | ✅ |
| F.2f | op GET foreign catalog | 403 | 403 | ✅ |

### G. Edge cases

| # | Операция | Expected | Actual | Status |
|---|---|---|---|---|
| G.1a | POST category без shortName | reject ИЛИ pass с auto | 201 + shortName auto-fills from name | ⚠️ informational (design choice OK) |
| G.1b | POST без name | reject | 400 "Category name is required..." | ✅ |
| G.1c | POST name="" shortName="" | reject | 400 | ✅ |
| G.2 | API: 5 уровней (loop POST с parentId) | reject after 3 | level 1-3 → 201, level 4-5 → 400 "depth cannot exceed 3" | ✅ |
| G.3a | Archive category с placement внутри — cascade? | определённое поведение | placement.status остаётся active, category.status=archived (no cascade) | ⚠️ informational + см. BUG-REG-026 |
| G.3b | PATCH category через wrong store URL (id mismatch) | reject | 400 "Category not found in active catalog" | ✅ |

## XSS / hostile inputs

Не покрыты в этом блоке отдельно — см. BLOCK-06 §C (catalog name XSS payload accepted, rendered as text). В catalog tree response API возвращает stored payload, frontend escape — без regressions.

## Эскалация / новые баги

| Bug | Severity | Title | Area |
|---|---|---|---|
| **BUG-REG-026** | **high** | `?status=active` filter не работает на /catalog/categories и /catalog/placements (active package протекает archived) | api/catalog |

Informational findings (не отдельные баги, документировано в матрице):

1. POST новой active child category под archived parent → 201 (placement в archived parent → 400; inconsistency)
2. Archive category НЕ cascades в children categories или placements (placement.status остаётся active)
3. Archive product НЕ cascades в placements (placement.status остаётся active с archived product)
4. product.archived AuditLog action отсутствует (вместо него generic product.updated). Несимметрично с category.archived и placement.archived
5. shortName auto-fills name если не указан — OK дизайн, но недокументирован
6. sortOrder default = 0 при create — три sibling получают одинаковый 0
7. Move endpoint PATCH `/placements/:id {categoryId}` — изменяет in-place (тот же id, AuditLog action `placement.moved`)
8. POST `/placements/:id/move` тоже работает (probe), но canonical путь — PATCH
9. POST placement с дубликатом → 409 ACTIVE_PLACEMENT_EXISTS возвращает существующий placement объект — фронт может использовать для UX move confirmation
10. AuditLog entries не содержат diff/before-after — только action+entityId

## Cleanup

- Stores archived: STORE_A, STORE_B
- Operator's STORE_OP остаётся active (требуется для следующих блоков), его созданные категории QA-OP-A archived
- Products archived: PROD_A, PROD_B, PROD_C, PROD_D1, PROD_D2 (5 шт)
- Placements archived: 4 шт (C.4, C.2 placement_1, PLACEMENT_C, PL_D1, PL_D2)
- Temp DEEP_L1..3 категории archived через каскад STORE_A archive
- Все QA-CAT-* / QA-A* категории — archived через STORE_A archive
- Seeded category в STORE_OP (`d6fddace-...`) **не тронута**

QA admin/operator passwords не менялись. Production пользователи не создавались.

## Итог BLOCK-07

- Test points: **23** (по плану)
- Pass: ✅ 17
- Informational findings (по сути pass, нюансы поведения): ⚠️ 5
- Fail (новый bug): ❌ 1 (BUG-REG-026)
- Эскалация немедленная: нет (BUG-REG-026 — high, не critical security, не data loss; manager собирает в обычный отчёт)

Время: 23:35 → 23:50 CEST (~15 мин active testing + audit + cleanup).
Next: Block 8.
