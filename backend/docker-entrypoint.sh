#!/bin/sh
set -e

# BUG-REG-038 fix: run migrations before app start
# Conditional seed: only if SEED_ON_STARTUP=true

echo "[entrypoint] Starting Scale Admin backend"

# Extract host and port from DATABASE_URL
# Format: postgresql://USER:PASS@HOST:PORT/DB
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_HOST=${DB_HOST:-postgres}
DB_PORT=${DB_PORT:-5432}

echo "[entrypoint] Waiting for $DB_HOST:$DB_PORT to accept connections (max 60s)..."

MAX_WAIT=60
ELAPSED=0
until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null || [ $ELAPSED -ge $MAX_WAIT ]; do
  echo "[entrypoint] DB socket not ready yet... (${ELAPSED}s/${MAX_WAIT}s)"
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
  echo "[entrypoint] ERROR: DB socket not ready after ${MAX_WAIT}s, aborting"
  exit 1
fi

echo "[entrypoint] DB socket ready, running migrations..."
npx prisma migrate deploy

if [ "${SEED_ON_STARTUP:-false}" = "true" ]; then
  echo "[entrypoint] SEED_ON_STARTUP=true, running seed..."
  npx prisma db seed || echo "[entrypoint] Seed failed (may be already seeded), continuing"
fi

echo "[entrypoint] Starting application: $@"
exec "$@"
