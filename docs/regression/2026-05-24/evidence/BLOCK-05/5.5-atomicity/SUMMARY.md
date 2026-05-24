# 5.5 - Atomicity (publish with intentional blocker)

**Verdict:** PASS 6/6 assertions — 🔴 atomicity watchpoint CLEAN

## Sequence

1. **Pre-snapshot** (`pre.json`):
   - COUNT(CatalogVersion) = 1
   - currentVersion.id = `532847b6-348a-44c4-ba0b-a40305abe717`
   - currentVersion.versionNumber = 1

2. **Introduce blocker**: created Wave5 Atomicity Product (P5 = `797150ef-…`), placed in CAT_ROOT (PL5 = `5be9764f-…`), no price set.

3. **Validate** (`val-blocked.json`):
   - canPublish = false
   - 1 blocking error: `ACTIVE_PLACEMENT_PRICE_MISSING` with productId=P5, storeId=STORE-001.

4. **POST `/catalog-publish`** (`publish-blocked-resp.json`):
   - HTTP 400
   - body: `{"message":"В каталоге есть блокирующие ошибки проверки, поэтому его нельзя опубликовать","validation":{...full validation snapshot embedded...}}`

5. **Post-snapshot** (`post.json`):
   - COUNT(CatalogVersion) = 1 ← unchanged
   - currentVersion.id = `532847b6-…` ← unchanged
   - currentVersion.versionNumber = 1 ← unchanged

6. **Fix**: PATCH PL5 status=archived → 200. Re-validate → canPublish=true.

## Atomic assertions

| # | Assertion | Result |
|---|-----------|--------|
| 1 | /publish → HTTP 400 (validation rejected) | PASS |
| 2 | COUNT(CatalogVersion) unchanged (1 == 1) | PASS |
| 3 | currentVersionId unchanged | PASS |
| 4 | currentVersion.versionNumber unchanged (1 == 1) | PASS |
| 5 | Response includes embedded validation snapshot | PASS |
| 6 | Fix path restores canPublish=true | PASS |

## Code path proof (atomicity by construction)

`catalog-publishing.service.ts:86-194`:
- Validation runs BEFORE `prisma.$transaction(...)` opens.
- If `validation.canPublish === false`, service throws `BadRequestException` at line 94.
- Transaction never starts → no `catalogVersion.create` → no `storeCatalog.update` → no `auditLog.create`.

`prisma.$transaction(..., { isolationLevel: Serializable })` (line 105/170):
- Even if a runtime error fires inside the transaction (e.g., the test-only `failAfterVersionCreate` hook at line 136), Prisma rolls back; `catalog-publishing.service.ts:11-14` documents this hook as test-only and it is **not exposed via the controller** (`PublishingController.publishActiveCatalog` does not accept options).

## Watchpoint cleared

**🔴 publish с blocking error всё же создал CatalogVersion (атомарность сломана)** → CLEAN. Validation gate is structurally outside the transaction; no row created on rejected publish.

## Files

- `pre.json`, `post.json` — version-count snapshots
- `val-blocked.json` — validation result with blocker
- `publish-blocked-resp.json` — 400 response with embedded validation
- `val-after-fix.json` — post-fix clean state
- `atomicity-fixture-ids.txt` — P5/PL5 identifiers for cleanup tracking
