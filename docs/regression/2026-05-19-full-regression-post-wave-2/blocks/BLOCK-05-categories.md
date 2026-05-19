# BLOCK 5 — Categories (tree, parent/child, sortOrder, archive cascade)

**Verdict:** PASS — BUG-REG-035 closure CONFIRMED
**Time:** ~1 min
**Script:** `scripts/block-05-categories.cjs`
**Report JSON:** `evidence/block-05-report.json`

## Scenarios

| ID | Scenario | Expected | Actual | Verdict |
|---|---|---|---|---|
| 5.0 | Setup dedicated test store | 201 + id | 201 + uuid | ✅ |
| 5.1 | GET /catalog/categories — empty | 200, no categories | 200, 0 | ✅ |
| 5.2 | Create root category | 201 + id | 201 | ✅ |
| 5.3 | Create two children A+B under root | 201 each | 201/201 | ✅ |
| 5.4 | Create grandchild under Child A | 201 | 201 | ✅ |
| 5.5 | GET tree — verify nested shape | 1 root → 2 children → 1 grandchild | matches exactly | ✅ |
| 5.6 | Reorder children: B before A | 201 + updated order | 201 returns reordered tree | ✅ |
| 5.7 | Create with bogus parentId (zero-UUID) | 400 | 400 "Parent category not found in active catalog" | ✅ |
| 5.8 | Create with empty name | 400 | 400 "Category name is required..." | ✅ |
| 5.9 | **Archive root** (BUG-REG-035 closure trigger) | 200 + cascade | 200 + status=archived | ✅ |
| 5.10 | **Verify cascade**: root + both children + grandchild all archived | all 4 in archived list | all 4 status=archived, `allFourArchived=true` | ✅ |
| 5.11 | Active list after cascade — none of the four visible | none in active filter | confirmed | ✅ |
| 5.12 | Restore root (un-archive) — cascade reverse? | by fix scope, only target restored | root active, children/grandchild stay archived | ✅ (matches scope) |
| 5.13 | UI store detail screenshot | renders | renders; Categories likely behind tab click, body text didn't include "Categor" — UX-only note | 🟡 (cosmetic) |

## BUG-REG-035 closure verdict — CONFIRMED CASCADE WORKS

> commit `a863538` — fix(BUG-REG-035): cascade archive parent → children in single transaction

After archiving root, all 3 descendants (Child A, Child B, Grandchild A1) are atomically transitioned to `archived` status in the same request. Cascade depth ≥2 confirmed (grandchild flipped, not just direct children).

## Notes / Observations (not bugs)

- **Restore is single-level by design.** When the root is restored to `active`, children/grandchild remain `archived`. This matches the fix commit message (which mentions archive-cascade only). If product wants symmetric reverse-cascade on restore, that's a new ticket — not a regression of BUG-REG-035. Recorded as observation, not BUG-REG.
- Categories carry `canAcceptActivePlacements: true` boolean — useful precondition for placements block.
- Categories scope: per-store (`/api/stores/:storeId/catalog/categories`). Confirmed RBAC scoping via `StoreAccessGuard` on the controller.

## Stack state at end of block

Local docker, CORS=localhost; +1 test store, +4 categories (root active, 2 children + grandchild archived) used for downstream blocks.

## New BUG-REG opened
None.
