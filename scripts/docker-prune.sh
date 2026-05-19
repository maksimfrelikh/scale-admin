#!/usr/bin/env bash
# docker-prune.sh — weekly Docker hygiene
#
# Prunes Docker build-cache and dangling/unused images older than the retention
# window (default: 168h = 7 days). Designed to be invoked by cron on a weekly
# cadence; see scripts/docker-prune.cron for the install snippet and
# scripts/README.md for operator notes.
#
# Why this exists: BUG-REG-042 (docs/regression/2026-05-17/bugs/) — without a
# retention policy, /var/lib/docker grows unbounded as wave-over-wave image
# rebuilds accumulate cache layers and dangling tags. Once the partition fills
# up, the next `docker compose up -d` will fail. This script bounds that growth.
#
# Out of scope (intentionally NOT pruned):
#   - Named volumes — they hold Postgres data. Never auto-prune.
#   - Recent cache (< retention window) — keeps the very next build fast.
#
# Exits non-zero on failure so cron-mail surfaces the error to the operator.

set -euo pipefail

RETENTION="${DOCKER_PRUNE_RETENTION:-168h}"

echo "[docker-prune] $(date -Is) starting; retention=${RETENTION}"

echo "[docker-prune] pruning build cache older than ${RETENTION}..."
docker builder prune -af --filter="until=${RETENTION}"

echo "[docker-prune] pruning dangling/unused images older than ${RETENTION}..."
docker image prune -af --filter="until=${RETENTION}"

echo "[docker-prune] $(date -Is) done"
