# 3.4 Scale Devices — SUMMARY

**Verdict:** ✅ PASS (with critical apiToken redaction gate verified)
**Probes:** 13 (1 register, 1 list/leak-gate, 2 auth-check happy/fail, 1 regenerate, 1 old-token-401, 1 new-token-200, 2 status PATCH, 1 dup, 3 neg/RBAC)

## Probes & results

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 01 | POST /stores/:id/scales register SCALE-WAVE3-01 active | 201 + `apiToken` plain ONCE | 201, plain captured (43 chars), REDACTED-PLAIN-01 in evidence | ✅ |
| 02 | GET /stores/:id/scales list | 200, NO `apiToken` field in any device entry | 200; keys=`[id,storeId,deviceCode,name,model,status,lastSeenAt,lastSyncAt,currentCatalogVersionId,lastSyncStatus,lastSyncError,createdAt,updatedAt]` — no `apiToken`, no `apiTokenHash` | ✅ |
| 03 | GET /scale-api/auth-check with plain-01 header | 200, authenticated=true | 200, authenticated=true, device.status=active | ✅ |
| 04 | POST /scales/:id/regenerate-token | 201 + new plain ONCE, different from old | 201, plain-02 captured (43 chars), differs from plain-01 ✓ | ✅ |
| 05 | Old plain-01 via /scale-api/auth-check | 401 SCALE_API_AUTH_FAILED | 401 "Авторизация Scale API не выполнена", code=SCALE_API_AUTH_FAILED | ✅ |
| 06 | New plain-02 via /scale-api/auth-check | 200 authenticated | 200 authenticated=true | ✅ |
| 07 | PATCH /scales/:id/status blocked | 200, status=blocked | 200, `changed:true`, status=blocked | ✅ |
| 08 | Blocked device auth-check | 403 SCALE_DEVICE_NOT_ACTIVE | 403 "Устройству весов запрещена синхронизация", code=SCALE_DEVICE_NOT_ACTIVE | ✅ |
| 09 | PATCH back to active | 200 | 200, status=active | ✅ |
| 10 | POST dup deviceCode | 409 | 409 "Код устройства весов уже существует" | ✅ |
| 11 | PATCH bad status `banana` | 400 | 400 "Статус устройства весов должен быть active, inactive, blocked или archived" | ✅ |
| 12 | POST missing deviceCode | 400 | 400 "Код устройства обязателен..." | ✅ |
| 13 | **Operator (non-admin) POST register** | 403 | 403 "Недостаточно прав" | ✅ |

## CRITICAL apiToken redaction gate — ✅ CLEAN

Two redact passes:

1. **Verbatim plain-token grep** — `grep -rlF "$PLAIN_01" $EVID && grep -rlF "$PLAIN_02" $EVID`
   - Result: **both plain tokens NOT present in any evidence file** ✓

2. **Token-shape grep** — regex `[A-Za-z0-9_\-]{32,}` excluding UUIDs (8-4-4-4-12 hex) and `REDACTED-*` markers, with CORS-header noise filtering (Access-Control-Allow-*)
   - Result: **0 residual matches** ✓

Pre-disk redaction was performed in-memory immediately after capture:
- Plain tokens kept in `/tmp/.scale_plain_0{1,2}` (chmod 600, outside evidence dir).
- All evidence `*.txt`/`*.txt.raw` had `("apiToken": ")[...]` replaced with `REDACTED-PLAIN-0{1,2}` and `x-scale-api-token: ...` header values replaced with `REDACTED-PLAIN-0{1,2}` BEFORE write to evidence dir.

## Key security observations

1. **apiToken is plain in response ONLY at register (201) and regenerate (201).** Subsequent GET list does not expose plain OR hash (no `apiTokenHash` field in the public list response either — defense in depth).
2. **Token rotation works as designed.** Regenerate produces a new plain; the old plain is immediately rejected (401). This is the expected hash-swap behavior (`apiTokenHash` replaced atomically in `scales.service.ts:200`).
3. **Blocked device status is enforced at the auth guard layer** — not just at controller level. The `/scale-api/auth-check` returns 403 SCALE_DEVICE_NOT_ACTIVE with a distinct error code (vs 401 SCALE_API_AUTH_FAILED for wrong token), letting the device tell "blocked" from "wrong token" — appropriate granularity for device-side error handling, not an info-leak since it's the device's own status (not cross-device).
4. **Operator RBAC enforced** — non-admin role gets 403 byte-identical to W2 §2.3 "Недостаточно прав" pattern.

## Entities created

- SCALE-WAVE3-01 id=`3a052480-e326-4900-b53e-b615743c9cca`, on STORE-WAVE3-01, status=active (final), tokenHash rotated once.

## Bugs filed

None.

## Cleanup TODO for 3.8

- PATCH SCALE-WAVE3-01 → status=archived (or blocked, per brief: "block scales").
- `/tmp/.scale_plain_0{1,2}` to be wiped post-wave.
