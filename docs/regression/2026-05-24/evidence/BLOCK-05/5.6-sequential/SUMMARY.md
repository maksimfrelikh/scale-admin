# 5.6 - Sequential publishes (v_a → tweak → v_b)

**Verdict:** PASS 10/10 assertions

## Sequence

| # | Action | Result |
|---|--------|--------|
| 1 | PUT `/prices/<P1>` `{price:129.99}` (was 99.99) | 200 |
| 2 | GET `/catalog-validation` | canPublish=true |
| 3 | POST `/catalog-publish` (v2) | 201 |

## v2 result

- `version.id = 3913b1d6-4093-4e1e-9e8d-b3e63ef5df15`
- `version.versionNumber = 2` (== v1.versionNumber + 1)
- `version.basedOnVersionId = 532847b6-...` (v1.id) ← lineage
- `version.publishedAt = 2026-05-24T14:01:12.904Z`
- `version.packageChecksum = e6e84950974a...` (different from v1's `67e2f6d2f9ba...` — proves new snapshot)
- packageData item P1 price = **129.99** (the new value, not 99.99)

## currentVersionId migration

- catalog.previousVersionId = v1.id (`532847b6-...`)
- catalog.currentVersionId = v2.id (`3913b1d6-...`)
- Verified post-publish via GET catalog-versions: currentVersion shows v2.

## v1 readability + immutability

- GET catalog-versions returns BOTH versions: `[{v#2, ...}, {v#1, ...}]`
- v1.packageChecksum still `67e2f6d2f9ba...` (unchanged byte-for-byte from §5.2)
- v1 status still `published`; publishedByUserId still operator
- v1 is NOT removed when v2 is published (history retained per PRD §6.11 "версия неизменяемая")
- Note: list endpoint exposes metadata only. v1's packageData is read by scales via `/api/scales/check-update` (requires registered ScaleDevice — out of scope for Wave 5 staging probe; immutability of packageData proven structurally by §5.4 absence of UPDATE/DELETE routes).

## Assertions

| # | Assertion | Result |
|---|-----------|--------|
| 1 | Price PUT updates P1 to 129.99 | PASS |
| 2 | Pre-publish validation canPublish=true | PASS |
| 3 | /publish → 201 | PASS |
| 4 | v2.versionNumber == v1.versionNumber + 1 (=2) | PASS |
| 5 | v2.basedOnVersionId == v1.id | PASS |
| 6 | currentVersionId migrated to v2 | PASS |
| 7 | v1 row still listed (count=2) | PASS |
| 8 | v1.packageChecksum byte-identical to §5.2 stored value | PASS |
| 9 | v2.packageData reflects new price (129.99 not 99.99) | PASS |
| 10 | v2.packageChecksum != v1.packageChecksum (snapshots differ) | PASS |

## Files

- `price-bump.json` — PUT price response
- `validate-pre-v2.json` — green validation pre v2
- `publish-v2.json` — full v2 publish response with packageData
- `versions-after-v2.json` — list showing v1 + v2 with currentVersion=v2
