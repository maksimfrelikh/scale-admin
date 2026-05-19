# BLOCK 11 — Scale API

**Verdict:** PASS — BUG-REG-031 closure CONFIRMED
**Time:** ~1 min
**Scripts:** `scripts/block-11-scale-api.cjs`, `scripts/probe-block-11-bug031.cjs`
**Report JSON:** `evidence/block-11-report.json`

## Scenarios

| ID | Scenario | Expected | Actual | Verdict |
|---|---|---|---|---|
| 11.0 | Setup: store + cat + prod + price + publish + device | all created, apiToken returned | all ok, deviceCode + apiToken received | ✅ |
| 11.1 | GET /scale-api/auth-check with valid creds | 200 + device info | 200, device.id + storeId correct | ✅ |
| 11.2 | Auth-check with wrong token | 401 SCALE_API_AUTH_FAILED | 401 + code matches | ✅ |
| 11.3 | POST /scales/check-update — no currentCatalogVersionId | 201 + hasUpdate:true + packageData | 201, packageData present | ✅ |
| 11.4 | check-update with current = latest | 201 + hasUpdate:false | 201 | ✅ |
| 11.5 | check-update with nil UUID `00000000-...-000000000000` | 400 (nil UUID rejected) | 400 "currentCatalogVersionId must be a valid UUID" | ✅ (separate validation guard) |
| 11.5b (probe) | **BUG-REG-031 closure** — check-update with random valid-but-unknown UUID | 201 + hasUpdate:true + latest packageData (treat as stale, NOT 500) | 201 + `hasUpdate:true, versionId: <latest>` | ✅ |
| 11.6 | check-update with malformed `not-a-uuid` | 400 | 400 "currentCatalogVersionId must be a valid UUID" | ✅ |
| 11.7 | check-update with empty string `""` | 201 (treated as "no current") | 201 | ✅ |
| 11.8 | POST /scales/ack — status=success | 201 + acknowledged | 201 `{acknowledged:true, status:"success", versionId:<>, lastSyncAt:<>}` | ✅ |
| 11.9 | POST /scales/ack — status=error + errorMessage | 201 + acknowledged | 201 `{acknowledged:true, status:"error", lastSyncAt:null}` | ✅ |
| 11.10 | ack without creds | 401 | 401 | ✅ |
| 11.11 | Admin: POST /scales/:id/regenerate-token | 201 + new token | 201, new token (length 43), different from old | ✅ |
| 11.12 | Old token after regen | 401 (token rotated) | 401 | ✅ |
| 11.13 | New token works | 200 | 200 | ✅ |
| 11.14 | Admin: GET /stores/:id/scales — sync log shape | 200 + fields incl. lastSeenAt, lastSyncAt, currentCatalogVersionId, lastSyncStatus, lastSyncError | all 13 fields present including `lastSyncAt`, `lastSyncStatus`, `lastSyncError` | ✅ |

## BUG-REG-031 closure verdict — CONFIRMED

> commit `50d2308` — fix(scales): treat unknown requestedVersionId as stale, not 500 (BUG-REG-031)

Before fix: passing a well-formed UUID not present in `catalog_version` → 500 Internal Server Error.

Probe `probe-block-11-bug031.cjs` posted `27065056-3c28-48e2-9572-90555dc50806` (freshly-generated, never seen in DB) to `/api/scales/check-update`. Response: **201** with `{ hasUpdate: true, versionId: <latest>, versionNumber: <latest>, packageData: {...} }`. The scale receives the latest available catalog instead of an error — exactly as the fix intends.

A separate, defense-in-depth guard rejects malformed UUIDs (`not-a-uuid`) and the nil UUID (`00000000-...`) with 400. Both are conceptually different from "unknown well-formed UUID" and were never under BUG-REG-031 scope.

## Token rotation hygiene (BUG-REG-034 Stream A cross-check)

- Regenerate-token endpoint returns a fresh 43-char token.
- The old token is rejected with 401 on the very next request.
- No silent dual-token period — clean rotation.

## Notes

- Scale-API uses bearer-style auth via headers `x-scale-device-code` + `x-scale-api-token` (no CSRF, `@SkipCsrf()` decorator).
- Rate limit on scale-api endpoints: 20/min per IP (per `@RateLimit({ bucket: 'scale-api', maxAttempts: 20, windowSeconds: 60 })`).
- Sync log columns surfaced via GET /stores/:id/scales include enough to drive the operator dashboard (lastSyncStatus, lastSyncError).

## Stack state at end of block

Local docker, CORS=localhost; +1 test store with 1 device + 1 published version + 1 ack+1 sync-error event.

## New BUG-REG opened
None.
