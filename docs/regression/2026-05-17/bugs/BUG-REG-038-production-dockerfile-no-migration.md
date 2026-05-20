# BUG-REG-038 — Production Dockerfile + entrypoint missing automatic migration support

**Status:** RESOLVED — Wave 3, PR #14 (3a4236b auto-run prisma migrate)
**Severity:** high (каждый deploy с Prisma миграцией требует manual `docker cp prisma/` + `prisma migrate deploy` внутри контейнера; high risk of "merged migration is silently no-op" — exactly the BUG-REG-035 deploy failure mode на 2026-05-19).
**Area:** infra / backend Docker image / deploy pipeline
**Found during:** BUG-REG-035 cascade-archive production deploy (2026-05-19). Migration shipped в коммите was *not* applied on first deploy; limbo count went 84 → 86 (instead of 84 → 0) because the cleanup `UPDATE` never ran. Recovered by manual `docker cp backend/prisma <container>:/app/prisma && docker exec <container> npx prisma migrate deploy`.

## Steps to reproduce

1. Add a new file under `backend/prisma/migrations/<timestamp>_<slug>/migration.sql`. Commit + push + merge.
2. Trigger a production deploy (current pipeline: `docker compose build backend` + `docker compose up -d backend`).
3. Exec into the running backend container: `docker exec -it <backend_container> sh`.
4. `npx prisma migrate status` → reports *"schema not found"* OR *"migration foo is not applied"*, depending on which artifact is missing.
5. The new migration has NOT been applied. Application boots, queries the DB, business logic that relies on the migrated state silently runs against the un-migrated schema/data.

## Expected

Every successful production deploy of an image built from a commit that contains a new `backend/prisma/migrations/**` file results in `prisma migrate deploy` running before NestJS starts. Net result: `prisma migrate status` reports *"database schema is up to date"* без manual intervention.

## Actual

Production runtime image (current Dockerfile) does NOT bundle `backend/prisma/` at runtime. The build stage runs `prisma generate` (which emits the client into `node_modules/.prisma/client`) and that artifact is copied, but the schema + migration SQL files themselves are not. The runtime stage entrypoint is `node dist/main.js` — there is no migration step before app start.

Concretely:
- Production Dockerfile runtime stage copies only `dist/` + `node_modules/.prisma/` (generated client). `prisma/schema.prisma` and `prisma/migrations/**` are NOT present in the runtime image.
- No `entrypoint.sh` (or compose-level migration sidecar / job) executes `prisma migrate deploy` before NestJS startup.
- Result on 2026-05-19 035 deploy: container started, served traffic, ran new business-logic code against un-migrated schema for ~minutes until Maksim caught the limbo count discrepancy and manually pushed `prisma/` into the container.

## Impact

- **Silent migration skip on deploy.** Every backend release that ships a migration is currently a coin-flip between "Maksim remembered to docker-cp + migrate deploy by hand" and "migration silently does not apply, app runs against wrong schema, data integrity drifts."
- **BUG-REG-035 cleanup did NOT run automatically.** Required manual recovery during prod incident. Without 038 fix this hand-recovery is the default workflow for every future migration ticket.
- **Onboarding tax.** No one new to the codebase can ship a migration safely without first learning the manual ritual. This is invisible institutional knowledge — high risk of regression by any future contributor (human or agent).
- **Recovery is non-trivial in pathological cases.** If the un-migrated app *writes* data that's invalid under the migrated schema before someone notices, the manual migrate-deploy can fail на existing rows; cleanup then requires a one-off SQL.

## Hypothesis paths (for the eventual fix — DO NOT implement yet, Wave 3)

- **(a) Runtime-image migration on container start.** Add `COPY --from=builder /app/backend/prisma ./prisma` to the runtime stage. Add `entrypoint.sh`:
  ```sh
  #!/bin/sh
  set -e
  npx prisma migrate deploy
  exec node dist/main.js
  ```
  Set `ENTRYPOINT ["/app/entrypoint.sh"]`. Simplest, atomic with backend start, no extra orchestration. **Risk:** long-running migration blocks startup; if migration fails the container restarts in a loop. Need explicit migration timeout / non-zero exit handling.

- **(b) Dedicated migration container in `docker-compose.yml`.** A `backend-migrate` service that depends on `db`, runs `prisma migrate deploy` to completion, exits 0. `backend` service `depends_on: backend-migrate: condition: service_completed_successfully`. Cleaner separation of concerns, easier to spot a failed migration (it's a separate container in `docker compose ps`). **Risk:** more compose machinery; needs the same `prisma/` bundle in a separate image, or sharing it via volume.

- **(c) CI/CD pre-deploy migration job.** GitHub Actions step (or equivalent) runs `prisma migrate deploy` against the prod DB before the new `backend` image is rolled out. Decouples migration from container lifecycle; lets migrations run on infra without `prisma/` ever being in the runtime image. **Risk:** requires CI to have prod-DB credentials / VPN access; more brittle if the deploy pipeline is shell-based today (scope creep into deploy pipeline rework).

**Lead recommendation (for triage):** (a) is the smallest delta and atomically gated on container start; (b) is the "right" answer long-term once compose orchestration is the canonical deploy path; (c) is overkill until there's a real CI/CD pipeline. Default to (a) for the fix; revisit (b) in a follow-up infra ticket if compose-level lifecycle gets richer.

## Acceptance criteria

- After fix: `docker compose build backend && docker compose up -d backend` on a commit with a new pending migration → migration applied automatically before app starts serving traffic.
- `prisma migrate status` inside container reports *up to date* immediately after `up -d` settles.
- Failed migration → container exits non-zero, surfaced in `docker compose logs backend`. No silent skip path.
- Doc note in `backend/README.md` (or wherever deploy steps live) updated to remove the manual `docker cp` ritual.
- **Cross-check for BUG-REG-035:** after 038 fix lands and a subsequent deploy cycle runs, re-verify that the 035 cleanup migration would have run automatically (replay against a staging DB seeded with limbo rows). This closes the loop on the manual hack used during the 2026-05-19 prod incident.

## Out of scope

- Migration *rollback* semantics. Prisma's `migrate deploy` is forward-only; reverting bad migrations is a separate concern.
- Zero-downtime / blue-green migration strategy. Current deploy is restart-based; if zero-downtime becomes a requirement, that's its own ticket.
- Switching ORMs or migration tools. Prisma stays.

## Evidence

- 2026-05-19 BUG-REG-035 production incident: limbo count after migration deploy = 86 (expected 0; was 84 pre-deploy). Migration not applied. Manual recovery via `docker cp backend/prisma <container>:/app/prisma && docker exec <container> npx prisma migrate deploy` → 50 limbo rows cleaned, 36 remaining are by-PRD-design (StoreCatalog cascade out-of-scope for 035, tracked under TASK-063 candidate).
- Current production Dockerfile (review needed during fix discovery): runtime stage missing `COPY prisma/`. No `ENTRYPOINT` invokes migration.
- 035 PR (merged commit on `origin/main` 2026-05-19) — migration file committed but never auto-ran.
