# BUG-REG-064 — Multiple BUG-REG stubs reference phantom AGENTS.md sections (§6.2, §6.A.*, etc.)

**Status:** OPEN — backlog
**Severity:** low (documentation systemic)
**Area:** docs (`docs/regression/**` stub authoring) + tooling (stub-authoring checklist / template)
**Found during:** Wave 7 doc batch (2026-05-20) — caught while closing [[BUG-REG-059]] and [[BUG-REG-061]], both of which pointed at `AGENTS.md` sections that do not exist anywhere in the repo's `AGENTS.md`.

## Scope

Several Wave 5 (and earlier) regression stubs were authored assuming an `AGENTS.md` structure with numbered/named sections (e.g. `§6.2`, `§6.A.email-validation`) that does not exist in the project repo's `AGENTS.md`. The repo-root has no `AGENTS.md`; the only `AGENTS.md` in the tree is `docs/openclaw-agents/manager/AGENTS.md`, which has §6 = "Progress log format" (not advertising routes) and no `§6.A.*` subsection family at all. The pointers are systemic phantoms, not occasional typos.

## Pattern recurrence

- **[[BUG-REG-045]]** — closed-invalid 2026-05-20. Original pointer was "Manager AGENTS.md §6.2 (advertising routes)"; closure note records that §6 in the actual file is Wave management, not advertising — pointer was stale at authoring time.
- **[[BUG-REG-059]]** — caught in Wave 7 doc batch (2026-05-20). Original pointer "AGENTS.md §6.2"; redirected to [`docs/contracts.md` § Banner soft-delete contract (per BUG-REG-059)](../../contracts.md#banner-soft-delete-contract-per-bug-reg-059).
- **[[BUG-REG-061]]** — caught in Wave 7 doc batch (2026-05-20). Original pointer "AGENTS.md §6.A.email-validation"; redirected to [`docs/contracts.md` § Email validation trim-then-validate contract (per BUG-REG-061)](../../contracts.md#email-validation-trim-then-validate-contract-per-bug-reg-061).

## Root cause

The stub-authoring template (informally inherited across Wave 4 and Wave 5 regression sessions) assumed an `AGENTS.md` spec structure with topically-organized numbered sections that was never adopted in repo form. Authors filed pointers at the hypothetical structure rather than verifying anchor existence in the actual `AGENTS.md` file at the time of writing.

## Suggested fix (deferred to Wave 9+)

1. Audit the remaining open `docs/regression/**` stubs for phantom `AGENTS.md` references (grep for `AGENTS.md §`).
2. For each phantom reference: either redirect to `docs/contracts.md` (for intentional-behavior contracts), or remove the pointer entirely if it was never meaningful.
3. Update the stub-authoring checklist (likely in `TOOLS.md` or a future workspace stub-template doc) to require **anchor-exists verification** at authoring time — before filing a stub that references an `AGENTS.md` (or any other doc) section, the author must confirm the anchor resolves in the current file.
4. Optional: linter / pre-commit check that warns when a `docs/regression/**` stub references an `AGENTS.md §X.Y` anchor that does not resolve.

## Acceptance criteria

- [ ] All open `docs/regression/**` stubs audited for phantom `AGENTS.md` references; each redirected, removed, or explicitly justified.
- [ ] Stub-authoring checklist updated to require anchor-exists verification.
- [ ] Optional linter / pre-commit check filed as a follow-up if the team wants automation.

## Out of scope

- Re-creating an `AGENTS.md` with the hypothetical section structure — `docs/contracts.md` is the going-forward home for intentional-behavior contracts; recreating a phantom structure would only re-introduce the original problem.
- Closing the redirected stubs ([[BUG-REG-059]], [[BUG-REG-061]]) again — those are already RESOLVED via the Wave 7 doc batch.

## Wave placement

**Wave 9+ backlog.** Low severity, doc-only systemic finding. Pick up in any future wave that has documentation-cleanup scope, or fold into the next agent-config / stub-template sync.

## Cross-references

- [[BUG-REG-045]] — first instance of the phantom-AGENTS.md pattern (closed-invalid 2026-05-20).
- [[BUG-REG-059]] — Wave 7 redirect to `docs/contracts.md` (banner soft-delete).
- [[BUG-REG-061]] — Wave 7 redirect to `docs/contracts.md` (email trim-then-validate).
- `docs/contracts.md` — the canonical home for intentional-behavior contracts going forward.
