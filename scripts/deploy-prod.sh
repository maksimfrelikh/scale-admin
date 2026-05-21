#!/bin/bash
# Production deploy script for scale-admin
# Usage: ./scripts/deploy-prod.sh [deploy|status|logs|backup]
set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT="scale-admin"
COMPOSE_FILES=(-f docker-compose.yml)
ENV_FILE=(--env-file .env)
BACKUP_DIR="$HOME/backups/scale-admin"

ACTION="${1:-deploy}"

case "$ACTION" in
  status)
    echo "[deploy-prod] === Production status ==="
    echo ""
    echo "Local main:   $(git log --oneline -1)"
    git fetch origin main >/dev/null 2>&1
    echo "Origin main:  $(git log origin/main --oneline -1)"
    UNCOMMITTED=$(git status --porcelain | wc -l)
    echo "Working tree: $UNCOMMITTED uncommitted changes"
    echo "Branch:       $(git rev-parse --abbrev-ref HEAD)"
    echo ""
    echo "Backend container:"
    docker inspect scale-admin-backend --format='  Created: {{.Created}}{{"\n"}}  Status: {{.State.Status}}' 2>/dev/null || echo "  not running"
    echo ""
    echo "Postgres container:"
    docker inspect scale-admin-postgres --format='  Status: {{.State.Status}}' 2>/dev/null || echo "  not running"
    echo ""
    HEALTH=$(curl -s -o /dev/null -w "%{http_code}" https://maksimfrelikh.ru/api/health 2>/dev/null || echo "000")
    echo "Health endpoint: HTTP $HEALTH"
    ;;

  backup)
    mkdir -p "$BACKUP_DIR"
    TS=$(date +%Y%m%d-%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/scale-admin-prod-${TS}.sql.gz"
    echo "[deploy-prod] Backing up to $BACKUP_FILE..."
    docker exec scale-admin-postgres pg_dump -U scale_admin scale_admin | gzip > "$BACKUP_FILE"
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "[deploy-prod] Backup complete: $SIZE"
    ;;

  logs)
    SERVICE="${2:-backend}"
    docker compose "${COMPOSE_FILES[@]}" "${ENV_FILE[@]}" -p "$PROJECT" logs -f --tail=100 "$SERVICE"
    ;;

  deploy)
    echo "[deploy-prod] === PRODUCTION DEPLOY ==="
    echo ""

    # 1. Preflight: working tree clean
    if [ -n "$(git status --porcelain)" ]; then
      echo "[deploy-prod] ERROR: working tree has uncommitted changes."
      git status --short
      exit 1
    fi

    # 2. Preflight: on main
    BRANCH=$(git rev-parse --abbrev-ref HEAD)
    if [ "$BRANCH" != "main" ]; then
      echo "[deploy-prod] ERROR: not on main branch (on '$BRANCH')."
      exit 1
    fi

    # 3. Fetch
    echo "[deploy-prod] Fetching origin..."
    git fetch origin main

    LOCAL_SHA=$(git rev-parse HEAD)
    ORIGIN_SHA=$(git rev-parse origin/main)
    CURRENT_DEPLOYED=$(docker inspect scale-admin-backend --format='{{.Created}}' 2>/dev/null || echo "no container")

    echo ""
    echo "[deploy-prod] Local HEAD:    $LOCAL_SHA"
    echo "[deploy-prod] origin/main:   $ORIGIN_SHA"
    echo "[deploy-prod] Currently deployed container: $CURRENT_DEPLOYED"
    echo "[deploy-prod] Will deploy commit: $(git log --format='%h %s' -1 origin/main)"
    echo ""

    # 4. Confirm
    read -r -p "[deploy-prod] Proceed? Type 'yes': " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
      echo "[deploy-prod] Cancelled."
      exit 0
    fi

    # 5. Backup
    echo ""
    echo "[deploy-prod] === Step 1/5: Backup ==="
    mkdir -p "$BACKUP_DIR"
    TS=$(date +%Y%m%d-%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/scale-admin-prod-pre-deploy-${TS}.sql.gz"
    docker exec scale-admin-postgres pg_dump -U scale_admin scale_admin | gzip > "$BACKUP_FILE"
    echo "[deploy-prod] Backup: $BACKUP_FILE"

    # 6. Pull
    echo ""
    echo "[deploy-prod] === Step 2/5: Pull ==="
    git pull --ff-only origin main

    # 7. Build (inject git SHA + UTC timestamp for /api/version)
    echo ""
    echo "[deploy-prod] === Step 3/5: Build ==="
    BUILD_SHA=$(git rev-parse --short HEAD)
    export BUILD_SHA
    BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    export BUILT_AT
    echo "[deploy-prod] BUILD_SHA=$BUILD_SHA BUILT_AT=$BUILT_AT"
    docker compose "${COMPOSE_FILES[@]}" "${ENV_FILE[@]}" -p "$PROJECT" build

    # 8. Up (entrypoint handles migrate + seed per BUG-REG-038)
    echo ""
    echo "[deploy-prod] === Step 4/5: Recreate containers ==="
    docker compose "${COMPOSE_FILES[@]}" "${ENV_FILE[@]}" -p "$PROJECT" up -d --force-recreate

    # 9. Verify
    echo ""
    echo "[deploy-prod] === Step 5/5: Verify ==="
    echo "[deploy-prod] Waiting 10s for backend startup..."
    sleep 10

    HEALTH=$(curl -s -o /dev/null -w "%{http_code}" https://maksimfrelikh.ru/api/health 2>/dev/null || echo "000")
    echo "[deploy-prod] Health endpoint: HTTP $HEALTH"

    if [ "$HEALTH" = "200" ]; then
      echo "[deploy-prod] ✅ Deploy successful"
      echo ""
      echo "[deploy-prod] New container:"
      docker inspect scale-admin-backend --format='  Created: {{.Created}}{{"\n"}}  Status: {{.State.Status}}'
      echo ""
      echo "[deploy-prod] Backup retained: $BACKUP_FILE"
      echo "[deploy-prod] To rollback: git checkout <previous-sha> && ./scripts/deploy-prod.sh deploy"
    else
      echo "[deploy-prod] ⚠️  Health check failed (HTTP $HEALTH)"
      echo "[deploy-prod] Recent backend logs:"
      docker logs --tail 30 scale-admin-backend
      echo ""
      echo "[deploy-prod] Backup available at: $BACKUP_FILE"
      exit 2
    fi
    ;;

  *)
    echo "Usage: $0 [deploy|status|logs|backup]"
    echo ""
    echo "  deploy  - Full deploy ritual (preflight + backup + pull + build + up + verify)"
    echo "  status  - Show current production state vs main"
    echo "  logs    - Tail backend logs (optional service name)"
    echo "  backup  - Backup production database (no deploy)"
    exit 1
    ;;
esac
