#!/usr/bin/env bash
# backup-postgres.sh - create a timestamped custom-format PostgreSQL dump.
#
# Defaults target the repo's Docker Compose postgres service. Override with
# BACKUP_COMPOSE_FILES / BACKUP_COMPOSE_PROJECT / BACKUP_COMPOSE_ENV_FILE when
# running against another explicit Compose project, for example staging.
#
# This script does not print database passwords, DATABASE_URL, or dump contents.

set -euo pipefail

IFS=$'\n\t'
umask 077

fail() {
  echo "[backup-postgres] ERROR: $*" >&2
  exit 1
}

log() {
  echo "[backup-postgres] $*"
}

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "not inside a git checkout"
cd "$repo_root" || fail "cannot cd to repo root"

read_env_default() {
  local key="$1"
  local default_value="$2"
  local value="${!key:-}"

  if [ -z "$value" ] && [ -f .env ]; then
    value="$(
      awk -F= -v key="$key" '
        /^[[:space:]]*($|#)/ { next }
        $1 == key {
          sub(/^[^=]*=/, "")
          print
          exit
        }
      ' .env
    )"
    value="${value%\"}"
    value="${value#\"}"
  fi

  if [ -n "$value" ]; then
    printf '%s' "$value"
  else
    printf '%s' "$default_value"
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

is_non_negative_integer() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}

require_command docker

BACKUP_DIR="$(read_env_default BACKUP_DIR "./backups/postgres")"
BACKUP_RETENTION_DAYS="$(read_env_default BACKUP_RETENTION_DAYS "14")"
BACKUP_PREFIX="$(read_env_default BACKUP_PREFIX "scale-admin-postgres")"
BACKUP_DRY_RUN="${BACKUP_DRY_RUN:-0}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
BACKUP_COMPOSE_FILES="${BACKUP_COMPOSE_FILES:--f docker-compose.yml}"
BACKUP_COMPOSE_PROJECT="${BACKUP_COMPOSE_PROJECT:-scale-admin}"
BACKUP_COMPOSE_ENV_FILE="${BACKUP_COMPOSE_ENV_FILE:-}"

[ -n "$BACKUP_DIR" ] || fail "BACKUP_DIR must not be empty"
case "$BACKUP_DIR" in
  /|.) fail "BACKUP_DIR must point at a dedicated backup directory, not '$BACKUP_DIR'" ;;
esac

case "$BACKUP_PREFIX" in
  ''|*[!A-Za-z0-9._-]*) fail "BACKUP_PREFIX may contain only letters, numbers, dot, underscore, and dash" ;;
esac

is_non_negative_integer "$BACKUP_RETENTION_DAYS" || fail "BACKUP_RETENTION_DAYS must be a non-negative integer"

case "$BACKUP_DRY_RUN" in
  0|1) ;;
  *) fail "BACKUP_DRY_RUN must be 0 or 1" ;;
esac

# BACKUP_COMPOSE_FILES is intentionally shell-split so operators can pass:
#   BACKUP_COMPOSE_FILES="-f docker-compose.yml -f docker-compose.staging.yml"
old_ifs="$IFS"
IFS=' '
read -r -a compose_args <<< "$BACKUP_COMPOSE_FILES"
IFS="$old_ifs"

if [ "${#compose_args[@]}" -eq 0 ]; then
  fail "BACKUP_COMPOSE_FILES produced no compose arguments"
fi

if [ -n "$BACKUP_COMPOSE_ENV_FILE" ]; then
  if [ ! -r "$BACKUP_COMPOSE_ENV_FILE" ] || [ -d "$BACKUP_COMPOSE_ENV_FILE" ]; then
    fail "BACKUP_COMPOSE_ENV_FILE is not readable: $BACKUP_COMPOSE_ENV_FILE"
  fi
  compose_args+=(--env-file "$BACKUP_COMPOSE_ENV_FILE")
elif [ -f .env ]; then
  compose_args+=(--env-file .env)
fi

if [ -n "$BACKUP_COMPOSE_PROJECT" ]; then
  compose_args+=(-p "$BACKUP_COMPOSE_PROJECT")
fi

mkdir -p "$BACKUP_DIR" || fail "cannot create BACKUP_DIR"
chmod 700 "$BACKUP_DIR" || fail "cannot set BACKUP_DIR permissions"
[ -d "$BACKUP_DIR" ] || fail "BACKUP_DIR is not a directory"
[ -w "$BACKUP_DIR" ] || fail "BACKUP_DIR is not writable"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$BACKUP_DIR/${BACKUP_PREFIX}-${timestamp}.dump"
tmp_file="${backup_file}.tmp"

run_compose() {
  docker compose "${compose_args[@]}" "$@"
}

container_id="$(run_compose ps -q "$POSTGRES_SERVICE")"
[ -n "$container_id" ] || fail "Compose service '$POSTGRES_SERVICE' is not running for project '$BACKUP_COMPOSE_PROJECT'"

container_state="$(docker inspect --format '{{.State.Status}}' "$container_id" 2>/dev/null || true)"
[ "$container_state" = "running" ] || fail "Compose service '$POSTGRES_SERVICE' is not running (state: ${container_state:-unknown})"

retention_candidates() {
  if [ "$BACKUP_RETENTION_DAYS" = "0" ]; then
    return 0
  fi

  find "$BACKUP_DIR" \
    -maxdepth 1 \
    -type f \
    -name "${BACKUP_PREFIX}-*.dump" \
    -mtime +"$BACKUP_RETENTION_DAYS" \
    -print
}

if [ "$BACKUP_DRY_RUN" = "1" ]; then
  log "dry run: would create $backup_file from Compose service '$POSTGRES_SERVICE'"
  if [ "$BACKUP_RETENTION_DAYS" = "0" ]; then
    log "dry run: retention cleanup disabled"
  else
    log "dry run: would delete backups older than ${BACKUP_RETENTION_DAYS} days matching ${BACKUP_PREFIX}-*.dump"
    retention_candidates | sed 's/^/[backup-postgres] dry run candidate: /'
  fi
  exit 0
fi

cleanup_tmp() {
  rm -f "$tmp_file"
}
trap cleanup_tmp EXIT

log "creating $backup_file"

# The variables in this snippet are intentionally expanded inside the postgres
# container, not by this host shell.
# shellcheck disable=SC2016
run_compose exec -T "$POSTGRES_SERVICE" sh -ceu '
  : "${POSTGRES_USER:?POSTGRES_USER is missing in the postgres container}"
  : "${POSTGRES_DB:?POSTGRES_DB is missing in the postgres container}"
  pg_isready -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"
  pg_dump --format=custom --no-password -U "$POSTGRES_USER" -d "$POSTGRES_DB"
' > "$tmp_file"

[ -s "$tmp_file" ] || fail "pg_dump produced an empty backup"
chmod 600 "$tmp_file"
mv "$tmp_file" "$backup_file"
trap - EXIT

size="$(du -h "$backup_file" | awk '{print $1}')"
log "backup complete: $backup_file ($size)"

if [ "$BACKUP_RETENTION_DAYS" = "0" ]; then
  log "retention cleanup disabled"
else
  log "deleting backups older than ${BACKUP_RETENTION_DAYS} days"
  while IFS= read -r old_backup; do
    [ -n "$old_backup" ] || continue
    rm -f -- "$old_backup"
    log "deleted old backup: $old_backup"
  done < <(retention_candidates)
fi
