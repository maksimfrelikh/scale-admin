#!/usr/bin/env bash
# Redact obvious secrets in headers/JSON when piping evidence to disk.
# Usage: <input> | bash redact.sh > evidence.txt
# Wave 6 extension: apiToken plain (43-char base64url) + x-scale-api-token header.
# Wave 7 extension: Netscape cookies.txt tab-separated session/csrf values.
sed -E \
  -e 's/(scale_admin[A-Za-z0-9_]*session=)[A-Za-z0-9_\-]+/\1SESSION_VALUE_REDACTED/g' \
  -e 's/(scale_admin[A-Za-z0-9_]*csrf=)[A-Za-z0-9_\-]+/\1CSRF_VALUE_REDACTED/g' \
  -e $'s/(scale_admin[A-Za-z0-9_]*session\t)[A-Za-z0-9_\\-]+$/\\1SESSION_VALUE_REDACTED/g' \
  -e $'s/(scale_admin[A-Za-z0-9_]*csrf\t)[A-Za-z0-9_\\-]+$/\\1CSRF_VALUE_REDACTED/g' \
  -e 's/("password"\s*:\s*")[^"]+(")/\1PASSWORD_REDACTED\2/g' \
  -e 's/("token"\s*:\s*")[^"]+(")/\1INVITE_TOKEN_REDACTED\2/g' \
  -e 's/("csrfToken"\s*:\s*")[^"]+(")/\1CSRF_TOKEN_REDACTED\2/g' \
  -e 's/(x-csrf-token: )[A-Za-z0-9_\-]+/\1CSRF_HEADER_REDACTED/gi' \
  -e 's/("apiToken"[[:space:]]*:[[:space:]]*")[A-Za-z0-9_\-]{20,}(")/\1API_TOKEN_REDACTED\2/g' \
  -e 's/(x-scale-api-token:[[:space:]]*)[A-Za-z0-9_\-]+/\1API_TOKEN_HEADER_REDACTED/gi' \
  -e 's/(apiToken[[:space:]]*[:=][[:space:]]*)[A-Za-z0-9_\-]{20,}/\1API_TOKEN_REDACTED/g'
