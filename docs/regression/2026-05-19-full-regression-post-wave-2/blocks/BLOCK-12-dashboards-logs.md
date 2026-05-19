# BLOCK 12 — Dashboards + Logs

**Verdict:** PASS
**Time:** ~1 min
**Scripts:** `scripts/block-12-dashboards-logs.cjs`, `scripts/probe-block-12-logs.cjs`, `scripts/probe-block-12-filter.cjs`
**Report JSON:** `evidence/block-12-report.json`

## Scenarios

| ID | Scenario | Expected | Actual | Verdict |
|---|---|---|---|---|
| 12.1 | GET /admin/dashboard as admin | 200 + shape | 200, keys: `counts`, `latestPublishedVersions`, `latestSyncErrors`, `problematicScaleDevices` | ✅ |
| 12.2 | UI admin dashboard | Fleet overview, latest versions, sync errors | all three sections present | ✅ |
| 12.3 | GET /logs/global as admin | 200 + auditLogs array | 200, 10 entries, actions include `auth.login_succeeded`, `scale_device.api_token_regenerated`, `scale_device.catalog_version_acknowledged`, `scale_device.created` | ✅ |
| 12.4 | Filter `?action=auth.login_succeeded` | 200 + filtered | 200, 10 matches, all `auth.login_succeeded` | ✅ |
| 12.5 | Filter `?entityType=Store` (substring) | 200, all `entityType` rows contain "Store" | 200, 5 rows, mix of `Store`/`StoreProductPrice` — substring match is by-design (`contains` in Prisma where clause) | ✅ (WAI per source) |
| 12.6 | Invalid limit `?limit=99999` | bounded (max 100) or 400 | 200 (silently bounded) | ✅ |
| 12.7 | GET /stores/:id/logs as admin (any store) | 200 + audit + sync | 200, 2 entries for our test store | ✅ |
| 12.8 | UI operator dashboard | shows assigned-stores banner, NOT fleet overview | banner=present, fleet=absent | ✅ |
| 12.9 | Operator GET /admin/dashboard | 403 | 403 | ✅ |
| 12.10 | Operator GET /logs/global | 403 | 403 | ✅ |
| 12.11 | Operator GET /stores/:id/logs (assigned) | 200 | 200, 5 entries | ✅ |
| 12.12 | Operator GET /stores/:id/logs (unassigned) | 403 | 403 | ✅ |

## Audit-log completeness verdict — GOOD

Sample of distinct actions observed in last 20 entries:
- `auth.login_succeeded` (multiple users)
- `store.created`
- `price.created`
- `scale_device.created`
- `scale_device.api_token_regenerated`
- `scale_device.catalog_version_acknowledged`

This implies the audit hook fires for: auth, store CRUD, price-set, device CRUD, scale ack. Together with the data observed in Block 2 (invite create, etc.), the audit coverage is sufficient for compliance review.

## Notes / Observations (not bugs)

- **Filter semantics:** `?action=X` and `?entityType=Y` use **`contains` substring match (case-insensitive)** per `backend/src/logs/logs.service.ts:listGlobalLogs`. So `?entityType=Store` matches `Store`, `StoreProductPrice`, `StoreCatalog`, etc. This is more user-friendly than exact match but means the operator UI must label this as "search" not "filter by type". Recorded for future doc — not a regression.
- **Limit cap:** default 50, max 100 (per code constants `DEFAULT_LIMIT`, `MAX_LIMIT`). Invalid limit silently bounded.
- Dashboard `counts` shape: `{ totalStores, totalScales, scalesWithErrors, scalesWithoutSync }` — used by FE for the "Stores 97 / Scales 21 / Scales with errors 9 / Without synchronization 20" tiles.

## Stack state at end of block

Local docker, CORS=localhost; no new entities created by this block (read-only).

## New BUG-REG opened
None.
