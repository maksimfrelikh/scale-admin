# scripts/

Operational helpers for the scale-admin repo. Each script is self-contained and
documented in its own header; this README is a quick index plus operator notes
for anything that needs setup beyond `./scripts/<name>.sh`.

## Index

| Script | Purpose |
| --- | --- |
| `deploy-staging.sh` | Build / start / stop / restart the staging compose stack. |
| `docker-prune.sh` | Weekly Docker build-cache + image retention pruning (see below). |
| `docker-prune.cron` | Cron snippet that invokes `docker-prune.sh` on a weekly schedule. |
| `install-hooks.sh` | Install the repo's git hooks. |
| `openclaw-after-task-check.sh` | Post-task verification used by OpenClaw automation. |
| `openclaw-docker-verify.sh` | Verify Docker-side state for OpenClaw automation. |
| `openclaw-preflight.sh` | Preflight checks (JSON-aware) used by OpenClaw automation. |
| `test-secret-hook.sh` | Test fixture for the gitleaks pre-commit hook. |

## docker-prune.sh

### What it does

Runs `docker builder prune -af --filter=until=<retention>` followed by
`docker image prune -af --filter=until=<retention>` to reclaim disk space
consumed by stale build cache and dangling/unused images. Defaults to a **7-day**
(`168h`) retention window so genuinely-recent layers are preserved and the next
build doesn't pay a full cache miss.

Named volumes are **never** pruned — they hold Postgres data.

### Why it exists

Tracks **BUG-REG-042** (`docs/regression/2026-05-17/bugs/BUG-REG-042-docker-cache-retention.md`).
Without a retention policy, wave-over-wave image rebuilds accumulated **~28 GB**
of build cache and **~1.6 GB** of leftover test images on the dev host in 6 days.
This script + cron bounds that growth so `/var/lib/docker` doesn't silently
exhaust the partition.

### Install

1. Edit `scripts/docker-prune.cron` and replace `/opt/scale-admin` with the
   absolute path to wherever this repo is checked out on your host.
2. Append the cron line to the operator's crontab:

   ```bash
   crontab -l 2>/dev/null | { cat; cat scripts/docker-prune.cron; } | crontab -
   ```

3. Verify the entry was added:

   ```bash
   crontab -l | grep docker-prune
   ```

The script logs to stdout; cron will mail the output (or non-zero exit) to the
operator on each run.

### Tune the retention window

Two options, in order of preference:

- **Per-host override** — set `DOCKER_PRUNE_RETENTION` in the cron environment:

  ```cron
  DOCKER_PRUNE_RETENTION=336h
  0 4 * * 0 /opt/scale-admin/scripts/docker-prune.sh
  ```

  Common values: `72h` (3 days, aggressive), `168h` (7 days, default),
  `336h` (14 days, conservative).

- **In-repo default** — edit the `RETENTION="${DOCKER_PRUNE_RETENTION:-168h}"`
  line in `scripts/docker-prune.sh` and commit. Use this when the new value
  should be the project-wide default for every host.

### Preview what would be pruned (dry run)

```bash
docker builder prune --dry-run --filter=until=168h
docker image prune --dry-run --filter=until=168h
```

These print the candidate cache entries / images without touching anything.
Useful before tightening the retention window on a host with lots of state.

### Disable

```bash
crontab -l | grep -v docker-prune.sh | crontab -
```

### Run on demand

```bash
./scripts/docker-prune.sh
```

Safe to run any time — the `--filter=until=168h` flag means only cache/images
older than the retention window are touched.
