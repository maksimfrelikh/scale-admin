# 6.6 ScaleSyncLog + RBAC — SUMMARY

**Verdict:** ✅ PASS 9/9. 0 bugs filed. Admin/operator/anon role separation enforced; cross-store guard intact; sync-log shape correct; audit trail rows match expected scale_device.catalog_version_acknowledged events.
**Window:** 18:33–18:34 GMT+2.

## Probes & results

| # | Role/path | Expected | Actual | Status |
|---|-----------|----------|--------|--------|
| 01 | admin GET `/api/logs/global` | 200 + `{auditLogs,scaleSyncLogs}` global view | 200; auditLogs.meta.total=371, scaleSyncLogs.meta.total=30 | ✅ |
| 02 | operator GET `/api/logs/global` | 403 (admin-only per `@RequireRoles('admin')` at `logs.controller.ts:26`) | 403 "Недостаточно прав" | ✅ |
| 03 | admin GET `/api/stores/STORE-001/logs` | 200 + store-scoped data | 200; auditLogs.meta.total=113, scaleSyncLogs.meta.total=18 | ✅ |
| 04 | operator GET `/api/stores/STORE-001/logs` (operator HAS access to STORE-001) | 200; same store-scoped view as admin | 200; identical totals 113/18; same row shape | ✅ |
| 05 | operator GET `/api/stores/<fake-uuid>/logs` (foreign store) | 403 via `StoreAccessGuard` (no info-leak — same code regardless of store existence) | 403 "Нет доступа к магазину" | ✅ |
| 06 | anon GET `/api/logs/global` | 401 | 401 "Требуется авторизация" | ✅ |
| 07 | anon GET `/api/stores/STORE-001/logs` | 401 | 401 "Требуется авторизация" | ✅ |
| 08 | admin GET store-logs filtered by `scaleDeviceId=<SCALE-W6-01.id>` | 200 + only rows for that device | 200; 15 rows returned, every row is SCALE-W6-01 activity (all probe-traceable from §6.3-§6.5 + older session activity) | ✅ |
| 09 | admin audit rows `action=scale_device.catalog_version_acknowledged` for STORE-001 | exactly 3 rows (one per successful ack: §6.3.00, §6.5.01, §6.5.08-stray) | 3 rows @ 18:32:29.661Z, 18:31:02.502Z, 16:21:01.514Z; all `entityType=ScaleDevice`, `entityId=SCALE-W6-01.id`, `storeId=STORE-001`, `actor=null` (scale-api auth path has no User actor — by design) | ✅ |

## RBAC enforcement (PRD §6.6 + W2 §2.5 reuse)

| Surface | Admin | Operator (own store) | Operator (foreign) | Anon |
|---------|-------|----------------------|--------------------|------|
| `/api/logs/global` | 200 | **403** | n/a | 401 |
| `/api/stores/:storeId/logs` | 200 | 200 | **403** | 401 |

`logs.controller.ts:25-32`:
```ts
@Get('logs/global')
@RequireRoles('admin')              // hard admin-only
…
@Get('stores/:storeId/logs')
@RequireRoles('admin', 'operator')  // role gate
// + StoreAccessGuard on operator (mounted at module level for any store-scoped route)
```

## ScaleSyncLog content verification

All 10 §6.3-§6.5 probe rows present in store-scoped view, byte-identical to inline assertions in §6.3/§6.4/§6.5 SUMMARYs:

| Timestamp | Status | Probe |
|-----------|--------|-------|
| 2026-05-24T18:32:44.233Z | auth_failed (device_blocked) | §6.5.08b |
| 2026-05-24T18:32:29.659Z | ack_received | §6.5.08-stray (CSRF rotation race) |
| 2026-05-24T18:31:13.629Z | error | §6.5.02 |
| 2026-05-24T18:31:02.498Z | ack_received | §6.5.01 |
| 2026-05-24T18:28:56.254Z | package_delivered (errorMessage: unknown UUID 00000000-…) | §6.4.03 |
| 2026-05-24T18:27:46.958Z | package_delivered | §6.4.01 |
| 2026-05-24T16:21:01.900Z | package_delivered (errorMessage: unknown a7b3c4d5-…) | §6.3.04 |
| 2026-05-24T16:21:01.769Z | no_update | §6.3.02 |
| 2026-05-24T16:21:01.673Z | package_delivered | §6.3.01 |
| 2026-05-24T16:21:01.507Z | ack_received | §6.3.00 |

Older rows in `scaleDeviceId` filter (16:19–16:20 timestamps) trace to earlier §6.1/§6.2 auth probes (auth_failed before SCALE-W6-01 was active) and the §6.2.05 valid-body-credentials path probe (package_delivered before §6.3's first ack). All accounted for.

## Audit log fields (list view shape)

`auditLogs.data[i]` keys: `[action, actor, createdAt, entityId, entityType, id, store, storeId]`. **`metadata`/`beforeData`/`afterData` are NOT returned in the list view** (only the summary fields). Per-row deep detail (e.g., `packageChecksum` from ack success) is stored in DB but not exposed via the list endpoint — design choice for noise reduction. Not a bug; confirmed by inspecting raw response shape.

## Bugs filed

None.
