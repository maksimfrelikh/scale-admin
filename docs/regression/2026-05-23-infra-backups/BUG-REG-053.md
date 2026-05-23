# BUG-REG-053 - PostgreSQL backup automation and restore smoke

## Scope

Added manual-safe PostgreSQL backup and restore-smoke tooling:

- `scripts/backup-postgres.sh`
- `scripts/restore-postgres-smoke.sh`
- `docs/ops/postgres-backups.md`

No production database dump, restore, migration, restart, or scheduler
installation was performed.

## Safety model

`backup-postgres.sh` targets the configured Docker Compose `postgres` service and
creates a local custom-format dump with private file permissions. Operators can
set an explicit Compose project/env file before running it.

`restore-postgres-smoke.sh` always starts a disposable PostgreSQL Docker
container with no published ports, restores the dump there, checks metadata, and
removes the container unless `KEEP_RESTORE_SMOKE=1` is set.

## Deferred follow-ups

- Enable scheduling only after an explicit approval decides cron vs systemd and
  the host install path.
- Add uploaded-files snapshot automation so DB rows and `/app/uploads` files can
  be restored together.
- Add offsite backup copy/encryption/alerting after the local backup workflow is
  accepted.
