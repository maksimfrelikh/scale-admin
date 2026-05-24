# 6.3 check-update no-update path — SUMMARY

**Verdict:** ✅ PASS 5/5. 0 bugs filed.
**Window:** 18:20–18:21 GMT+2.

## Probes & results

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 00 | Pre-ack v#5 (success) so device's persisted `currentCatalogVersionId` matches store | 201 acknowledged | 201; `{acknowledged:true,status:"success",versionId:"7da29b48-…",lastSyncAt:"2026-05-24T16:21:01.496Z"}` | ✅ |
| 01 | check-update **body omits** `currentCatalogVersionId` (device's DB row says v#5, but client doesn't send it) | hasUpdate=true (treated as no-current per service contract) | 201; hasUpdate=true; versionNumber=5 — server uses client-provided body field, not device DB row. Documented design choice. | ✅ |
| 02 | check-update **body sends matching v#5** uuid | hasUpdate=false + currentVersionId echo | 201; `{hasUpdate:false,currentVersionId:"7da29b48-4f9a-491a-8490-176a7f631ddb"}` | ✅ |
| 03 | check-update body.currentCatalogVersionId = `not-a-uuid-format-w6` | 400 | 400 "currentCatalogVersionId должен быть корректным UUID" | ✅ |
| 04 | check-update body.currentCatalogVersionId = `a7b3c4d5-6e7f-4a8b-9c0d-1e2f3a4b5c6d` (well-formed but unknown) | hasUpdate=true + latest packageData delivered (BUG-REG-031 closure re-verification) | 201; hasUpdate=true; versionNumber=5; sync log carries `errorMessage="Неизвестная версия каталога в requestedVersionId: a7b3c4d5-…"` while still delivering latest. **BUG-REG-031 closure intact.** | ✅ |

## ScaleSyncLog side-effects in 6.3

- Probe 00 → 1 × `ack_received` row (status=success)
- Probe 01 → 1 × `package_delivered` row (delivered v#5)
- Probe 02 → 1 × `no_update` row (no delivery; this is the target hit for 6.3 acceptance)
- Probe 03 → 0 sync log row (rejected at validation pipe BEFORE service)
- Probe 04 → 1 × `package_delivered` row with `errorMessage` carrying localized "unknown requestedVersionId" message, deliveredVersionId=v#5

## Design observation (not a bug)

`checkScaleUpdate` (`scales.service.ts:284`) makes its hasUpdate decision **purely on body.currentCatalogVersionId vs store.currentVersionId**. The device's persisted `ScaleDevice.currentCatalogVersionId` (updated by the success-ack path) is informational only — used by the admin dashboard to render the device's reported state, not by the sync decision. This is per spec: stateless sync. The scale is the single source of truth about what it currently holds; the server merely advertises "here is the latest."

## Bugs filed

None.
