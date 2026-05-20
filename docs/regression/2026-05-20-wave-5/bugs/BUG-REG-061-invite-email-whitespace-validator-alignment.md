# BUG-REG-061 — Brief expectation vs validator contract on leading/trailing whitespace in invite emails

**Status:** RESOLVED — documented in docs/contracts.md (2026-05-20, Wave 7 doc batch)
**Severity:** low (documentation / PRD alignment)
**Area:** backend (`email-validation.util.ts`) + docs (`docs/contracts.md`)
**Origin:** Wave 5 closure regression — SUMMARY side finding #7 (`docs/regression/2026-05-20-wave-5/SUMMARY.md` lines 176-183).

## Resolution (2026-05-20, Wave 7 doc batch)

Trim-then-validate contract is now documented at [`docs/contracts.md` § Email validation trim-then-validate contract (per BUG-REG-061)](../../../contracts.md#email-validation-trim-then-validate-contract-per-bug-reg-061). The original stub pointed at `AGENTS.md §6.A.email-validation`, but that anchor does not exist anywhere in the repo's `AGENTS.md` (see [[BUG-REG-064]] for the systemic phantom-AGENTS.md pattern). `docs/contracts.md` is the canonical home for intentional-behavior contracts going forward. Behavior change (option B) remains out of scope until a PRD decision is taken.

## Scope (from SUMMARY side finding #7, verbatim)

> Brief expectation vs validator contract on leading/trailing whitespace in invite emails. Brief expected 400 for a leading-space email; validator at `email-validation.util.ts:16` normalizes via `email.trim()` and accepts. Either update the brief / `AGENTS.md` §6.A.email-validation to document the trim-then-validate contract, or tighten the validator to reject leading/trailing whitespace explicitly (a behavior change — would need a PRD decision). Documenting as alignment concern, not a defect.

## Why this matters

The validator's `email.trim()` step is **deliberate** ([[BUG-REG-039]] introduced the RFC-5322 regex with full spec coverage; trim predates Wave 5). The Wave 5 closure brief expected leading-space to reject — a brief authoring miss, not a code defect. Two options:

- **(A) Doc-only fix:** document the trim-then-validate contract in `AGENTS.md` §6.A.email-validation, so future briefs and Tester checklists match the implemented behavior. Lowest churn; preserves user-friendly invite UX.
- **(B) Behavior change:** tighten the validator to reject leading/trailing whitespace explicitly. Requires a PRD decision, breaks the existing user-friendly normalization, and could surface as a regression for any user/admin who has historically pasted emails with stray whitespace.

**Recommended: (A).** Trim-then-validate is the friendlier default and is already covered by `email-validation.util.spec.ts`. Brief alignment is the real gap.

## Discovery checklist (for actioning agent)

1. Read `backend/src/auth/email-validation.util.ts:16` and `email-validation.util.spec.ts` — confirm trim-then-validate contract + spec coverage.
2. ~~Update `AGENTS.md` §6.A.email-validation~~ — Wave 7 redirect: `AGENTS.md §6.A.email-validation` does not exist. Documented in [`docs/contracts.md` § Email validation trim-then-validate contract (per BUG-REG-061)](../../../contracts.md#email-validation-trim-then-validate-contract-per-bug-reg-061) instead.
3. Update any open regression-brief templates under `docs/regression/` to reflect the contract for future waves.
4. If Maksim picks (B) instead, file the PRD decision in this stub and the implementation work becomes a new ticket; this one stays open as "decision pending."

## Acceptance criteria

- [x] `docs/contracts.md` documents the trim-then-validate contract (Wave 7 doc batch, 2026-05-20).
- [ ] Future regression briefs that exercise email validation match the documented behavior (no false-FAIL on whitespace inputs).
- [ ] If a behavior change is chosen (B), the spec covers the new reject case and existing AuditLog rows with whitespace-bearing emails are accounted for.

## Out of scope

- Quoted-local-part / IDN-domain / UTF-8 local-part support — already explicitly out of scope per [[BUG-REG-039]] acceptance.

## Wave placement

Backlog.

## Cross-references

- [[BUG-REG-039]] — original email-validator stub; trim-then-validate contract origin.
- Wave 5 closure SUMMARY side finding #7.
