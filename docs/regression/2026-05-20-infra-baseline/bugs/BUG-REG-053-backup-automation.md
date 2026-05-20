# BUG-REG-053 — Backup automation (periodic + retention + uploaded files)

**Status:** OPEN — backlog
**Severity:** medium
**Area:** infra / backups
**Origin:** pre-Wave-5 infrastructure review (2026-05-20). Current backups exist only as a pre-deploy step inside `scripts/deploy-prod.sh` (commit `5daea4f`). Between deploys: nothing. The backup directory has no rotation, so it grows unboundedly. `FileAsset` uploads (advertising banner images, etc.) are not backed up at all — only the Postgres row pointing to them is.

## Steps to reproduce

1. Inspect prod backup directory: ad-hoc dumps from each deploy, no schedule, no retention.
2. Wait a week with no deploys: zero new backups generated.
3. Inspect uploads volume: no snapshot exists; if the volume is lost, all uploaded files are gone.

## Expected

Periodic backups independent of deploys, with explicit retention and uploads coverage.

## Actual

Backups piggyback on deploys, drift unboundedly, exclude uploads.

## Proposed

- **(a) Daily PostgreSQL dump** via `systemd` timer (or cron — coordinate with [[BUG-REG-050]] resolution).
- **(b) Weekly uploaded-files snapshot** (`tar.gz` of the uploads docker volume).
- **(c) Retention policy:** last 7 daily DB dumps + last 4 weekly file snapshots; older ones GC'd.
- **(d) Optional: offsite backup** (S3-compatible bucket or `rsync` to a second host).
- **(e) Restore procedure** documented in `scripts/README.md` + tested quarterly (or before each major release).

## Acceptance criteria

- [ ] Daily + weekly schedules verifiable via `systemctl list-timers` (or `crontab -l` per [[BUG-REG-050]] resolution).
- [ ] Retention enforced — backup directory does not grow unboundedly.
- [ ] Uploaded files included in the weekly snapshot.
- [ ] Restore procedure walked through once on a throwaway host and documented.

## Out of scope

- Real-time replication / streaming WAL — overkill, runs against single-host budget.
- Point-in-time recovery (PITR) — overkill for current RPO; daily snapshots are enough.
- Encrypted backup keys with HSM — defer until offsite backup actually lands.

## Wave placement

Backlog. Couples with [[BUG-REG-050]] (cron install path) and [[BUG-REG-052]] (deploy automation should consume the backup step as a workflow stage).

## Cross-references

- [[BUG-REG-050]] — share the cron / systemd-timer install path resolution.
- [[BUG-REG-052]] — deploy automation triggers a pre-deploy backup as a workflow stage.
