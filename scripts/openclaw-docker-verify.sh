#!/usr/bin/env bash
set -u

TASK_ID="${1:-}"

fail() {
  echo "DOCKER_VERIFY_RESULT=FAIL"
  echo "DOCKER_VERIFY_REASON=$1"
  exit 1
}

info() {
  echo "INFO: $1"
}

[ -n "$TASK_ID" ] || fail "missing task id"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "not inside git repo"
cd "$REPO_ROOT" || fail "cannot cd repo root"

[ -f docker-compose.yml ] || fail "docker-compose.yml not found"

info "task=$TASK_ID"
info "repo=$REPO_ROOT"
info "compose=docker-compose.yml"
info "docker-compose.override.yml intentionally ignored"

docker version >/dev/null 2>&1 || fail "docker daemon unavailable or permission denied"
docker compose version >/dev/null 2>&1 || fail "docker compose unavailable"

# shellcheck disable=SC2317,SC2329  # invoked via 'trap cleanup EXIT' below; shellcheck does not trace trap callbacks
cleanup() {
  docker compose -f docker-compose.yml stop backend >/dev/null 2>&1 || true
  docker compose -f docker-compose.yml up -d backend >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose -f docker-compose.yml up --build -d || fail "docker compose up failed"

docker compose -f docker-compose.yml ps || fail "docker compose ps failed"

for _ in {1..30}; do
  if curl -fsS http://localhost:3000/api/health >/dev/null 2>&1; then
    BACKEND_OK=1
    break
  fi
  sleep 2
done
[ "${BACKEND_OK:-0}" = "1" ] || fail "backend health did not return 200"

for _ in {1..30}; do
  if curl -fsS http://localhost:5173/ >/dev/null 2>&1; then
    FRONTEND_OK=1
    break
  fi
  sleep 2
done
[ "${FRONTEND_OK:-0}" = "1" ] || fail "frontend did not return 200"

docker compose -f docker-compose.yml stop backend >/dev/null || fail "failed to stop backend"

if curl -fsS http://localhost:3000/api/health >/dev/null 2>&1; then
  fail "backend health still returns 200 after backend stop"
fi

curl -fsS http://localhost:5173/ >/dev/null 2>&1 || fail "frontend did not serve while backend stopped"

docker compose -f docker-compose.yml up -d backend >/dev/null || fail "failed to restart backend"

for _ in {1..30}; do
  if curl -fsS http://localhost:3000/api/health >/dev/null 2>&1; then
    BACKEND_RESTART_OK=1
    break
  fi
  sleep 2
done
[ "${BACKEND_RESTART_OK:-0}" = "1" ] || fail "backend health did not recover after restart"

if [ -n "$(git status --short)" ]; then
  git status --short
  fail "git status is not clean"
fi

echo "DOCKER_VERIFY_RESULT=PASS"
exit 0
