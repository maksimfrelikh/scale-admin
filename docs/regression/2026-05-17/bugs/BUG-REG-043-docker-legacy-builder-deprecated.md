# BUG-REG-043 — Docker legacy builder deprecation warning (future work, ≥ 1 year horizon)

**Status:** OPEN — Wave 3 backlog (future work)
**Severity:** low (non-blocking; warning only; functional today)
**Area:** infra / docker build pipeline
**Found during:** 2026-05-19 infra session (`docker builder prune` output included a deprecation notice).

## Findings

- `docker builder prune` emits a deprecation warning about the legacy builder. Docker plans to remove the legacy builder in a future major release; from that point forward all builds must go through `buildx` (BuildKit).
- Today this is purely informational — current `docker compose build` calls still work, cache still warms, images still produce identical artefacts.

## Expected (suggested future fix)

- Within roughly a year, migrate explicit `docker build` / `docker compose build` invocations to `docker buildx build` (or set `DOCKER_BUILDKIT=1` globally / via `~/.docker/config.json`).
- Coordinate with [[BUG-REG-042]]: switching to buildx changes the cache layout, which affects retention-prune commands.
- Audit any CI scripts that call `docker build` directly; same migration applies.

## Impact

- **Not blocking today.** Warning only; current builds succeed.
- **Will block in the future** once Docker removes the legacy builder. Plan a controlled migration well before that release lands rather than reacting on the day it breaks.

## Acceptance criteria

- Tracked as future-work only for now. Re-triage when the legacy builder removal is announced for a specific Docker release, or sooner if buildx-only features (e.g. multi-arch builds, advanced cache backends) are required for some other ticket.
- No code changes expected before that re-triage.
