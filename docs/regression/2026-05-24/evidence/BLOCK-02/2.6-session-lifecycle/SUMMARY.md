# 2.6 Session lifecycle — SUMMARY

Verdict: **PASS** (all three sub-cases).

| # | Sub-case | Status | Body |
|---|---|---|---|
| 01 | POST `/api/auth/logout` (operator session) | **200** | `{"revoked":true}` |
| 02 | GET `/api/auth/session` after logout (same jar) | **401** | `{"message":"Требуется авторизация","error":"Unauthorized","statusCode":401}` |
| 03 | GET `/api/stores/{S001}/catalog/categories` after logout (same jar) | **401** | same as 02 |
| 04 | Re-login operator into fresh jar | **200** | session active |
| 05 | GET `/api/auth/session` with tampered cookie (last 4 chars mutated) | **401** | same as 02 |
| 06 | GET `/api/auth/session` with no cookie at all | **401** | same as 02 |

## Findings

- **2.6.a logout revokes the session immediately:** `revoked:true` from logout endpoint; the same jar then fails both `/api/auth/session` and any protected store endpoint with byte-identical 401 bodies. No window where the cookie still authenticates after logout. ✓
- **2.6.b session tampering rejected:** mutating the last 4 characters of the session cookie value (cryptographic suffix change) → 401 with the same generic body. The server doesn't surface "invalid signature" / "decryption failed" / "tampered" — it just returns the uniform "Требуется авторизация" indistinguishable from "no session at all". No oracle for attackers to test cookie validity beyond pass/fail. ✓
- **2.6.c no-cookie baseline matches 2.1:** byte-identical body to all 2.1 GETs (`Content-Length: 95`). Confirms no-session path produces the same 401 regardless of whether the caller never had a cookie, just logged out, or sent a malformed cookie.

## Cookie cleanup observation

The `Set-Cookie` header on the logout response cleared the session cookie (verified in `01-operator-logout.txt` raw output). The cookie name is `scale_admin_staging_session` (env-scoped per Wave 1 redaction note).

## Evidence

`01-operator-logout.txt` .. `06-no-cookie-session.txt` in this directory. All redacted.
