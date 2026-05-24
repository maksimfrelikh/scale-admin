# 6.2 check-update authentication — SUMMARY

**Verdict:** ✅ PASS 11/11. 0 bugs filed. Token verification + missing-creds detection + blocked-device gate + QS-bypass-attempt-ignored all enforced as expected.
**Window:** 18:18–18:20 GMT+2.

## Probes & results

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 01 | auth-check valid plain_02 via headers | 200 authenticated | 200; `{authenticated:true,device:{id,storeId,deviceCode:SCALE-W6-01,status:active}}` | ✅ |
| 02 | check-update with invalid 43-char-shaped token (`INVALID_TOKEN_throwaway_xx...`) | 401 SCALE_API_AUTH_FAILED | 401 + code | ✅ |
| 03 | unknown deviceCode `BOGUS-DEVICE-W6-XX` + throwaway token | 401 SCALE_API_AUTH_FAILED (no info-leak of "deviceCode not found" vs "wrong token") | 401 byte-identical to #02 ✓ — both wrong-device and wrong-token return same generic 401 | ✅ |
| 04 | missing both creds (empty body, no headers) | 401 SCALE_API_AUTH_FAILED | 401 + code | ✅ |
| 05 | valid body-credentials (deviceCode + apiToken in JSON body) on POST /scales/check-update | 201 + hasUpdate=true (device is at currentCatalogVersionId=null, store at v#5) | 201; hasUpdate=true; versionNumber=5 | ✅ |
| 06 | **🔴 query-string apiToken (THROWAWAY) on GET auth-check** | reject (must NOT be accepted) | 401 — guard reads only body fields + `x-scale-device-code`/`x-scale-api-token` headers. QS values are silently DROPPED at `scale-api-auth.guard.ts:51-70` (readCredential ignores `request.query`). **Security regression NOT present.** | ✅ |
| 07 | blocked device + valid token | 403 SCALE_DEVICE_NOT_ACTIVE | 403 "Устройству весов запрещена синхронизация"; code=SCALE_DEVICE_NOT_ACTIVE; restored to active after assertion | ✅ |
| 08 | **🔴 query-string apiToken (THROWAWAY) on POST check-update** | reject (must NOT be accepted) | 401 byte-identical to #06; same finding — QS path **not consumed** | ✅ |
| 09 | only deviceCode (header), no apiToken | 401 SCALE_API_AUTH_FAILED | 401 + code | ✅ |
| 10 | only apiToken (header), no deviceCode | 401 SCALE_API_AUTH_FAILED | 401 + code | ✅ |
| 11 | legacy route `POST /scale-api/check-update` with valid creds | 201 + same body shape as primary route | 201; hasUpdate=true; versionNumber=5; payload byte-identical structure | ✅ |

## 🔴 Security watchpoint — apiToken in query string

**RESULT:** Query-string credentials are **structurally ignored** by `ScaleApiAuthGuard.readCredential` (`backend/src/scales/scale-api-auth.guard.ts:51-70`). The guard reads:

```ts
const bodyValue = request.body?.[fieldName];
if (typeof bodyValue === 'string') return bodyValue;
const headerValue = getHeader(request, headerName);
if (headerValue) return headerValue;
return '';
```

Neither `request.query` nor `request.url` is consulted — query-string values for `apiToken` or `deviceCode` never reach the comparison. Result: guard treats them as missing → `missing_credentials` ScaleSyncLog row → 401 returned. Throwaway values were used (no real-token exposure risk).

**Verdict:** ✅ NO security regression. Defense-in-depth as designed.

## 🔴 Watchpoint — info-leak across "wrong device" vs "wrong token"

Both `invalid_credentials` paths (unknown deviceCode vs wrong token for valid device) return the **same** 401 body with code `SCALE_API_AUTH_FAILED` — no enumeration vector. The internal `ScaleSyncLog` records differ (`scaleDeviceId=null` vs `device.id` set) but the HTTP response is byte-identical.

## ScaleSyncLog side-effects accumulated in 6.2

- Probes #02, #03, #04, #06, #08, #09, #10 → 7 × `auth_failed` log rows (errorMessage values: `invalid_credentials` for #02/#03; `missing_credentials` for #04/#06/#08/#09/#10).
- Probe #01 → `lastSeenAt` update only (auth-check, no sync log).
- Probes #05, #07 (success arm), #11 → 3 × `package_delivered` log rows (device is stale → hasUpdate=true).
- Probe #07 (blocked arm) → 1 × `device_blocked` errorMessage row.

Total 6.2 sync logs added: ~11 rows. Will surface in §6.6 RBAC test.

## Bugs filed

None.
