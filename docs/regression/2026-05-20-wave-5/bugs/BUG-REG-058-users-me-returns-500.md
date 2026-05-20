# BUG-REG-058 — `GET /api/users/me` returns 500 (reserved-keyword collides with `:userId` catch-all)

**Status:** RESOLVED — Wave 6, PR #31 (5ec323d reserved keyword 'me' + 404 non-UUID)
**Severity:** medium (broken endpoint, even though canonical "who am I" is `/api/auth/session`)
**Area:** backend (`UsersController`)
**Origin:** Wave 5 closure regression — SUMMARY side finding #4 (`docs/regression/2026-05-20-wave-5/SUMMARY.md` lines 155-161). Newly discovered on the 2026-05-20 closure run.

## Scope (from SUMMARY side finding #4, verbatim)

> `GET /api/users/me` returns 500. The `:userId` catch-all in `UsersController` matches `me` and the service throws on the lookup instead of returning 404. Not blocking — canonical "who am I" is `GET /api/auth/session`, which is what the frontend already uses — but the controller should explicitly reject reserved keywords or the service should map the not-found case to a 404. Newly discovered on this run.

## Why this matters

A 500 on a well-formed REST request is a server-error contract violation. Even if no client currently hits `/api/users/me`, the next consumer (a contractor, a probe, a script) reasonably assumes either 404 (no such resource) or 200 (current-user shorthand). The current 500 is the worst of both worlds: an unhandled exception leaks through the global error filter.

## Discovery checklist (for actioning agent)

1. Inspect `backend/src/users/users.controller.ts` — find the route currently matching `GET /:userId` (no path prefix override).
2. Inspect `backend/src/users/users.service.ts` — find the lookup that throws on non-UUID/unknown id (likely a Prisma `findUniqueOrThrow` or similar bubbling without a `NotFoundException` wrap).
3. Pick one of:
   - **(A) Reject reserved keywords explicitly** — add an early `if (userId === 'me') throw new BadRequestException('Use /api/auth/session for current user')` or similar. Cheap, signposts the canonical alternative.
   - **(B) Implement `/me` as a real route** — `@Get('me')` declared before `@Get(':userId')` in the controller, delegating to `req.user` (via the existing auth guard) → same payload as `/api/auth/session`. More work; only worth it if there's appetite for a documented alias.
   - **(C) Map service not-found to 404** — wrap the lookup so any unknown `userId` (including `me`) returns a clean 404. Doesn't signpost the canonical alternative but fixes the contract violation.
4. **Recommended:** (A) + (C) combined — explicit reject for known reserved keywords + always-404 for unknown ids = both ergonomic and robust.

## Acceptance criteria

- [ ] `GET /api/users/me` no longer returns 500. Either 400 (reserved-keyword) or 404 (not found) — pick one and document.
- [ ] `GET /api/users/<nonexistent-uuid>` returns 404, not 500.
- [ ] `GET /api/users/<real-userId>` still works for admins.
- [ ] Spec coverage in `users.service.spec.ts` or `users.controller.spec.ts`.

## Out of scope

- Adding `/me` as a documented alias for `/api/auth/session` — separate UX decision; ticket here only fixes the 500.

## Wave placement

Backlog.

## Cross-references

- Wave 5 closure SUMMARY side finding #4.
- `frontend/src/...` — frontend uses `/api/auth/session`, not `/api/users/me`; no FE migration needed when this lands.
