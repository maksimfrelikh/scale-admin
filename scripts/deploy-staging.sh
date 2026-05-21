#!/bin/bash
# Deploy / restart staging stack
# Usage: ./scripts/deploy-staging.sh [build|up|down|logs|restart|seed|psql]

set -e

cd "$(dirname "$0")/.."

PROJECT="scale-admin-staging"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.staging.yml)
ENV_FILE=(--env-file .env.staging)

ACTION="${1:-up}"

case "$ACTION" in
  build)
    echo "[deploy-staging] Building images..."
    docker compose "${COMPOSE_FILES[@]}" "${ENV_FILE[@]}" -p "$PROJECT" build --no-cache
    ;;
  up)
    echo "[deploy-staging] Starting stack..."
    docker compose "${COMPOSE_FILES[@]}" "${ENV_FILE[@]}" -p "$PROJECT" up -d
    echo ""
    echo "[deploy-staging] Stack status:"
    docker compose "${COMPOSE_FILES[@]}" "${ENV_FILE[@]}" -p "$PROJECT" ps
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
    echo "Usage: $0 [build|up|down|reset|logs|restart|seed|psql|ps]"
    echo ""
    echo "Common workflows:"
    echo "  First time:   ./scripts/deploy-staging.sh build && ./scripts/deploy-staging.sh up"
    echo "  Update code:  git pull && ./scripts/deploy-staging.sh build && ./scripts/deploy-staging.sh up"
    echo "  Check logs:   ./scripts/deploy-staging.sh logs backend"
    echo "  Reset DB:     ./scripts/deploy-staging.sh reset"
    exit 1
    ;;
esac
