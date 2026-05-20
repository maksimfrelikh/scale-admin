# BUG-REG-060 — `PricesTab` category dropdown limited to first 200 catalog placements

**Status:** RESOLVED — Wave 8, PR #35 (67163f1 dedicated category dropdown endpoint)
**Severity:** low (functional, but masks long-tail catalog placements)
**Area:** frontend (`PricesTab` category selector) + backend (catalog categories endpoint)
**Origin:** Wave 5 closure regression — SUMMARY side finding #6 (`docs/regression/2026-05-20-wave-5/SUMMARY.md` lines 170-174). Carried forward from [[BUG-REG-048]] (PR #25) as a known limitation.

## Scope (from SUMMARY side finding #6, verbatim)

> `PricesTab` category dropdown limited to first 200 catalog placements (PR #25 known limitation, carried forward) — the `useListStorePricesQuery({limit:200})` call hard-caps the dropdown source. Long-term fix: dedicated `useListCatalogCategoriesQuery`. Suggest follow-up BUG-REG ticket.

## Why this matters

If the store has > 200 catalog placements, the PricesTab category dropdown silently truncates — the user can't filter by categories that live past offset 200. This is a hidden cap, not a "load more" UX. As soon as a store grows past that volume, the dropdown becomes misleading.

## Discovery checklist (for actioning agent)

1. Inspect `frontend/src/.../PricesTab.tsx` (or wherever the category selector lives) — find the `useListStorePricesQuery({limit:200})` call.
2. Confirm the dropdown derives its option set from the prices query result rather than a dedicated categories query.
3. Backend audit: is there a dedicated catalog-categories endpoint, or does the dropdown need a new one (`GET /api/stores/:storeId/catalog/categories` returning a flat distinct-category list)?
4. Implement `useListCatalogCategoriesQuery` (RTK Query hook) backed by the (existing or new) categories endpoint.
5. Replace the `useListStorePricesQuery({limit:200})` dropdown source with the new query.
6. Verify on staging that categories past the previous 200-cap now appear (may require seeding additional catalog placements).

## Acceptance criteria

- [ ] PricesTab category dropdown shows **all** catalog categories for the store, not the first 200 placements.
- [ ] Source query is a dedicated category-list query, not a piggyback on the prices list.
- [ ] No regression of existing PricesTab filter / sort / pagination behavior (the cross-cutting [[BUG-REG-048]] envelope must stay intact for the actual prices list).

## Out of scope

- Search / autocomplete in the dropdown — separate UX concern.
- Other paginated dropdowns elsewhere in the app — file separate stubs if discovered.

## Wave placement

Backlog.

## Cross-references

- [[BUG-REG-048]] — cross-cutting pagination feature (PR #25) where this limitation was carried forward.
- Wave 5 closure SUMMARY side finding #6.
