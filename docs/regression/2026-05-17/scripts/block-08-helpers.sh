#!/usr/bin/env bash
# Helpers for BLOCK-08 prices runtime. Source after block-07-helpers.sh
# source ./block-07-helpers.sh && source ./block-08-helpers.sh

# Convenience: pretty status only (no body)
admin_status() {
  local method="$1"; local path="$2"; local body="$3"
  local raw
  if [ -n "$body" ]; then
    raw=$(admin_req "$method" "$path" "$body")
  else
    raw=$(admin_req "$method" "$path")
  fi
  echo "$raw" | head -1 | awk '{print $2}'
}

op_status() {
  local method="$1"; local path="$2"; local body="$3"
  local raw
  if [ -n "$body" ]; then
    raw=$(op_req "$method" "$path" "$body")
  else
    raw=$(op_req "$method" "$path")
  fi
  echo "$raw" | head -1 | awk '{print $2}'
}

# Run admin/op req and return only body
admin_body() {
  local method="$1"; local path="$2"; local body="$3"
  local raw
  if [ -n "$body" ]; then
    raw=$(admin_req "$method" "$path" "$body")
  else
    raw=$(admin_req "$method" "$path")
  fi
  body_of "$raw"
}

op_body() {
  local method="$1"; local path="$2"; local body="$3"
  local raw
  if [ -n "$body" ]; then
    raw=$(op_req "$method" "$path" "$body")
  else
    raw=$(op_req "$method" "$path")
  fi
  body_of "$raw"
}
