# BUG-REG-063 — `test/scale-ack-check.js` TypeError (`scales.service.js:322` undefined `create`)

**Status:** RESOLVED — Wave 8, PR #34 (3729a4a default auditLogs ctor in ScalesService)
**Severity:** low (test-only TypeError; pre-existing on plain `main`; not introduced by Wave 5 or [[BUG-REG-058]])
**Area:** backend (`backend/test/scale-ack-check.js` / `backend/dist/scales/scales.service.js:322`)
**Origin:** Surfaced during [[BUG-REG-058]] post-merge verification on 2026-05-20. Pre-existing-ness confirmed by the BUG-REG-058 implementer Manager earlier the same day via stash + rebuild on plain `main` — the TypeError reproduces without the BUG-REG-058 changes applied. Filed as part of BUG-REG-058 post-merge cleanup, not a defect introduced by it.

## Scope

`backend/test/scale-ack-check.js` throws a `TypeError` originating at `backend/dist/scales/scales.service.js:322` — an access of a `create` property on what evaluates to `undefined`. The error trips when the check script is executed against a built backend; it does not affect runtime request handling because no live code path calls into that branch (the script is a verification helper, not part of the request flow).

## Pre-existing verification

Reproduced on plain `main` (without the [[BUG-REG-058]] diff applied) by the BUG-REG-058 implementer Manager earlier on 2026-05-20 via a stash + rebuild cycle. Conclusion: the TypeError predates Wave 5 and is unrelated to the `:userId` guard added in [[BUG-REG-058]].

## Acceptance criteria (for future closure)

- [ ] `node backend/test/scale-ack-check.js` (or the canonical invocation path used by the regression scripts) exits clean — no `TypeError`.
- [ ] Root cause at `backend/dist/scales/scales.service.js:322` (undefined `create` access) identified and patched at its source in `backend/src/scales/`.
- [ ] Adjacent spec coverage prevents recurrence (assertion that the offending access path is guarded or no longer reachable).

## Out of scope

- Larger refactor of `backend/src/scales/` — this ticket is the minimal fix for the verification-script TypeError.
- Migration of `test/scale-ack-check.js` into the canonical Jest/Vitest suite — separate triage if desired.

## Wave placement

Wave 8+ backlog. Low severity, test-helper-only TypeError, no production impact. Defer until a Wave with scales-area scope picks it up naturally.

## Cross-references

- [[BUG-REG-058]] — post-merge verification run that surfaced this finding.
- `backend/test/scale-ack-check.js` — failing check script.
- `backend/dist/scales/scales.service.js:322` — observed throw site (compiled artifact; root cause is in `backend/src/scales/`).
