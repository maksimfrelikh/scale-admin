#!/usr/bin/env bash
# restore-postgres-smoke.sh - restore a dump into disposable PostgreSQL.
#
# The target is always a temporary Docker container with no published ports.
# The script never restores into the project's production or staging Compose DB.

set -euo pipefail

IFS=$'\n\t'

fail() {
  echo "[restore-postgres-smoke] ERROR: $*" >&2
  exit 1
}

log() {
  echo "[restore-postgres-smoke] $*"
}

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/restore-postgres-smoke.sh <backup.dump>

Environment:
  RESTORE_SMOKE_IMAGE=postgres:16-alpine  Docker image for the disposable DB
  RESTORE_SMOKE_DB=restore_smoke          Disposable DB name
  RESTORE_SMOKE_USER=restore_smoke        Disposable DB user
  KEEP_RESTORE_SMOKE=1                    Keep the temp container for inspection

The script does not read DATABASE_URL and does not accept a live target DB.
USAGE
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

random_password() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    printf 'restore-smoke-%s-%s' "$(date +%s)" "$$"
  fi
}

refuse_live_name() {
  local label="$1"
  local value="$2"

  case "$value" in
    scale_admin|scale_admin_staging|scale-admin-postgres|scale-admin-staging-postgres|*weighly*)
      fail "$label looks like a live Scale Admin database target: $value"
      ;;
  esac
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

[ "$#" -eq 1 ] || {
  usage >&2
  exit 1
}

require_command docker

backup_file="$1"
[ -f "$backup_file" ] || fail "backup file not found: $backup_file"
[ -r "$backup_file" ] || fail "backup file is not readable: $backup_file"
[ -s "$backup_file" ] || fail "backup file is empty: $backup_file"

backup_file="$(readlink -f "$backup_file")"

RESTORE_SMOKE_IMAGE="${RESTORE_SMOKE_IMAGE:-postgres:16-alpine}"
RESTORE_SMOKE_DB="${RESTORE_SMOKE_DB:-restore_smoke}"
RESTORE_SMOKE_USER="${RESTORE_SMOKE_USER:-restore_smoke}"
RESTORE_SMOKE_PASSWORD="${RESTORE_SMOKE_PASSWORD:-$(random_password)}"
KEEP_RESTORE_SMOKE="${KEEP_RESTORE_SMOKE:-0}"
container_name="scale-admin-restore-smoke-$(date -u +%Y%m%dT%H%M%SZ)-$$"

case "$KEEP_RESTORE_SMOKE" in
  0|1) ;;
  *) fail "KEEP_RESTORE_SMOKE must be 0 or 1" ;;
esac

refuse_live_name "RESTORE_SMOKE_DB" "$RESTORE_SMOKE_DB"
refuse_live_name "RESTORE_SMOKE_USER" "$RESTORE_SMOKE_USER"
refuse_live_name "container name" "$container_name"

container_started=0

cleanup() {
  status=$?
  if [ "$container_started" = "1" ]; then
    if [ "$KEEP_RESTORE_SMOKE" = "1" ]; then
      log "keeping disposable container: $container_name"
    else
      docker rm -f "$container_name" >/dev/null 2>&1 || true
    fi
  fi
  exit "$status"
}
trap cleanup EXIT

log "starting disposable PostgreSQL container"
docker run -d \
  --name "$container_name" \
  --label scale-admin.restore-smoke=BUG-REG-053 \
  -e POSTGRES_DB="$RESTORE_SMOKE_DB" \
  -e POSTGRES_USER="$RESTORE_SMOKE_USER" \
  -e POSTGRES_PASSWORD="$RESTORE_SMOKE_PASSWORD" \
  "$RESTORE_SMOKE_IMAGE" >/dev/null
container_started=1

ready=0
for _ in $(seq 1 60); do
  if docker exec "$container_name" pg_isready -q -U "$RESTORE_SMOKE_USER" -d "$RESTORE_SMOKE_DB" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

[ "$ready" = "1" ] || fail "disposable PostgreSQL did not become ready"

docker cp "$backup_file" "$container_name:/tmp/restore.dump" >/dev/null

log "restoring dump into disposable database"
docker exec "$container_name" pg_restore \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  -U "$RESTORE_SMOKE_USER" \
  -d "$RESTORE_SMOKE_DB" \
  /tmp/restore.dump

table_count="$(
  docker exec "$container_name" psql \
    -X \
    -A \
    -t \
    -v ON_ERROR_STOP=1 \
    -U "$RESTORE_SMOKE_USER" \
    -d "$RESTORE_SMOKE_DB" \
    -c "select count(*) from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema');"
)"

case "$table_count" in
  ''|*[!0-9]*) fail "could not verify restored table count" ;;
esac

[ "$table_count" -gt 0 ] || fail "restore completed but no user tables were found"

log "restore verified: $table_count user tables"
log "restored table sample:"
docker exec "$container_name" psql \
  -X \
  -A \
  -t \
  -v ON_ERROR_STOP=1 \
  -U "$RESTORE_SMOKE_USER" \
  -d "$RESTORE_SMOKE_DB" \
  -c "select table_schema || '.' || table_name from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema') order by 1 limit 25;" \
  | sed 's/^/[restore-postgres-smoke]   /'

log "smoke restore passed"
