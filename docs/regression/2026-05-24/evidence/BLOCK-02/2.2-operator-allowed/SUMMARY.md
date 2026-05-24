# 2.2 Operator allowed (STORE-001) — SUMMARY

Verdict: **PASS** (with PATCH price SKIP — no fixture data).

Operator (`unit-cusp-slam@duck.com`, id `da5fc991-…`) is assigned to STORE-001 only. 9 reads + 2 mutations exercised.

| # | Method | Path | Status | Notes |
|---|---|---|---|---|
| 01 | GET | `/api/stores/{S001}` | 200 | store record |
| 02 | GET | `/api/stores/{S001}/details` | 200 | aggregate (catalog+scales+banners counts) |
| 03 | GET | `/api/stores/{S001}/catalog/categories` | 200 | empty array, expected |
| 04 | GET | `/api/stores/{S001}/catalog/placements` | 200 | empty array |
| 05 | GET | `/api/products` | 200 | products list |
| 06 | GET | `/api/stores/{S001}/prices` | 200 | `data: []` (no price entries) |
| 07 | GET | `/api/stores/{S001}/advertising/banners` | 200 | multiple banners |
| 08 | GET | `/api/stores/{S001}/scales` | 200 | scale devices list |
| 09 | GET | `/api/stores/{S001}/logs` | 200 | store-scoped audit log |
| 10 | GET | `/api/stores/{S001}/advertising/banners/{B1}` | 200 | before-snapshot for mutation probe |
| 11 | PATCH | `/api/stores/{S001}/advertising/banners/{B1}` body `{"sortOrder":0}` | 200 | banner already at sortOrder=0 → idempotent no-op |
| 12 | GET | `/api/stores/{S001}/advertising/banners/{B1}` | 200 | after-snapshot: state byte-identical to before except `updatedAt` |
| 13 | PATCH | `/api/stores/{S001}/advertising/banners/{B1}/status` body `{"status":"archived"}` | 200 | already `archived` → idempotent no-op |

Banner `{B1}` = `3c608aaf-55d0-4834-9e5d-d120ee6b5176` (status=archived, sortOrder=0 — chosen specifically because it's already at the values we'd PATCH to, making both probes true no-ops).

## Findings

- All 9 operator-allowed read endpoints return 200. ✓
- Both PATCH probes against STORE-001 return 200 with the body shape from the route handler (`{ "banner": {…} }`). ✓
- Before/after byte-identical except `updatedAt` (proves the write hit the DB but didn't change observable state). ✓
- Operator session can write within their assigned store. ✓

## Skips

- **PATCH price → SKIP**: `GET /api/stores/{S001}/prices` returned `data: []` (no price entries seeded on staging). Mutation infeasible without first creating a product+catalog item (out of scope for 2.2). Operator's write authorization is still proven via the banner PATCH. Fixture gap to note in Lead rollup but not a bug — the operator-allowed write path is exercised by the banner PATCH probes.
- **PATCH placement → SKIP**: same — `placements: []`. Same justification.

## Evidence

`01-get-store.txt` .. `13-banner-status-patch.txt` in this directory. All redacted via `scripts/redact.sh`.
