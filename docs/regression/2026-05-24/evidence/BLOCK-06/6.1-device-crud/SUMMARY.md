# 6.1 Scale device CRUD — SUMMARY

**Verdict:** ✅ PASS 13/13. 0 bugs filed. apiToken plain captured once at register + once at regenerate; never echoed in subsequent reads.
**Window:** 18:17–18:18 GMT+2 (~70s wall).

## Probes & results

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 01 | ADMIN POST /api/stores/:id/scales register `SCALE-W6-01` active | 201 + `apiToken` plain ONCE (43 chars base64url) | 201; device.id=`a74c4951-3140-413f-85b4-67d2961db1dd`; apiToken len=43; stored only in `/tmp/scale-token-w6.txt` (chmod 600); evidence file shows `"apiToken":"API_TOKEN_REDACTED"` | ✅ |
| 02 | GET /api/stores/:id/scales — verify no plain or hash exposure | 200, NO `apiToken`, NO `apiTokenHash` field in any device entry | 200; keys per entry = `[createdAt,currentCatalogVersionId,deviceCode,id,lastSeenAt,lastSyncAt,lastSyncError,lastSyncStatus,model,name,status,storeId,updatedAt]`. `has apiToken=False`, `has apiTokenHash=False` ✓ | ✅ |
| 03 | OPERATOR POST register → expect 403 (admin-only RBAC) | 403 "Недостаточно прав" | 403 byte-identical message | ✅ |
| 04 | scale-api/auth-check with valid plain_01 (header) | 200 authenticated=true device.status=active | 200; `{authenticated:true,device:{id,storeId,deviceCode:SCALE-W6-01,status:active}}` | ✅ |
| 05 | PATCH /api/scales/:id/status `blocked` | 200 status=blocked changed=true | 200; status=blocked, changed=true | ✅ |
| 06 | auth-check with blocked device | 403 `SCALE_DEVICE_NOT_ACTIVE` | 403 "Устройству весов запрещена синхронизация"; code=SCALE_DEVICE_NOT_ACTIVE | ✅ |
| 07 | PATCH back to `active` | 200 status=active | 200; status=active, changed=true | ✅ |
| 08 | POST /api/scales/:id/regenerate-token | 201 + plain_02 (43 chars), differs from plain_01 | 201; plain_02 len=43; plain_02 ≠ plain_01 ✓ | ✅ |
| 09 | OLD plain_01 via auth-check | 401 SCALE_API_AUTH_FAILED | 401 "Авторизация Scale API не выполнена"; code=SCALE_API_AUTH_FAILED | ✅ |
| 10 | NEW plain_02 via auth-check | 200 authenticated | 200 authenticated=true | ✅ |
| 11 | Dup `deviceCode=SCALE-W6-01` | 409 | 409 "Код устройства весов уже существует" | ✅ |
| 12 | POST missing `deviceCode` | 400 | 400 "Код устройства обязателен и должен быть не длиннее 128 символов" | ✅ |
| 13 | PATCH bad status `banana` | 400 | 400 "Статус устройства весов должен быть active, inactive, blocked или archived" | ✅ |

## Hash-only storage verification

- **Source-code path** confirmed at `backend/src/scales/scales.service.ts:101-103` — register issues `createScaleApiToken()` (32 random bytes → base64url, 43 chars), computes `hashScaleApiToken(apiToken)` (sha256 → base64url), persists `apiTokenHash` only; `apiToken` plain is returned in HTTP response but never stored.
- **Regenerate** (`scales.service.ts:194-196`) same flow — new plain returned once, only hash persisted.
- **Public list shape** (`toDeviceResponse`, `scales.service.ts:566-590`) does not include `apiToken` or `apiTokenHash` field. Confirmed by GET probe #02 above.
- Plain tokens kept in `/tmp/scale-token-w6.txt` chmod 600 outside evidence dir; will be wiped in §6.8 cleanup.

## Token rotation hygiene

Regenerate atomically swaps `apiTokenHash` (`scales.service.ts:200`, inside `prisma.$transaction`). No silent dual-token grace period — old token rejected on the very next request (probe 09 = 401). Matches W3 §3.4 closure for BUG-REG-034 Stream A.

## 🔴 Security watchpoints — ALL CLEAN

- apiToken plain in **register** response: present ONCE (expected, by design)
- apiToken plain in **regenerate** response: present ONCE (expected, by design)
- apiToken plain in **list/auth-check/status PATCH** responses: **NOT present** ✓
- apiTokenHash in any public response: **NOT present** ✓
- RBAC operator → admin-only endpoint: 403 enforced ✓

## Entities created

- SCALE-W6-01 id=`a74c4951-3140-413f-85b4-67d2961db1dd`, on STORE-001, status=active (final), token rotated once.

## Bugs filed

None.
