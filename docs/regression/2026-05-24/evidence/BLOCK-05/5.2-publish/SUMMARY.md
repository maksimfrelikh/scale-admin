# 5.2 - Successful publish + CatalogVersion fields

**Verdict:** PASS 17/17 assertions

## Pre-publish state

- validate-pre.json: canPublish=true, 0 blocking, 0 warnings
- 1 active placement (P1, PLU W5T-42108-1, price 99.99 RUB in Wave5-Test root)
- 1 active banner

## Publish response

- HTTP 201 (~108ms)
- catalog.previousVersionId: `None` (null = first version)
- catalog.currentVersionId: `532847b6-348a-44c4-ba0b-a40305abe717` (updated after CatalogVersion create)
- version.id: `532847b6-348a-44c4-ba0b-a40305abe717`
- version.versionNumber: `1` (initialized to 1)
- version.status: `published`
- version.publishedAt: `2026-05-24T13:55:58.412Z`
- version.publishedByUserId: `da5fc991-346c-4fef-9a0a-026b8c362b7a` (matches operator session)
- version.basedOnVersionId: `None` (null = first)
- version.packageChecksum: `67e2f6d2f9ba91670121839d4fa481c8...` (64-char sha256)

## packageData.version self-reference

- packageData.version.id == version.id: OK
- packageData.version.checksum == version.packageChecksum: OK
- packageData.version.versionNumber == 1: OK
- packageData.version.publishedAt == version.publishedAt: OK

## Audit log entry

- action: `catalog_version.published`
- entityType: `CatalogVersion`
- entityId: `532847b6-348a-44c4-ba0b-a40305abe717` (matches version.id)
- actor email: `unit-cusp-slam@duck.com` (matches operator)
- createdAt: `2026-05-24T13:55:58.434Z` (within same transaction as publish)

## Assertions table

| # | Assertion | Result |
|---|-----------|--------|
| 1 | response status 201 | PASS |
| 2 | version.id matches catalog.currentVersionId | PASS |
| 3 | version.versionNumber == 1 (first) | PASS |
| 4 | version.status == published | PASS |
| 5 | publishedAt is ISO | PASS |
| 6 | publishedByUserId == operator (da5fc991) | PASS |
| 7 | basedOnVersionId is null (first version) | PASS |
| 8 | packageChecksum is sha256 (64 hex) | PASS |
| 9 | packageData.version.id == version.id | PASS |
| 10 | packageData.version.checksum == packageChecksum | PASS |
| 11 | packageData.version.versionNumber == 1 | PASS |
| 12 | packageData.version.publishedAt == publishedAt | PASS |
| 13 | previousVersionId == None (first) | PASS |
| 14 | audit log entry exists for this version | PASS |
| 15 | audit actor matches operator | PASS |
| 16 | audit entityType == CatalogVersion | PASS |
| 17 | audit createdAt within +1s of publishedAt | PASS |
