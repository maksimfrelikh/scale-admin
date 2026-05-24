# BUG-REG-070 — Concurrent /catalog-publish returns 500 instead of 409

**Severity:** medium (API contract — atomicity intact, but error code obscures cause)
**Status:** open
**Discovered:** 2026-05-24, Wave 5 §5.7.C (REGRESSION-2026-05-24)
**Env:** staging (commit `0cf0966`)
**Reporter:** Lead (single-inline)

## Summary

When two operator sessions concurrently POST `/api/stores/:storeId/publishing/catalog-publish` for the same store, one transaction succeeds (HTTP 201) and the other returns HTTP 500 with generic `Internal server error`. Atomicity is preserved (only one CatalogVersion row is created and `currentVersionId` advances exactly once), but the loser's error code is wrong: should be **409 Conflict** with a structured code like `CATALOG_VERSION_RACE_CONFLICT` so the client can distinguish race-loss from a real server fault.

## Repro

Two fresh operator sessions (separate cookie jars). For each, fetch a CSRF token. Fire two POSTs in parallel:

```bash
(curl -sS -b $JAR_A -X POST -H "x-csrf-token: $CSRF_A" "$BASE/api/stores/$STORE/publishing/catalog-publish") &
(curl -sS -b $JAR_B -X POST -H "x-csrf-token: $CSRF_B" "$BASE/api/stores/$STORE/publishing/catalog-publish") &
wait
```

**Observed:**
- A → 500 `{"statusCode":500,"message":"Internal server error"}`
- B → 201 `{catalog:{...},version:{versionNumber:5,...}}`

`COUNT(CatalogVersion)` went up by exactly 1 (atomicity ✓).

## Root cause

`backend/prisma/schema.prisma:414` declares `@@unique([catalogId, versionNumber])` on `CatalogVersion`.

`catalog-publishing.service.ts:105-171` uses `Prisma.TransactionIsolationLevel.Serializable`:
```typescript
const latest = await tx.catalogVersion.aggregate({
  where: { catalogId: catalog.id },
  _max: { versionNumber: true },
});
const versionNumber = (latest._max.versionNumber ?? 0) + 1;
// ... compute checksum, then:
await tx.catalogVersion.create({ data: { ..., versionNumber, ... } });
```

When two transactions read the same `_max` concurrently, both compute `versionNumber=N+1`. One commits first; the second hits **Prisma P2002 unique-constraint violation** OR Postgres **serialization_failure (40001) → P2034**. Neither is caught in the service, so NestJS default exception filter maps to 500.

## Why medium

- **No data corruption** — DB constraint correctly prevents duplicate versionNumber.
- **No silent failure** — loser does see an error.
- **API contract broken** — clients cannot retry intelligently. A retry on 500 is risky (could be a hard server error); a retry on 409 is the canonical "publish-conflict, refetch state and try again" pattern.

## Suggested fix

Wrap `tx.catalogVersion.create` and catch Prisma error codes:

```typescript
import { Prisma } from '@prisma/client';

try {
  const createdVersion = await tx.catalogVersion.create({ data: {...} });
  // ...
} catch (err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002' || err.code === 'P2034') {
      throw new ConflictException({
        code: 'CATALOG_VERSION_RACE_CONFLICT',
        message: 'Кто-то уже опубликовал новую версию каталога. Обновите страницу и повторите.',
      });
    }
  }
  throw err;
}
```

Same handling should propagate out of `prisma.$transaction(...)` callback (Prisma wraps errors).

## Evidence

`docs/regression/2026-05-24/evidence/BLOCK-05/5.7-edge-rbac/race-A.json` (loser, 500)
`docs/regression/2026-05-24/evidence/BLOCK-05/5.7-edge-rbac/race-B.json` (winner, 201, vn=5)
`race-versions.json` (post-race list — only +1 row, atomicity ✓)

## Out of scope

- Pessimistic locking (`SELECT FOR UPDATE`) would serialize publishes by store and avoid the race entirely; tradeoff: longer hold time on busy stores. Not recommended as the primary fix — keep optimistic + retry contract.
