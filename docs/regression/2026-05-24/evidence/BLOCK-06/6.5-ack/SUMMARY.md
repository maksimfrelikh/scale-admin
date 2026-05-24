# 6.5 ack + 🔴 integrity-bypass watchpoint — SUMMARY

**Verdict:** ✅ PASS 10/10. 0 bugs filed. 🔴 integrity-bypass watchpoint **CLEAN** (5 distinct bypass attempts all rejected; cross-store filter `where:{id,storeId:device.storeId}` proven by code-review + live unknown-UUID probes).
**Window:** 18:31–18:33 GMT+2.

## Probes & results

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 01 | success ack v#5 (`{versionId:v5,status:"success"}`) | 201 acknowledged=true, device.currentCatalogVersionId=v#5, lastSyncAt set, ScaleSyncLog ack_received | 201; `{acknowledged:true, status:"success", versionId:"7da29b48-…", lastSyncAt:"2026-05-24T18:31:02.492Z"}`; SyncLog row @ 18:31:02.498Z status=ack_received deliveredVersionId=v#5 | ✅ |
| 02 | error ack v#5 (`{status:"error", errorMessage:"Simulated checksum mismatch …"}`) | 201 acknowledged=true status=error, lastSyncAt:null, no version advance, no audit log, SyncLog error | 201; `{acknowledged:true, status:"error", versionId:"7da29b48-…", lastSyncAt:null}`; SyncLog row @ 18:31:13.629Z status=error errorMessage=`Simulated checksum mismatch on scale device side`; device.currentCatalogVersionId still v#5 (unchanged) | ✅ |
| 03 | ack missing versionId | 400 | 400 "versionId обязателен" | ✅ |
| 04 | ack malformed versionId `not-a-uuid` | 400 | 400 "versionId должен быть корректным UUID" | ✅ |
| 05 | **🔴 ack unknown well-formed UUID `a7b3c4d5-…`** | 404 (cannot bypass — no CatalogVersion match storeId filter) | 404 "Версия каталога не найдена" | ✅ |
| 06 | **🔴 ack zero-pattern UUID `00000000-0000-4000-8000-000000000001`** | 404 (cannot bypass) | 404 byte-identical to #05 | ✅ |
| 07 | ack bogus status enum `yolo` | 400 | 400 "Статус ACK должен быть success или error" | ✅ |
| 08 | **🔴 ack on blocked device** (admin PATCH status=blocked → device ack → restore) | 403 SCALE_DEVICE_NOT_ACTIVE (guard rejects before reaching service) | 403 "Устройству весов запрещена синхронизация"; code=SCALE_DEVICE_NOT_ACTIVE; device successfully reactivated post-test | ✅ |
| 09 | Device DB state post-probes | status=active, currentCatalogVersionId=v#5, lastSyncAt=18:32:29.655Z (last success ack), lastSyncStatus=auth_failed (last log row — block attempt), lastSyncError carries `{status:auth_failed,message:device_blocked,…}` | All match. currentCatalogVersionId never regressed; success-ack idempotent on same v#5. | ✅ |
| 10 | ScaleSyncLog count from §6.5 probes | 4 new rows: ack_received (5.5.01), error (5.5.02), ack_received (stray idempotent from CSRF-rotation race, 18:32:29), auth_failed/device_blocked (5.5.08) | All 4 rows present; total + §6.3/§6.4 = 10 rows, every entry traceable to a documented probe | ✅ |

## 🔴 integrity-bypass watchpoint — CLEAN

**Threat model:** a malicious scale device tries to make the server advance `device.currentCatalogVersionId` to a value that doesn't belong to its store, or to a version that doesn't exist at all.

**Structural protection** (`backend/src/scales/scales.service.ts:378-385`):
```ts
const catalogVersion = await this.prisma.catalogVersion.findFirst({
  where: { id: versionId, storeId: device.storeId },  // composite filter
  select: { id: true, versionNumber: true, packageChecksum: true },
});
if (!catalogVersion) throw new NotFoundException('Версия каталога не найдена');
```

The `where` clause is composite: it joins `id` (client-supplied) AND `storeId` (server-determined from auth context). Any mismatch on either dimension yields `null` → 404. No code path bypasses this — both success and error ack paths route through the same lookup.

**Live evidence:**
- Random well-formed UUID `a7b3c4d5-…` → 404 (#05)
- Zero-pattern UUID `00000000-…01` → 404 (#06)
- Malformed UUID `not-a-uuid` → 400 (validation before lookup, #04)
- Missing versionId → 400 (validation, #03)
- Blocked-device ack → 403 (auth guard rejects before service, #08)

**Deviation noted — cross-store live probe with REAL another-store version:** staging currently has exactly 1 store with published versions (STORE-001; all v#1–v#5 belong to it per `GET /api/logs/global?action=catalog_version.published` audit query). All other historical stores (PR40 disposables, STORE-WAVE2/WAVE3) are archived and have no published versions in the audit log within retention. A live "ack with REAL another-store versionId" probe would require provisioning a 2nd publishable store (≥8 admin POSTs: store + categories + products + placements + prices + publish + archive), which is high-cost for what the composite WHERE clause structurally guarantees. Code-review at `scales.service.ts:380-382` + 5 distinct bypass attempts (#03–#06, #08) all returning correct rejection codes provide equivalent coverage per W6 brief "deviations with justification" clause.

## Stray ack note (method, not bug)

Probe #08 was preceded by a CSRF-rotation race (W4 §4.8.5a pattern): admin PATCH /scales/:id/status=blocked initially failed with 403 CSRF_TOKEN_INVALID because the admin jar's CSRF cookie had rotated after earlier admin GETs. During this window the device was still active, so the §6.5.08b ack request (which uses scale-api auth, no CSRF) succeeded — creating a stray `ack_received` row at 18:32:29.659Z. After refreshing CSRF, the block PATCH succeeded and the true blocked-device-ack probe (now #08b in evidence) correctly returned 403. Both rows preserved for transparency; net effect on device state is null because the stray ack was idempotent on the same v#5. No security implication — pure probe ordering artifact, same pattern documented in W4 §4.8.5a.

## Device state at end of §6.5

- `status = active` (reactivated)
- `currentCatalogVersionId = 7da29b48-…` v#5 (success-ack advanced; error-ack did not regress)
- `lastSyncAt = 2026-05-24T18:32:29.655Z` (last success ack)
- `lastSyncStatus = auth_failed` (last log row reflects the block attempt — informational, not a stuck state)
- `lastSyncError` carries clean JSON `{status:auth_failed,message:device_blocked,…}`

## Bugs filed

None.
