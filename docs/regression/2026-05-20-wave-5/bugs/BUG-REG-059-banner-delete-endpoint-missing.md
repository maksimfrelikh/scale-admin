# BUG-REG-059 — No `DELETE /api/stores/:storeId/advertising/banners/:bannerId` (soft-delete-only contract)

**Status:** RESOLVED — documented in docs/contracts.md (2026-05-20, Wave 7 doc batch)
**Severity:** low (contract is intentional; lack of doc was the actual gap)
**Area:** backend (advertising) + docs (`docs/contracts.md`)
**Origin:** Wave 5 closure regression — SUMMARY side finding #5 (`docs/regression/2026-05-20-wave-5/SUMMARY.md` lines 163-168).

## Resolution (2026-05-20, Wave 7 doc batch)

Soft-delete-only contract is now documented at [`docs/contracts.md` § Banner soft-delete contract (per BUG-REG-059)](../../../contracts.md#banner-soft-delete-contract-per-bug-reg-059). The original stub pointed at `AGENTS.md §6.2`, but that anchor does not exist anywhere in the repo's `AGENTS.md` (see [[BUG-REG-064]] for the systemic phantom-AGENTS.md pattern). `docs/contracts.md` is the canonical home for intentional-behavior contracts going forward.

## Scope (from SUMMARY side finding #5, verbatim)

> No `DELETE /api/stores/:storeId/advertising/banners/:bannerId`. Banners are soft-deleted via `PATCH .../status` → `status:archived`. That's a reasonable design, but the lack of DELETE means the throwaway `wave5-valid-probe` banner created in Block 5 had to be archived rather than removed. Not a regression — just a soft-delete-only contract worth documenting in `AGENTS.md` §6.2.

## Why this matters

Soft-delete-only is a defensible contract — preserves audit history, supports recovery, avoids cascading FK pain. But future verify/Tester runs and contractor implementations will repeatedly look for a `DELETE` endpoint, file confused tickets, or worse, attempt to implement one without realizing the design intent. Documenting the contract is cheap; the alternative is rediscovery cost on every wave.

## Discovery checklist (for actioning agent)

This is **doc-only** unless Maksim decides to flip the contract (separate decision).

1. Read `backend/src/advertising/advertising.controller.ts` — confirm there is no DELETE handler and that PATCH `status:archived` is the canonical archive path.
2. ~~Update `AGENTS.md` §6.2 (advertising routes) with an explicit note~~ — Wave 7 redirect: `AGENTS.md §6.2` does not exist. Documented in [`docs/contracts.md` § Banner soft-delete contract (per BUG-REG-059)](../../../contracts.md#banner-soft-delete-contract-per-bug-reg-059) instead.
3. Optional: extend the same note to any other surface that follows the soft-delete-only pattern (verify in discovery).

## If Maksim flips the contract (out of scope here)

A real DELETE endpoint would need: cascade rules for any FK references, an audit-log entry (`advertising.banner.deleted` or whichever family wins under [[BUG-REG-056]]), and a FE confirmation dialog distinct from "archive."

## Acceptance criteria

- [x] `docs/contracts.md` documents soft-delete-only contract for advertising banners + cites the canonical PATCH archive route (Wave 7 doc batch, 2026-05-20).
- [ ] Manager/Tester briefs that touch banner cleanup reference the soft-delete contract and don't expect a DELETE endpoint to exist.

## Out of scope

- Adding a DELETE endpoint — needs a separate PRD decision; this ticket documents the existing contract.

## Wave placement

Backlog (doc-only — small).

## Cross-references

- Wave 5 closure SUMMARY side finding #5.
- [[BUG-REG-046]] — has a real DELETE endpoint for invites (different contract intentionally; not the model for banners).
