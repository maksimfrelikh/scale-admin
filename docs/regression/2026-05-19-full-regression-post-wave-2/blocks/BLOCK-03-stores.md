# BLOCK 3 — Stores CRUD + Store Details + RBAC scoping

**Verdict:** PASS
**Time:** ~1 min
**Script:** `scripts/block-03-stores.cjs`
**Report JSON:** `evidence/block-03-report.json`

## Scenarios

| ID | Scenario | Expected | Actual | Verdict |
|---|---|---|---|---|
| 3.1 | Admin GET /stores — list visible | 200 + array | 200 + 53 stores (statuses: active, inactive) | ✅ |
| 3.2 | Create store (valid) | 201 + id | 201 + uuid `429e41b1-...` (code uppercased to `QA-W3-...`) | ✅ |
| 3.3 | Create duplicate code | 409 conflict | 409 "Store code already exists" | ✅ |
| 3.4 | Create empty code/name | 400 validation | 400 "Store code is required and must be at most 64 characters" | ✅ |
| 3.5 | GET /stores/:id | 200 + matching data | 200 | ✅ |
| 3.6 | GET /stores/:id/details (Catalog tab) | 200 + tab shape | 200, keys include `store`, `activeCatalog`, `overview`, `scales`, `syncLogs` | ✅ |
| 3.7 | Patch rename | 200 + new name | 200 | ✅ |
| 3.8 | Patch invalid status `banana` | 400 validation | 400 "Store status must be active, inactive, or archived" | ✅ |
| 3.9 | Archive (`status=archived`) | 200 | 200 | ✅ |
| 3.10 | List after archive — archived hidden? | depends on filter | archived not visible in default list (53 vs pre-create 53) | ✅ (expected) |
| 3.11 | Restore to active | 200 | 200 | ✅ |
| 3.12 | GET /stores/admin-check | 200 for admin | 200 + role=admin | ✅ |
| 3.13 | UI: admin sees Stores list + Create button | both present | both present | ✅ |
| 3.14 | Operator POST /stores | 403 | 403 | ✅ |
| 3.15 | Operator GET /stores — only assigned | 1 store visible (qa-operator's assignment) | count=1, code=`QA-PUB-20260516150944` | ✅ |
| 3.16 | Operator GET /stores/:id (unassigned) | 403 | 403 | ✅ |
| 3.17 | Operator GET /stores/admin-check | 403 | 403 | ✅ |
| 3.18 | Operator UI: sees assigned-stores banner, no Create button | banner present, button absent | banner present, button absent | ✅ |

## Notes

- New store `429e41b1-9096-4b54-b81a-178e4e2e4f08` (code `QA-W3-1779203588571`) left active in local DB. Used downstream and/or cleaned up at end of regression.
- Default `listVisibleStores` filters archived — confirmed via count stability across create+archive cycle.
- Store-code normalizer uppercases input (`qa-w3-...` → `QA-W3-...`). Documented, not a bug.

## Stack state at end of block

Local docker, CORS=localhost, +1 active test store, +1 active restored store left from 3.11.

## New BUG-REG opened
None.
