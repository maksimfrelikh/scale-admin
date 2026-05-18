#!/usr/bin/env bash
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/block-07-helpers.sh"
source "$HERE/block-09-helpers.sh"

CSRF="$(grep scale_admin_csrf "$ADMIN_COOKIES" | awk '{print $7}')"
URL="https://maksimfrelikh.ru/api/stores/$STORE_PUB/publishing/catalog-publish"

echo "URL=$URL"
echo "CSRF len=${#CSRF}"

OUT1="/tmp/pub-race-1.out"
OUT2="/tmp/pub-race-2.out"

curl -s -i -b "$ADMIN_COOKIES" -H "Content-Type: application/json" -H "x-csrf-token: $CSRF" -X POST "$URL" > "$OUT1" 2>&1 &
P1=$!
curl -s -i -b "$ADMIN_COOKIES" -H "Content-Type: application/json" -H "x-csrf-token: $CSRF" -X POST "$URL" > "$OUT2" 2>&1 &
P2=$!
wait $P1 $P2

echo '--- HEAD OUT1 ---'; head -1 "$OUT1"
echo '--- HEAD OUT2 ---'; head -1 "$OUT2"
echo '--- BODY OUT1 ---'; body_of "$(cat $OUT1)" | jq -c '{version_id:.version.id, versionNumber:.version.versionNumber, message:.message, statusCode}'
echo '--- BODY OUT2 ---'; body_of "$(cat $OUT2)" | jq -c '{version_id:.version.id, versionNumber:.version.versionNumber, message:.message, statusCode}'
echo '--- versions list now ---'; admin_body GET "/stores/$STORE_PUB/publishing/catalog-versions" | jq '[.versions[]|{versionNumber, id:.id[0:8], publishedAt}]'
