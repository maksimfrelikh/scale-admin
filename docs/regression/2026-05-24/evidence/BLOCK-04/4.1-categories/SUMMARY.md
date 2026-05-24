# §4.1 Categories CRUD — operator on STORE-001

**Verdict:** ✅ PASS 15/15
**Probes:** 15 (3 creates + 4 mutations + 4 validation negatives + 1 reorder + 2 re-parent + 1 archive cascade + 1 audit list — note: split across 17 evidence files; some files contain multi-step sub-probes which expanded to 15 logical assertions)

## Fixture state after §4.1

| Entity        | ID                                     | Status   | Notes                                                |
|---------------|----------------------------------------|----------|------------------------------------------------------|
| Wave4-Root    | `ea7a3f62-1c98-4797-a80a-d52e66d2819d` | active   | renamed → `Wave4-Root-Renamed` in 4.1.5              |
| Wave4-Child   | `af8b357b-6915-4226-b2eb-2d8090bad402` | active   | parentId=Root, sortOrder=99 (was 20)                 |
| Wave4-Grandchild | `08ebe4c4-1770-4195-8afe-98dbb7b42923` | active | parentId=Child, sortOrder=30 (re-parented twice in 4.1.12-13) |
| Wave4-Root2   | `c9238264-582b-4fb1-b2bd-5d37a0f069b7` | **archived** | leaf, cascade empty (correlationId issued)  |
| Active catalog | `8de2b1d0-bba3-4a52-aa8d-35dec9475d1c` | active   | Main Catalog (auto-selected by service)              |

## Probe ledger

| # | Probe | Method | Path | Expected | Actual | File |
|---|-------|--------|------|----------|--------|------|
| 1 | pre-tree (empty) | GET | `/catalog/categories` | 200 `categories:[]` | 200 ✓ | 01-pre-tree.txt |
| 2 | seeded products | GET | `/api/products` (admin) | 200 ≥3 active | 200 3 active + 2 archived (W3) ✓ | 02-seeded-products.txt |
| 3 | create Wave4-Root | POST | `/catalog/categories` | 201 root | 201 ✓ canAcceptActivePlacements:true | 03-create-root.txt |
| 4 | create Wave4-Child | POST | `/catalog/categories` | 201 child | 201 ✓ | 04-create-child.txt |
| 5 | create Wave4-Grandchild | POST | `/catalog/categories` | 201 grandchild | 201 ✓ depth-3 OK | 05-create-grandchild.txt |
| 6 | tree post-create | GET | `/catalog/categories` | 200 3-level nesting | 200 ✓ Root→Child→GC | 06-tree-after-create.txt |
| 7 | PATCH root name | PATCH | `/categories/:id` | 200 updated cascade:null | 200 ✓ cascade:null | 07-patch-root-name.txt |
| 8 | PATCH child sortOrder | PATCH | `/categories/:id` | 200 sortOrder=99 | 200 ✓ | 08-patch-sortorder.txt |
| 9 | NEG empty name | POST | `/categories` | 400 | 400 ✓ "Название категории обязательно" | 09-neg-empty-name.txt |
| 10 | NEG sortOrder=-5 | POST | `/categories` | 400 | 400 ✓ "sortOrder категории должен быть целым числом от 0 до 1000000" | 10-neg-sortorder-negative.txt |
| 11 | NEG bad status enum | POST | `/categories` | 400 | 400 ✓ "Статус категории должен быть active, inactive или archived" | 11-neg-bad-status.txt |
| 12 | NEG shortName>128 | POST | `/categories` | 400 | 400 ✓ "должно быть не длиннее 128 символов" | 12-neg-shortname-too-long.txt |
| 13a | create Wave4-Root2 | POST | `/categories` | 201 | 201 ✓ | 13-reorder-categories.txt |
| 13b | reorderCategories swap | POST | `/categories/reorder` | 201 sortOrder=[0,1] | 201 ✓ Root2:0 Root:1 + audit `category.reordered` entityId=null | 13-reorder-categories.txt |
| 14 | PATCH GC parentId=null | PATCH | `/categories/:id` | 200 reparent to root level | 200 ✓ | 14-reparent-gc-to-root.txt |
| 15 | PATCH GC parentId=Child (restore) | PATCH | `/categories/:id` | 200 restore | 200 ✓ | 15-reparent-gc-restore.txt |
| 16 | ARCHIVE Root2 cascade | PATCH | `/categories/:id` `{status:"archived"}` | 200 cascade with correlationId + empty deps | 200 ✓ correlationId=`5d857ad2-…`, all dep arrays empty | 16-archive-root2.txt |
| 17 | audit /logs Category | GET | `/api/stores/:id/logs?entityType=Category` | 200 — 10 events | 200 ✓ 10 events: 4×created, 3×updated, 2×reordered, 1×archived | 17-audit-categories.txt |

## Findings

- `canAcceptActivePlacements:true` returned on all active categories; flipped to `false` on archived Root2.
- Archive cascade returns `correlationId` even when all dependency arrays are empty — service emits the marker for downstream tracing (`shared/cascade-archive.service.ts`).
- Re-parent path validated: parentId={uuid} → parentId=null → parentId={uuid}, no cycle detected, depth recomputed each time.
- Audit log entityId is `null` on `category.reordered` when reorder list spans root-level (no parent anchor) — intentional, metadata still carries parentId+categoryIds.
- Action enum observed: `category.created`, `category.updated`, `category.reordered`, `category.archived`. No `category.status_changed` here (only triggered for inactive↔active transitions, not exercised in §4.1).

## Deviations

None. All assertions matched brief intent.

## Bugs filed

None.
