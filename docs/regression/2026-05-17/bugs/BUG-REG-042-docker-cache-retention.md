# BUG-REG-042 — Docker build-cache + leftover test images grow unbounded (no retention policy)

**Status:** OPEN — Wave 3 backlog (adjacent finding from infra session 2026-05-19)
**Severity:** medium (silent disk growth; recoverable, but eventually wedges the host once `/var/lib/docker` fills up)
**Area:** infra / docker hygiene
**Found during:** 2026-05-19 infra session (host disk pressure check during Wave 3 closure).

## Findings

- `docker buildx du` reported **~28 GB** of build cache accumulated over the previous **6 days** (Wave 1 + Wave 2 + Wave 3 image rebuilds). No retention policy in place, so cache grows indefinitely.
- Leftover test images from Wave 1 / Wave 2 regression rebuilds occupied another **~1.6 GB** (dangling tags + intermediate images that were never re-referenced).
- Manual cleanup performed today (`docker builder prune -af && docker image prune -af`) freed **~30 GB**: disk went from `45G used / 12G free` to `15G used / 42G free` on the dev host.

## Expected (suggested fix)

- A weekly retention cron — example:
  ```cron
  # Sunday 04:00 local
  0 4 * * 0 docker builder prune -af --filter=until=168h && docker image prune -af --filter=until=168h
  ```
- Lives in `infra/cron/docker-prune.cron` (or `scripts/docker-prune.sh` + a systemd timer if the host prefers that) so it's version-controlled, not host-state-only.
- README / runbook note pointing operators at the cron job and how to disable / tune the retention window.

## Impact

- **Silent disk exhaustion.** Without a retention policy, `/var/lib/docker` keeps growing. Once it crowds out `/var/log` / DB volume / image pulls, the next `docker compose up -d` will fail unexpectedly. Risk scales linearly with deploy frequency.
- **Already cost us ~30 GB on the dev host this week.** Not a one-off — it's the steady-state behaviour of the current setup.

## Acceptance criteria

1. Repo contains a checked-in cron entry (or equivalent systemd timer) that runs the prune commands weekly.
2. README / infra docs reference it and explain how to adjust the retention window.
3. After the first run on a host with existing accumulation, `docker buildx du` reports a sane working-set size (< ~5 GB).
4. The prune commands use `--filter=until=168h` so genuinely-recent cache is preserved (avoids slowing the very next build to a crawl).

## Out of scope

- `docker system prune` for volumes — volumes hold Postgres data; never auto-prune those.
- Migrating the build path to `buildx` to make cache management more granular — covered by [[BUG-REG-043]] (legacy-builder deprecation).
