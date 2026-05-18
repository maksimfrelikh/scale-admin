#!/usr/bin/env bash
# Helpers for BLOCK-07 catalog runtime tests
# Source this file: source ./block-07-helpers.sh

API=https://maksimfrelikh.ru/api
ADMIN_COOKIES=/tmp/qa-admin-cookies.txt
OP_COOKIES=/tmp/qa-operator-cookies.txt
# QA_PASSWORD must be exported by caller (see AGENTS.md §2). Refuse to run without it.
: "${QA_PASSWORD:?Set QA_PASSWORD env (see AGENTS.md §2 for QA creds) before sourcing this file}"

# Refresh CSRF cookie for given session file
csrf_fresh() {
  local cookies="$1"
  curl -s -c "$cookies" -b "$cookies" "$API/auth/csrf" > /dev/null
  grep scale_admin_csrf "$cookies" | awk '{print $7}'
}

# Re-login admin (in case session expires). Verifies session was issued.
admin_login() {
  rm -f "$ADMIN_COOKIES"
  csrf_fresh "$ADMIN_COOKIES" > /dev/null
  local csrf=$(grep scale_admin_csrf "$ADMIN_COOKIES" | awk '{print $7}')
  curl -s -b "$ADMIN_COOKIES" -c "$ADMIN_COOKIES" \
    -H "Content-Type: application/json" \
    -H "x-csrf-token: $csrf" \
    -X POST "$API/auth/login" \
    -d "$(jq -nc --arg p "$QA_PASSWORD" '{email:"qa-admin@***.invalid",password:$p}')" > /dev/null
  if ! grep -q scale_admin_session "$ADMIN_COOKIES"; then
    echo "WARN: admin_login did not produce session cookie" >&2
    return 1
  fi
}

op_login() {
  rm -f "$OP_COOKIES"
  csrf_fresh "$OP_COOKIES" > /dev/null
  local csrf=$(grep scale_admin_csrf "$OP_COOKIES" | awk '{print $7}')
  curl -s -b "$OP_COOKIES" -c "$OP_COOKIES" \
    -H "Content-Type: application/json" \
    -H "x-csrf-token: $csrf" \
    -X POST "$API/auth/login" \
    -d "$(jq -nc --arg p "$QA_PASSWORD" '{email:"qa-operator@***.invalid",password:$p}')" > /dev/null
  if ! grep -q scale_admin_session "$OP_COOKIES"; then
    echo "WARN: op_login did not produce session cookie" >&2
    return 1
  fi
}

# Run JSON POST/PATCH/DELETE with auto-CSRF for admin.
# Reads current csrf from cookies file (no rotation per-call).
admin_req() {
  local method="$1"; local path="$2"; local body="$3"
  local csrf=$(grep scale_admin_csrf "$ADMIN_COOKIES" | awk '{print $7}')
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

op_req() {
  local method="$1"; local path="$2"; local body="$3"
  local csrf=$(grep scale_admin_csrf "$OP_COOKIES" | awk '{print $7}')
  if [ -n "$body" ]; then
    curl -s -i -b "$OP_COOKIES" -c "$OP_COOKIES" \
      -H "Content-Type: application/json" \
      -H "x-csrf-token: $csrf" \
      -X "$method" "$API$path" -d "$body"
  else
    curl -s -i -b "$OP_COOKIES" -c "$OP_COOKIES" \
      -H "x-csrf-token: $csrf" \
      -X "$method" "$API$path"
  fi
}

# JSON-only response (no headers); rewrites cookies file (-c) so rotated session is captured
admin_get_json() {
  curl -s -b "$ADMIN_COOKIES" -c "$ADMIN_COOKIES" "$API$1"
}

op_get_json() {
  curl -s -b "$OP_COOKIES" -c "$OP_COOKIES" "$API$1"
}

# Extract status code from curl -i output
status_of() {
  echo "$1" | head -1 | awk '{print $2}'
}

# Extract JSON body from curl -i output
body_of() {
  echo "$1" | awk '/^\r?$/{flag=1; next} flag'
}
