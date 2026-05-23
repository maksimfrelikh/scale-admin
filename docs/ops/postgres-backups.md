# PostgreSQL backups and restore smoke

This runbook covers the manual-safe backup scripts added for BUG-REG-053.

## Purpose

Scale Admin stores operational data in PostgreSQL. `scripts/backup-postgres.sh`
creates timestamped custom-format dumps from the Docker Compose `postgres`
service. `scripts/restore-postgres-smoke.sh` verifies that a dump can be restored
into a disposable PostgreSQL container.

The scripts are intentionally manual-safe building blocks. This task does not
install cron jobs, systemd timers, GitHub Actions schedules, or any production
deploy hook.

## Backup command

From the repo root:

```bash
./scripts/backup-postgres.sh
```

Default behavior:

- Compose files: `-f docker-compose.yml`
- Compose project: `scale-admin`
- Compose env file: `.env` when it exists
- Source service: `postgres`
- Output directory: `./backups/postgres`
- File pattern: `scale-admin-postgres-YYYYMMDDTHHMMSSZ.dump`
- Format: `pg_dump --format=custom`
- Retention: delete matching dumps older than `BACKUP_RETENTION_DAYS` days

The script creates the backup directory with mode `700` and writes dumps with
private permissions. It does not print database passwords, `DATABASE_URL`, or
dump contents.

## Configuration

Environment variables:

```bash
BACKUP_DIR=./backups/postgres
BACKUP_RETENTION_DAYS=14
BACKUP_PREFIX=scale-admin-postgres
POSTGRES_SERVICE=postgres
BACKUP_COMPOSE_FILES="-f docker-compose.yml"
BACKUP_COMPOSE_PROJECT=scale-admin
BACKUP_COMPOSE_ENV_FILE=.env
BACKUP_DRY_RUN=0
```

`BACKUP_RETENTION_DAYS=0` disables retention cleanup.

Dry run:

```bash
BACKUP_DRY_RUN=1 ./scripts/backup-postgres.sh
```

Staging-style explicit Compose target, for an operator who has approval to read
that environment:

```bash
BACKUP_COMPOSE_FILES="-f docker-compose.yml -f docker-compose.staging.yml" \
BACKUP_COMPOSE_PROJECT=scale-admin-staging \
BACKUP_COMPOSE_ENV_FILE=.env.staging \
./scripts/backup-postgres.sh
```

Do not run the backup command against production unless the operator has
explicit approval for production database reads.

## Restore smoke

Run restore smoke against an existing dump:

```bash
./scripts/restore-postgres-smoke.sh backups/postgres/scale-admin-postgres-YYYYMMDDTHHMMSSZ.dump
```

The restore target is always a temporary Docker container using
`postgres:16-alpine` by default. It has no published ports and is removed on
success or failure.

Optional overrides:

```bash
RESTORE_SMOKE_IMAGE=postgres:16-alpine
RESTORE_SMOKE_DB=restore_smoke
RESTORE_SMOKE_USER=restore_smoke
KEEP_RESTORE_SMOKE=1
```

`KEEP_RESTORE_SMOKE=1` leaves the disposable container running for manual
inspection. Remove it when finished:

```bash
docker rm -f <container-name>
```

The restore script does not read `DATABASE_URL` and does not accept a live target
database. It refuses obvious live Scale Admin names such as `scale_admin`,
`scale_admin_staging`, `scale-admin-postgres`, and
`scale-admin-staging-postgres`.

## Safety notes

- Do not commit files under `backups/`; `.gitignore` excludes local backup
  artifacts and common dump extensions.
- Do not paste backup contents, database passwords, full connection strings, or
  live `.env` values into chat or PR comments.
- Restore smoke must stay disposable: no production DB, no staging DB, no live
  Compose `postgres` target.
- Backups contain business data and should be handled as sensitive operational
  artifacts.

## Scheduling later

Actual enablement is deferred. A future approved task can add one of:

- cron entry that invokes `scripts/backup-postgres.sh`
- systemd service/timer pair
- production deploy hook that calls the standalone backup script before a risky
  migration
- offsite copy after local dump creation

Before enabling a schedule, decide the host install path, retention window,
failure alerting path, and offsite storage policy.

## Intentionally deferred

- Production scheduling or timer installation.
- Production backup execution during BUG-REG-053 implementation.
- Uploaded-file snapshot automation. `FileAsset.publicUrl` rows point at files
  in the uploads volume, so uploads still need a paired backup policy in a later
  task.
- Offsite backup encryption and rotation.
