# UX Regression — Catalog / Placements / Prices — 2026-05-16

## Scope
Focused frontend UX/runtime regression for catalog, placements and prices behavior on production `https://maksimfrelikh.ru`.

Credentials, tokens and secrets are intentionally omitted from this report and evidence.

## Result
**FAIL** for tested scope due to **BUG-UX-002**.

## Coverage summary
- Products list and product edit/detail navigation: **PASS**
- Category create, duplicate-submit, cache invalidation, refresh: **PASS**
- Category edit persistence/rendering: **FAIL** — `BUG-UX-002`
- Placement create, duplicate-submit, cache invalidation: **PASS**
- Prices list after placement mutation: **PASS**
- Price create/edit save, duplicate-submit, refresh persistence: **PASS**
- Invalid price handling: **PASS**
- Browser back/forward/refresh after edits: **PASS**, except category edit bug
- Archived/inactive product/category UI handling: **PASS** by visible active-placement restrictions
- Operator assigned-store catalog behavior: **BLOCKED** because operator account had no assigned stores available
- Publishing flow: not deeply tested, per scope

## Confirmed bug
- `docs/bugs/BUG-UX-002.md` — Category edit returns success but saved values are not persisted or rendered.

## Key observations
- Category create double-submit attempt sent only one POST and rendered the new QA category without manual refresh.
- Placement add double-submit attempt sent only one POST and invalidated placement/prices queries.
- Price save double-submit attempt sent only one PUT; refreshed price input matched API `currentPrice.price`.
- Negative price input disabled Save and did not send an invalid PUT.
- An active store without an active catalog showed `Active store catalog not found` for catalog/prices; this was treated as an expected error state for that store, not filed as a bug in this run.

## Evidence
Sanitized evidence JSON: `docs/evidence/catalog-regression-2026-05-16.json`

## Final assessment
Catalog/prices runtime behavior is mostly stable for create/add/price-save flows, but category edit cannot pass acceptance while successful saves fail to persist/render edited values.
