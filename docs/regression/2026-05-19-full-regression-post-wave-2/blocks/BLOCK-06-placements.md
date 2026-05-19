# BLOCK 6 — Catalog placements

**Verdict:** PASS — BUG-REG-026 closure CONFIRMED (both invariant + cascade)
**Time:** ~1 min
**Scripts:** `scripts/block-06-placements.cjs`, `scripts/probe-block-06-cascade.cjs`
**Report JSON:** `evidence/block-06-report.json`

## Scenarios

| ID | Scenario | Expected | Actual | Verdict |
|---|---|---|---|---|
| 6.0 | Setup: store + 2 categories + 2 products | all created | all created (5 IDs in report) | ✅ |
| 6.1 | List placements — empty initially | 200, 0 | 200, 0 | ✅ |
| 6.2 | Create placement (catA, prod1, active) | 201 + id | 201 + uuid | ✅ |
| 6.3 | **Duplicate-active invariant**: create (catB, prod1, active) while another active exists | 409 with helpful message | 409 "Product already has an active placement in this catalog; move the existing placement instead" | ✅ |
| 6.4 | Move placement1 (catA → catB) | 201 + new categoryId | 201, categoryId=catB | ✅ |
| 6.5 | List by category — after move | catA=0, catB=1 | catA=0, catB=1 | ✅ |
| 6.6 | Create placement (catA, prod2, active) | 201 (different product OK) | 201 | ✅ |
| 6.7 | Archive placement1 (manual) | 200 | 200, status=archived | ✅ |
| 6.8 | Re-create active placement (catA, prod1) after archive of prior | 201 (no conflict — prior is archived) | 201 | ✅ |
| 6.9 | **Cascade archive on category archive (BUG-REG-026)** | category archive → all active placements in it become archived | (probe confirms): pre=1 active, post=0 active + 1 archived | ✅ |
| 6.10 | Create placement without categoryId | 400 | 400 "Category id is required" | ✅ |

## BUG-REG-026 closure verdict — CONFIRMED

> Invariant: only one active placement per (store, product) at any time.
> Cascade: archiving a category atomically archives all active placements in that category.

Both halves verified by API tests above.

## Notes

- "Move" is implemented as a distinct endpoint (`POST /placements/:id/move`) which transfers a placement to another category atomically. The shape returns the moved placement.
- The duplicate-active error message is well-crafted (tells the operator what to do: "move the existing placement instead"). Good UX.

## Stack state at end of block

Local docker, CORS=localhost; +2 test stores (Wave3 placement + probe), each with leftover categories/products/placements. Will be left in local DB.

## New BUG-REG opened
None.
