# 6.4 check-update with-update + 🔴 packageChecksum watchpoint — SUMMARY

**Verdict:** ✅ PASS 5/5. 0 bugs filed. 🔴 packageChecksum watchpoint **CLEAN** (recomputed sha256 byte-identical to stored v#5 checksum).
**Window:** 18:27–18:29 GMT+2.

## Probes & results

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 01 | check-update body=`{}` (no currentCatalogVersionId) | 201 + hasUpdate=true + full packageData v#5 | 201; `{hasUpdate:true, versionId:"7da29b48-…", versionNumber:5, packageChecksum:"46265c3a…", packageData:{advertising,catalog,categories,store,version}}` — shape matches PRD §6.12 (categories tree depth-1 with items, 1 active banner, store/catalog metadata, version{id,checksum,publishedAt,versionNumber}) | ✅ |
| 02 | **🔴 packageChecksum watchpoint** — recompute sha256(stableStringify(packageData with version.checksum=null)) | byte-match stored v#5 packageChecksum `46265c3a…` | stored=46265c3afa234df69b00d20e81d225e1a8f8f1c039e8627c75e5fc5f4fe1c720; echoed (packageData.version.checksum) **byte-identical**; recomputed **byte-identical**. CLEAN ✓ | ✅ |
| 03 | check-update body=`{currentCatalogVersionId:"00000000-0000-4000-8000-000000000001"}` (well-formed but unknown UUID) | 201 + hasUpdate=true + delivered v#5 + errorMessage in SyncLog | 201; same full packageData payload as #01; ScaleSyncLog row `errorMessage="Неизвестная версия каталога в requestedVersionId: 00000000-…"`, status=package_delivered (delivered latest despite mismatch — BUG-REG-031 closure intact, same path as §6.3.04) | ✅ |
| 04 | Device DB state post-checkupdate (admin GET /api/stores/:id/scales) | currentCatalogVersionId still v#5 (from §6.3 ack, NOT mutated by check-update probes); lastSeenAt/lastSyncStatus updated by check-update telemetry | currentCatalogVersionId=`7da29b48-…` v#5 **unchanged**; lastSeenAt=2026-05-24T18:28:56.246Z (updated by latest check-update); lastSyncStatus=`package_delivered` (updated per-call); updatedAt=2026-05-24T18:28:56.253Z. Version-state pointer NOT advanced by check-update — only by ack. | ✅ |
| 05 | ScaleSyncLog rows after §6.4 probes | 2 new `package_delivered` rows for probes 01 + 03, with correct deliveredVersionId=v#5 | Row @ 18:28:56 (probe 03, errorMessage Russian "unknown"); row @ 18:27:46 (probe 01, errorMessage=null); both `deliveredVersionId=7da29b48-…` v#5. Prior §6.3 rows untouched. | ✅ |

## 🔴 packageChecksum watchpoint — CLEAN

**Methodology:** per `backend/src/publishing/catalog-package.service.ts:167-173`, `calculatePackageChecksum = sha256(stableStringify(packageData))`. Per `catalog-publishing.service.ts:112-120`, the checksum is computed with `packageData.version.checksum=null`, then re-injected into the stored `packageData.version.checksum` field. So to verify:

1. Take received `packageData`
2. Set `version.checksum = null`
3. Compute `sha256(stableStringify(...))` using key-sorted recursive JSON (impl at `catalog-package.service.ts:349-365`)
4. Compare against stored `CatalogVersion.packageChecksum`

**Result:**
- stored (top.packageChecksum)          = `46265c3afa234df69b00d20e81d225e1a8f8f1c039e8627c75e5fc5f4fe1c720`
- echoed (packageData.version.checksum) = `46265c3afa234df69b00d20e81d225e1a8f8f1c039e8627c75e5fc5f4fe1c720`
- recomputed sha256                     = `46265c3afa234df69b00d20e81d225e1a8f8f1c039e8627c75e5fc5f4fe1c720`

**All three byte-identical.** Watchpoint CLEAN — packageData delivered to scale is bit-perfectly identical to what was published, no in-flight mutation, no checksum drift. Mirrors Wave 5 §5.3 finding for v#1; re-verified on v#5 (post Wave 5 §5.8 cleanup).

## packageData shape (PRD §6.12 verified)

```json
{
  "version": { "id": "7da29b48-…", "checksum": "46265c3a…", "publishedAt": "2026-05-24T14:03:13.354Z", "versionNumber": 5 },
  "store":    { "id": "e4d711db-…", "code": "STORE-001", "name": "Sample Store 001" },
  "catalog":  { "id": "8de2b1d0-…", "name": "Main Catalog" },
  "categories": [
    { "id": "…", "name": "…", "shortName": "…", "sortOrder": 0, "children": […], "items": [{plu,…,price,currency,…}] }
  ],
  "advertising": { "rotationMode": "loop", "banners": [{ "id":"5e2b476c-…", "imageUrl":"https://staging.maksimfrelikh.ru/uploads/images/7dddfe37-…jpg", "sortOrder":2 }] }
}
```

Top-level envelope on check-update response:
```json
{ "hasUpdate": true, "versionId": "7da29b48-…", "versionNumber": 5, "packageChecksum": "46265c3a…", "packageData": {…} }
```

## Design observations (not bugs)

1. **check-update mutates device telemetry** (`lastSeenAt`, `lastSyncStatus`, `updatedAt`) but NOT version-state (`currentCatalogVersionId`). Only `/ack` advances the version pointer. Confirms stateless-sync contract from §6.3 (server is source of truth for what to deliver; device is source of truth for what it currently has).
2. **Mismatch fake UUID (probe 03)** still receives full packageData; server logs `errorMessage` in SyncLog but does NOT block delivery. This is correct recovery semantics: device with garbage state recovers by accepting the server's latest. Documented as BUG-REG-031 closure in W5 §6.3.04.

## Bugs filed

None.
