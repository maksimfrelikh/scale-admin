# §4.2 Tree validation — depth, cycle, foreign-catalog

**Verdict:** ✅ PASS 7/7 (one logical sub-step was already covered in §4.1)
**Probes:** 7 negative assertions + 1 tree state verification

## Probe ledger

| # | Probe | Method | Path | Expected | Actual | File |
|---|-------|--------|------|----------|--------|------|
| 1 | depth-4 attempt (parentId=Grandchild) | POST | `/catalog/categories` | 400 depth | 400 ✓ "Глубина категории не может превышать 3 уровней" | 01-neg-depth-overflow.txt |
| 2 | self-parent (parentId=self) | PATCH | `/categories/:id` | 400 self-parent | 400 ✓ "Категория не может быть родительской для самой себя" | 02-neg-self-parent.txt |
| 3 | descendant cycle (parentId=descendant) | PATCH | `/categories/:id` | 400 cycle | 400 ✓ "Изменение родительской категории создаст цикл" | 03-neg-descendant-cycle.txt |
| 4 | foreign-catalog/bogus parentId | POST | `/categories` | 400 not-found | 400 ✓ "Родительская категория не найдена в активном каталоге" | 04-neg-foreign-parent.txt |
| 5 | tree state intact post-negatives | GET | `/catalog/categories` | unchanged | ✓ Root→Child→GC unchanged; Root2 archived sibling | 05-tree-after-neg.txt |
| 6 | reorderCategories duplicate IDs | POST | `/categories/reorder` | 400 dup | 400 ✓ "categoryIds не должен содержать дубликаты" | 06-neg-reorder-duplicates.txt |
| 7 | reorderCategories mixed-parent | POST | `/categories/reorder` | 400 mixed-level | 400 ✓ "Все категории для сортировки должны быть в одном каталоге и на одном уровне" | 07-neg-reorder-mixed-parent.txt |
| 8 | reorderCategories empty array | POST | `/categories/reorder` | 400 empty | 400 ✓ "categoryIds должен содержать хотя бы один ID категории" | 08-neg-reorder-empty.txt |

## Findings

- **Foreign-catalog parentId is structurally indistinguishable from "wrong-catalog parentId"** in the operator API surface — service path `findActiveCatalog(storeId)` auto-selects the store's single active catalog (`catalog.service.ts:583-596`); operator never passes a `catalogId`. Any category UUID not belonging to that catalog returns the same 400 "Родительская категория не найдена в активном каталоге". This is the intended contract (operator cannot reference cross-catalog entities), but it also means cross-catalog parentId injection is not a separately observable attack surface — they fold into the same validation gate.
- `MAX_CATEGORY_DEPTH = 3` enforced both on create (`getCategoryDepth` walk) and on re-parent (`getSubtreeDepth` + parentDepth math) — `catalog.service.ts:144` create, `catalog.service.ts:220-228` update.
- Self-parent and descendant-cycle handled by distinct error messages — useful for client-side UX disambiguation.

## Bugs filed

None.
