#!/usr/bin/env bash
# Verify helpers for BUG-REG-027/029 against TEST stack (localhost:3001)
# Creds: admin@example.com / admin12345
# Source: source ./verify-helpers.sh

API=http://localhost:3001/api
ADMIN_COOKIES=/tmp/verify-admin-cookies.txt

csrf_fresh() {
  local cookies="$1"
  curl -s -c "$cookies" -b "$cookies" "$API/auth/csrf" > /dev/null
  grep -E "scale_admin_csrf|csrf" "$cookies" | awk '{print $7}' | head -1
}

admin_login() {
  rm -f "$ADMIN_COOKIES"
  csrf_fresh "$ADMIN_COOKIES" > /dev/null
  local csrf=$(grep -E "scale_admin_csrf|csrf" "$ADMIN_COOKIES" | awk '{print $7}' | head -1)
  curl -s -b "$ADMIN_COOKIES" -c "$ADMIN_COOKIES" \
    -H "Content-Type: application/json" \
    -H "x-csrf-token: $csrf" \
    -X POST "$API/auth/login" \
    -d '{"email":"admin@example.com","password":"admin12345"}' > /dev/null
  if ! grep -qE "scale_admin_session|session" "$ADMIN_COOKIES"; then
    echo "WARN: admin_login did not produce session cookie" >&2
    cat "$ADMIN_COOKIES" >&2
    return 1
  fi
}

admin_req() {
  local method="$1"; local path="$2"; local body="$3"
  local csrf=$(grep -E "scale_admin_csrf|csrf" "$ADMIN_COOKIES" | awk '{print $7}' | head -1)
  if [ -n "$body" ]; then
    curl -s -i -b "$ADMIN_COOKIES" -c "$ADMIN_COOKIES" \
      -H "Content-Type: application/json" \
      -H "x-csrf-token: $csrf" \
      -X "$method" "$API$path" -d "$body"
  else
    curl -s -i -b "$ADMIN_COOKIES" -c "$ADMIN_COOKIES" \
      -H "x-csrf-token: $csrf" \
      -X "$method" "$API$path"
  fi
}

admin_get_json() {
  curl -s -b "$ADMIN_COOKIES" -c "$ADMIN_COOKIES" "$API$1"
}

status_of() { echo "$1" | head -1 | awk '{print $2}'; }
body_of() { echo "$1" | awk '/^\r?$/{flag=1; next} flag'; }

# Test DB constants
STORE=cce1036c-7381-40bd-adf0-fddbe89cb4f9
CATALOG=400becc1-9dfa-4dd6-8871-c6d57a6c0d31
APPLES=f8e3732b-e29f-4342-977d-90d0c2db947e
APPLES_PRICE_ROW=9d90d3e4-57b5-4fd6-a22d-381e199edf73
BANANAS=bbab4e24-cb19-4a2e-bbcd-bdfeff6afc8e
SCALE_DEVICE=336f3a50-
