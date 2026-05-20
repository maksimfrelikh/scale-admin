# BUG-REG-046 — No DELETE endpoint for invites; admin cannot cancel an active invite

**Status:** RESOLVED — Wave 5, PR #24 (bb87059 invite DELETE + admin cancel UI)
**Severity:** medium
**Area:** backend / api / auth / invite flow
**Found during:** Wave 4 closure verify (2026-05-19) — side finding #3 in `docs/regression/2026-05-19-wave-4-closure/SUMMARY.md`. Three valid invite rows from the Block 1 run on prior tip `96d7d63` (`wave4-valid-…`, `wave4-tag+…`, `wave4-name-…`) still persist on staging because there's no way to cancel them.
**Related:** [[BUG-REG-022]] (invite duplicates allowed), [[BUG-REG-009]] (no GET/DELETE for invites — long-standing gap).

## Steps to reproduce

1. Authenticate as admin.
2. `POST /api/auth/invites` with a valid payload → 201 Created with a new `invite.id`.
3. Search the controller for a DELETE endpoint mounted on the invite resource:
   ```
   grep -RIn "Delete" backend/src/auth/ | grep -i invite
   ```
4. No matching route exists. Admin has no way to cancel the invite before it expires by time.

## Expected

`DELETE /api/auth/invites/:inviteId` — admin role, audit log entry, idempotent. Soft-delete (mark accepted/cancelled with a tombstone) is acceptable as long as the row stops being a valid invite-accept target.

## Actual

- No DELETE route. Workaround = wait for `expiresAt` to elapse, or dirty-rotate the invited email so the original token is orphaned.
- 3 valid invite rows from Wave 4 Block 1 stuck on staging until they expire.

## Hypothesis paths (for the eventual fix)

- **(a) Add `DELETE /api/auth/invites/:inviteId`** with admin guard + `AuditLog` entry. Simplest, matches REST conventions.
- **(b) Reuse the existing expire mechanism with a `force-now` flag** — `PATCH /api/auth/invites/:inviteId { expireNow: true }` flips `expiresAt` to `now()`. Less REST-pure but no new endpoint surface.
- **(c) Soft-delete via invalidate token hash** — keep the row, null out the hashed token, leave `acceptedAt` null but mark `cancelledAt`. Best audit story.

Combination of (a) + (c) is likely the right answer (REST DELETE that performs a soft-delete + audit entry), but defer the call to whoever picks the ticket up.

## Out of scope

- Invite UI changes (cancel button in admin users panel) — frontend follow-up if/when this backend endpoint lands.
- GET/list of invites — already tracked under [[BUG-REG-009]]; resolving DELETE without GET makes the cancel flow API-only, which may be acceptable until [[BUG-REG-009]] is closed.

## Wave placement

Backlog. Bundle with [[BUG-REG-009]] / [[BUG-REG-022]] into an "invite admin tooling" ticket if Maxim wants a single coherent invite-lifecycle pass.
