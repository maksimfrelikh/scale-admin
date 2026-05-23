#!/bin/bash
# Deploy / restart staging stack
# Usage: ./scripts/deploy-staging.sh [deploy|build|up|down|logs|restart|seed|psql]

set -e

cd "$(dirname "$0")/.."

PROJECT="scale-admin-staging"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.staging.yml)
ENV_FILE=(--env-file .env.staging)

ACTION="${1:-up}"

resolve_version_metadata() {
  if [ -z "${BUILD_SHA:-}" ]; then
    BUILD_SHA="$(git rev-parse --short HEAD)"
  fi
  if [ -z "${BUILT_AT:-}" ]; then
    BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  fi
  export BUILD_SHA BUILT_AT
}

print_version_metadata() {
  echo "[deploy-staging] BUILD_SHA=$BUILD_SHA BUILT_AT=$BUILT_AT"
}

build_images() {
  resolve_version_metadata
  echo "[deploy-staging] Building images..."
  print_version_metadata
  docker compose "${COMPOSE_FILES[@]}" "${ENV_FILE[@]}" -p "$PROJECT" build --no-cache
}

start_stack() {
  resolve_version_metadata
  echo "[deploy-staging] Starting stack..."
  print_version_metadata
  docker compose "${COMPOSE_FILES[@]}" "${ENV_FILE[@]}" -p "$PROJECT" up -d
  echo ""
  echo "[deploy-staging] Stack status:"
  docker compose "${COMPOSE_FILES[@]}" "${ENV_FILE[@]}" -p "$PROJECT" ps
}

case "$ACTION" in
  deploy)
    build_images
    start_stack
    ;;
  build)
    build_images
    ;;
  up)
    start_stack
    ;;
  down)
    echo "[deploy-staging] Stopping stack (volumes preserved)..."
    docker compose "${COMPOSE_FILES[@]}" "${ENV_FILE[@]}" -p "$PROJECT" down
    ;;
  reset)
    echo "[deploy-staging] FULL RESET (volumes deleted)..."
    read -r -p "Are you sure? Type 'yes' to confirm: " CONFIRM
    if [ "$CONFIRM" = "yes" ]; then
      docker compose "${COMPOSE_FILES[@]}" "${ENV_FILE[@]}" -p "$PROJECT" down -v
      echo "[deploy-staging] Reset complete"
    else
      echo "[deploy-staging] Cancelled"
    fi
    ;;
  logs)
    SERVICE="${2:-backend}"
    docker compose "${COMPOSE_FILES[@]}" "${ENV_FILE[@]}" -p "$PROJECT" logs -f --tail=100 "$SERVICE"
    ;;
  restart)
    SERVICE="${2:-backend}"
    docker compose "${COMPOSE_FILES[@]}" "${ENV_FILE[@]}" -p "$PROJECT" restart "$SERVICE"
    ;;
  seed)
    echo "[deploy-staging] Manually triggering seed..."
    docker compose "${COMPOSE_FILES[@]}" "${ENV_FILE[@]}" -p "$PROJECT" exec backend npx prisma db seed
    ;;
  psql)
    echo "[deploy-staging] Opening psql..."
    docker compose "${COMPOSE_FILES[@]}" "${ENV_FILE[@]}" -p "$PROJECT" exec postgres psql -U scale_admin_staging -d scale_admin_staging
    ;;
  ps|status)
    docker compose "${COMPOSE_FILES[@]}" "${ENV_FILE[@]}" -p "$PROJECT" ps
    ;;
  *)
    echo "Usage: $0 [deploy|build|up|down|reset|logs|restart|seed|psql|ps]"
    echo ""
    echo "Common workflows:"
    echo "  Deploy code:  ./scripts/deploy-staging.sh deploy"
    echo "  First time:   ./scripts/deploy-staging.sh build && ./scripts/deploy-staging.sh up"
    echo "  Update code:  git pull && ./scripts/deploy-staging.sh deploy"
    echo "  Check logs:   ./scripts/deploy-staging.sh logs backend"
    echo "  Reset DB:     ./scripts/deploy-staging.sh reset"
    exit 1
    ;;
esac
