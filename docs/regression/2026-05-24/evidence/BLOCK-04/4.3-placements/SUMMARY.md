# §4.3 Placements — add/move/sortOrder/archive cascade

**Verdict:** ✅ PASS 16/16 (3 🔴 watchpoints CLEAN)
**Probes:** 16 across creation, validation, move, cascade-archive, restore

## Probe ledger

| # | Probe | Method | Path | Expected | Actual | File |
|---|-------|--------|------|----------|--------|------|
| 1 | pre-placements (empty) | GET | `/catalog/placements` | 200 placements:[] | 200 ✓ | 01-pre-placements.txt |
| 2 | create Apples→Child active | POST | `/catalog/placements` | 201 | 201 ✓ id=`01222d41…` | 02-create-placement-apples.txt |
| 3 | create Bananas→GC active | POST | `/catalog/placements` | 201 | 201 ✓ id=`829cf56b…` | 03-create-placement-bananas.txt |
| 4 | **🔴 archived product → active placement** | POST | `/catalog/placements` | 400 | 400 ✓ "Архивный или неактивный товар нельзя использовать в активном размещении" | 04-neg-archived-product.txt |
| 5 | **🔴 archived category → active placement** | POST | `/catalog/placements` | 400 | 400 ✓ "Архивную или неактивную категорию нельзя использовать в активном размещении" | 05-neg-archived-category.txt |
| 6 | dup-active 2nd placement same product | POST | `/catalog/placements` | 409 ACTIVE_PLACEMENT_EXISTS | 409 ✓ `code:"ACTIVE_PLACEMENT_EXISTS", moveRequired:true, existingPlacement{...}` | 06-neg-duplicate-active.txt |
| 7 | move Apples Child→GC | POST | `/catalog/placements/:id/move` | 201 | 201 ✓ categoryId=GC, sortOrder=5 | 07-move-apples.txt |
| 8 | move Apples GC→Child via PATCH | PATCH | `/catalog/placements/:id` | 200 | 200 ✓ categoryId=Child | 08-patch-move-apples-back.txt |
| 9 | placement sortOrder update | PATCH | `/catalog/placements/:id` | 200 sortOrder=42 | 200 ✓ | 09-patch-sortorder.txt |
| 10 | **🔴 operator → foreign storeId** | POST | `/api/stores/<bogus>/catalog/placements` | 403 byte-identical | 403 ✓ "Нет доступа к магазину" — matches W2 §2.4 in-band guard | 10-crit-foreign-store.txt |
| 11a | place Milk→GC active | POST | `/catalog/placements` | 201 | 201 ✓ | 11-place-milk-then-reorder.txt |
| 11b | reorderPlacements [milk,bananas] in GC | POST | `/catalog/placements/reorder` | 201 sortOrder=[0,1] | 201 ✓ Milk:0, Bananas:1 | 11-place-milk-then-reorder.txt |
| 12 | PATCH archive Bananas | PATCH | `/catalog/placements/:id` `{status:"archived"}` | 200 | 200 ✓ status=archived | 12-archive-placement.txt |
| 13 | PATCH re-activate Bananas | PATCH | `/catalog/placements/:id` `{status:"active"}` | 200 | 200 ✓ (no dup-active error because no other active Bananas placement) | 13-reactivate-placement.txt |
| 14 | cascade-archive Wave4-Child | PATCH | `/categories/:id` `{status:"archived"}` | 200 cascade summary | 200 ✓ correlationId=`86201879-…`, categories:[GC], placements:[Milk,Bananas,Apples] | 14-archive-child-cascade.txt |
| 15a | tree after cascade | GET | `/catalog/categories` | Child+GC archived | ✓ both archived in tree | 15-tree-after-cascade.txt |
| 15b | placements after cascade | GET | `/catalog/placements` | all 3 archived | ✓ status=archived on all | 15-tree-after-cascade.txt |
| 16 | **🔴 new placement into cascade-archived Child** | POST | `/catalog/placements` | 400 | 400 ✓ "Архивную или неактивную категорию нельзя использовать в активном размещении" | 16-neg-place-into-archived-cascade.txt |
| 17-20 | restore Child, GC, 3 placements → active (for downstream blocks) | PATCH | various | 200 each | 200 ✓ × 5 | 17-restore-child.txt … 20-verify-restore.txt |

## Fixture state after §4.3 (restored)

| Entity | ID | Status |
|---|---|---|
| Wave4-Root-Renamed | `ea7a3f62-…` | active |
| Wave4-Child | `af8b357b-…` | **active** (restored from cascade-archive) |
| Wave4-Grandchild | `08ebe4c4-…` | **active** (restored) |
| Wave4-Root2 | `c9238264-…` | archived (from §4.1) |
| Apples placement | `01222d41-…` | active in Child, sortOrder=42 |
| Bananas placement | `829cf56b-…` | active in GC, sortOrder=1 |
| Milk placement | `eefd1f21-…` | active in GC, sortOrder=0 |

## Findings

- **🔴 ALL THREE CRITICAL WATCHPOINTS CLEAN:** archived product → active placement BLOCKED (400), archived category → active placement BLOCKED (400), operator writes to foreign store catalog BLOCKED (403 byte-identical to W2 §2.4 StoreAccessGuard).
- `ACTIVE_PLACEMENT_EXISTS` 409 carries full `existingPlacement` payload (category + product nested), giving client enough data to render a "move from X to Y?" UI prompt without an extra round-trip. Brief's "second active в том же catalog 'move?' prompt or reject" = both supported via the 409 + move/PATCH endpoints.
- Cascade-archive on a non-leaf category (Wave4-Child) correctly archived: (a) descendant categories (Grandchild), (b) ALL placements under both Child AND Grandchild (3 placements total). `cascade-archive.service.ts` traverses the full subtree.
- Re-activation of an archived placement succeeds without dup-active conflict ONLY when no other active placement exists for that product in the catalog (verified 4.3.13: Bananas was archived 4.3.12, no other Bananas active → reactivate 200).
- Cascade-archive is non-reversible by single endpoint — manual restore requires PATCH on each entity individually (verified 4.3.17-19). No `restore` endpoint exists. This is by design (archived state is reversible per-entity, but cascade is one-direction).

## Deviations

None. All assertions matched brief intent.

## Bugs filed

None.
