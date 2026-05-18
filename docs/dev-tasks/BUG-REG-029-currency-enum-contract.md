# BUG-REG-029 + BUG-REG-027 — currency enum contract

- Status: draft, awaits owner approval before dev assignment
- Owner: manager (frelikhmax)
- Branch: `fix/bug-reg-029-currency-enum` (to be created after approval)
- Closes: BUG-REG-029 (high), BUG-REG-027 (medium)
- Last updated: 2026-05-18

PRD reference: §6.8 line 510 — "`currency` можно хранить как поле, для MVP использовать `RUB`".
This contract makes that rule explicit (whitelist enum) and enforces it across input, publish, and storage layers.

---

## 1. Enum scope

MVP — **single-value whitelist** `["RUB"]`, not feature-flagged.

- Source of truth: new file `backend/src/shared/currency.ts`
  ```ts
  export const ALLOWED_CURRENCIES = ['RUB'] as const;
  export type AllowedCurrency = typeof ALLOWED_CURRENCIES[number];
  export const DEFAULT_CURRENCY: AllowedCurrency = 'RUB';
  ```
- Frontend mirror: `frontend/src/shared/currency.ts`
  ```ts
  export const ALLOWED_CURRENCIES = ['RUB'] as const;
  export type AllowedCurrency = typeof ALLOWED_CURRENCIES[number];
  ```
- Not extensible via env/config — adding a currency = code change + migration + audit + scale firmware review. Faster than reviewing config drift.
- When the list grows (post-MVP), the frontend dropdown automatically expands (it iterates `ALLOWED_CURRENCIES`).

Rejected alternative: feature-flag enum or DB-backed allowlist table. Too much machinery for a single-value MVP rule.

---

## 2. Validation endpoints (defence-in-depth)

Three gates, each independently sufficient:

### Gate A — input (`prices.service.ts:262 requireCurrency`)
- Replace regex check with `ALLOWED_CURRENCIES.includes(normalized)` whitelist.
- Affects: `PUT /api/stores/:storeId/prices` and `PUT /api/stores/:storeId/prices/:productId` (both controller handlers in `backend/src/prices/prices.controller.ts:40,59`).
- All `StoreProductPrice` writes go through this method; no other write paths exist (confirmed via grep — only `prices.service.ts` writes to `storeProductPrice`).

### Gate B — publish (`catalog-validation.service.ts:validatePlacements`)
- Currently the active-price query at `catalog-validation.service.ts:89-92` only selects `productId`. Extend to include `currency`.
- Add blocking validation rule: for every active price feeding an active placement, currency must be in `ALLOWED_CURRENCIES`; otherwise push `{ code: 'PRICE_CURRENCY_NOT_SUPPORTED', ... }` to `blockingErrors`.
- This blocks `POST /publishing/catalog-publish` (`publishing.controller.ts:50`) if any dirty data slipped past Gate A or was inserted directly to the DB.

### Gate C — snapshot build assert (`catalog-package.service.ts:222-223`)
- Add invariant check before constructing each `CatalogPackageItem`:
  ```ts
  if (!ALLOWED_CURRENCIES.includes(price.currency)) {
    throw new Error(`Internal: price ${price.productId} has unsupported currency ${price.currency} (expected RUB)`);
  }
  ```
- This is a code-level assert, not user-facing. Surfaces as 500 if Gates A+B both miss. Crashing publish is safer than emitting a corrupted immutable snapshot.

---

## 3. Invalid-currency error contract

### Input gate (Gate A) — 400 Bad Request

Match the existing pattern from `catalog-publishing.service.ts:94-97` (`BadRequestException` with structured body):

```json
HTTP/1.1 400 Bad Request
{
  "statusCode": 400,
  "message": "Currency not supported",
  "code": "PRICE_CURRENCY_NOT_SUPPORTED",
  "allowedCurrencies": ["RUB"],
  "received": "USD",
  "error": "Bad Request"
}
```

Code in `prices.service.ts:requireCurrency`:
```ts
const normalized = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
if (!ALLOWED_CURRENCIES.includes(normalized as AllowedCurrency)) {
  throw new BadRequestException({
    message: 'Currency not supported',
    code: 'PRICE_CURRENCY_NOT_SUPPORTED',
    allowedCurrencies: ALLOWED_CURRENCIES,
    received: normalized || null,
  });
}
return normalized;
```

NestJS wraps the object into the response above; `statusCode` and `error: 'Bad Request'` come from the framework.

### Publish gate (Gate B) — `CatalogValidationIssue`

Existing schema (`catalog-validation.service.ts:7-13`). New issue:
```json
{
  "code": "PRICE_CURRENCY_NOT_SUPPORTED",
  "message": "Active placement price uses an unsupported currency.",
  "entityType": "StoreProductPrice",
  "entityId": "<priceId>",
  "metadata": {
    "productId": "<productId>",
    "currency": "USD",
    "allowedCurrencies": ["RUB"]
  }
}
```

Surfaced via `POST /publishing/catalog-validation` (`200 OK, canPublish:false`) and via `POST /publishing/catalog-publish` (`400 Bad Request` with full validation object — same wrap as existing publish blocking errors).

---

## 4. Frontend dropdown

### Single touch point: `frontend/src/main.tsx:1992-2006` (PriceRow inline edit form)

No standalone "product price form" exists — `grep currency` in `frontend/src` returns only 3 hits: `pricesApi.ts` type + optional input field, `main.tsx:1967` fallback. The inline form in `PriceRow` is the only UI that writes price.

### UX

- Add a `<select>` next to the price `<input>`.
- Source options from `ALLOWED_CURRENCIES`. MVP has one option (`RUB`), rendered selected; `disabled` while length === 1, becomes enabled when array grows.
- Submit always sends `currency: 'RUB'` (explicit, not relying on the `?? 'RUB'` fallback at line 1967).
- Replace the fallback at line 1967 with `currency: ALLOWED_CURRENCIES[0]` (or read from form state) — never read `row.currentPrice?.currency` back into outgoing PUT body (that was the propagation bug from BUG-REG-027 impact analysis).
- Type tightening: `UpdateStoreProductPriceRequest.currency: AllowedCurrency` (no longer optional in client code; backend default-RUB stays for backward compat).

### Architecture for future extensibility

Dropdown iterates `ALLOWED_CURRENCIES`. Adding `'USD'` to the array immediately enables the option in UI — no other code changes. Selected currency persists per-row in component state, defaulting to existing `row.currentPrice?.currency` if it is in `ALLOWED_CURRENCIES`, else `DEFAULT_CURRENCY`.

---

## 5. Migration of existing data

### DB audit (production, run 2026-05-18 17:55 GMT+2)

```
store_product_prices:
  RUB | 23 rows
  USD |  1 row  (id=98177f5a, storeId=8995f4b9 [archived], productId=5593d554 [archived], price=99.99, status=active)

catalog_versions package_data items:
  RUB | 26 items
  USD |  2 items  (across 2 versions)
    - d2a9ae0c (v2, storeId 021acd90, NOT current; QA-PUB store is archived)
    - cdf74110 (v1, storeId 8995f4b9, IS current; QAB10USD store is archived)
```

### Strategy for `store_product_prices` — backfill RUB

One affected row. Owners (store + product) are both `archived`, so no live UI/API/scale path can read it. Backfill is risk-free.

**Artifact: single Prisma migration with raw SQL** at `backend/prisma/migrations/<timestamp>_currency_enum_backfill/migration.sql`. Decided over a separate data-migration script because Prisma migrations are already the project convention, the workflow is one-shot, and bundling the backfill INSERT/UPDATE with the CHECK constraint ALTER in a single migration file means one `prisma migrate deploy` step ships everything atomically. No startup hook (idempotency footgun) and no orphan script under `backend/scripts/`.

```sql
-- 1. Snapshot non-RUB rows into AuditLog before mutation
INSERT INTO audit_logs (id, action, "entityType", "entityId", "storeId", "beforeData", "afterData", metadata, "createdAt")
SELECT
  gen_random_uuid(),
  'price.currency_backfilled',
  'StoreProductPrice',
  id,
  "storeId",
  jsonb_build_object('currency', currency, 'price', price, 'status', status),
  jsonb_build_object('currency', 'RUB', 'price', price, 'status', status),
  jsonb_build_object('migration', 'bug-reg-029-currency-enum-backfill', 'productId', "productId"),
  NOW()
FROM store_product_prices
WHERE currency != 'RUB';

-- 2. Backfill
UPDATE store_product_prices SET currency = 'RUB', "updatedAt" = NOW() WHERE currency != 'RUB';
```

### CHECK constraint (Gate D — DB layer, defence-in-depth)

Add in the same migration, AFTER backfill. **Named constraint** for clean future drop/recreate when the enum grows:
```sql
ALTER TABLE store_product_prices
  ADD CONSTRAINT store_product_prices_currency_allowed
  CHECK (currency IN ('RUB'));
```

Named (not Postgres-auto) so a future migration can `ALTER TABLE store_product_prices DROP CONSTRAINT store_product_prices_currency_allowed` precisely without catalog lookups.

### packageData snapshot — see §6 (no migration)

---

## 6. packageData snapshot

### Decision: do not migrate; document and leave as-is

- Snapshots are immutable by design (BLOCK-09 E.1, `packageChecksum` stored). Mutating would invalidate the checksum and break the immutability invariant scale devices rely on.
- Both affected versions are in **archived** stores. Their `currentVersionId` is set for the archived QAB10USD store, but archived stores have no live scale devices polling — Maxim's BUG-REG-029 evidence confirms device blocked + token revoked during cleanup.
- Risk of new corruption is zero after Gates A/B/C/D ship (input rejected + publish blocked + assert + DB CHECK).
- We rely on store-archive lifecycle to eventually GC these versions (out of scope here).

### Reference for fields touched

- `CatalogVersion.packageData` is a JSON column (`schema.prisma:399`).
- Currency appears at `packageData.categories[*].items[*].currency` (set in `catalog-package.service.ts:223`); NOT at the catalog or store level.
- No top-level `packageData.currency` field exists — the user's example psql at `packageData->'catalog'->>'currency'` would return NULL for all rows. The audit query (run today) walks `categories→items` correctly.

---

## 7. AuditLog at validation failure

### Input gate A (400 from `requireCurrency`)
**Do not write AuditLog.** Matches existing convention: input-level 400s aren't audited (see e.g. `prices.service.ts:requirePrice` — also throws BadRequest, no audit entry). Rationale: AuditLog is reserved for successful state changes and material policy events; rejected attempts surface via HTTP access logs (Nest request log + nginx). With Gates B+C+D in place, post-fix non-RUB attempts are equivalent to typos or scripted noise — auditing them adds rows without forensic value. If a forensic requirement emerges later, request logs already capture user+path+body for replay.

### Publish gate B (blocking error)
**Do not write AuditLog.** Existing publish flow at `catalog-publishing.service.ts:92-98` throws BadRequest before reaching the AuditLog create at line 145 — i.e. publish-blocked attempts are not audited today. Stay consistent (don't introduce a new audit-on-reject pattern under this fix).

### Snapshot-build gate C (invariant violation → 500)
**Write AuditLog before throw.** Unlike A and B, Gate C firing means a real corruption-in-flight was caught only by the last belt — A+B+D all missed (or someone bypassed them with raw SQL plus disabled CHECK). That's a material security/integrity event; losing it to a stack trace in app logs is unacceptable.

Implementation:
- Inject `AuditLogService` into `CatalogPackageService` (DI change; update `publishing.module.ts`).
- Inside the per-item invariant check, `await this.auditLogs.create({ data: { ... } })` before `throw`.
- `action='catalog.publish_invariant_violation'`, `entityType='StoreProductPrice'`, `entityId=price.id`, `actorUserId=NULL` (system-level event — the violation is the system's; HTTP request log captures the calling actor by IP+session), `metadata={ invariant:'currency_whitelist', storeId, productId, receivedCurrency, allowedCurrencies }`.
- `buildPackageData` (currently sync) becomes async — propagate `await` up through `generateActiveCatalogPackage`. Runs outside the publish `$transaction` (publish calls `generateActiveCatalogPackage` BEFORE opening the tx at `catalog-publishing.service.ts:100`) so the audit row persists even if subsequent logic would have rolled back.

### Migration backfill
**Write AuditLog per affected row** (SQL in §5). `action='price.currency_backfilled'`, `actorUserId` NULL (verified nullable, `schema.prisma:211`). Provides retroactive trail for the one USD→RUB conversion.

### Successful price write (no change)
`prices.service.ts:186-203` already writes `price.created`/`price.updated` AuditLog including `beforeData`/`afterData` with currency field. No changes here — once Gate A allows only RUB, beforeData/afterData currency will always be RUB.

---

## 8. Acceptance mapping

### BUG-REG-027 (medium — API accepts non-RUB)

| Acceptance from bug | Closed by |
|---|---|
| `PUT prices` rejects USD/ZZZ/AAA with 400 | Gate A (§2, §3) |
| Frontend doesn't propagate persisted non-RUB on follow-up edits | Frontend dropdown sends explicit RUB (§4); migration removes the existing dirty row (§5) |
| `RUB` (or empty → default) still accepted | Gate A whitelist; `currency ?? 'RUB'` default preserved in `prices.service.ts:160` |

### BUG-REG-029 (high — non-RUB reaches scales via packageData)

| Acceptance from bug | Closed by |
|---|---|
| `packageData.items[*].currency` is RUB after fix | Gate B blocks publish if any active price has non-RUB; Gate A prevents new non-RUB writes; Gate C asserts at build time |
| `POST /catalog-publish` rejects when active price has non-RUB | Gate B (§2): blockingError `PRICE_CURRENCY_NOT_SUPPORTED` → 400 with validation envelope |
| E2E `/api/scales/check-update` delivers only RUB items | Follows from Gate A+B+C+D: no path can produce non-RUB in `packageData` |
| Existing corrupted snapshots (immutable) | Documented; out of scope per §6 (archived stores, no live consumers) |

### Test plan (for tester verify §4.4)

E2E acceptance from BUG-REG-029 §"Final E2E confirmation":
1. Create QA store + category + product + active placement (helpers in `docs/regression/2026-05-17/scripts/block-08-helpers.sh`, `block-09-helpers.sh`).
2. `PUT /prices` with `{price:10,currency:"USD"}` → **expect 400** with `code:'PRICE_CURRENCY_NOT_SUPPORTED'`.
3. `PUT /prices` with `{price:10}` (no currency) → **expect 200**, persisted as RUB.
4. `PUT /prices` with `{price:10,currency:"RUB"}` → **expect 200**.
5. Insert a non-RUB row directly via raw SQL (bypass API) → `POST /publishing/catalog-validation` → **expect canPublish:false** with `PRICE_CURRENCY_NOT_SUPPORTED` blocking error → `POST /catalog-publish` → **expect 400**.
6. Register scale device → `POST /scales/check-update` → confirm all items have `currency: "RUB"`.
7. UI: open Prices tab → inline edit price → confirm dropdown shows RUB (only option) → submit → confirm PUT body has `currency:"RUB"`.
8. UI: attempt to send non-RUB via DevTools (intercept fetch, swap body) → confirm 400 surfaced as inline error.

---

## 9. Dev assignment (post-approval)

### Backend (one dev)
- Create `backend/src/shared/currency.ts` (constants + types).
- Update `backend/src/prices/prices.service.ts:262 requireCurrency` (Gate A + new error shape).
- Update `backend/src/publishing/catalog-validation.service.ts:89-92, validatePlacements` (Gate B: extend price select, add blocking rule).
- Update `backend/src/publishing/catalog-package.service.ts:222-223` (Gate C: invariant assert + AuditLog write before throw — see §7). Inject `AuditLogService`, make `buildPackageData` async, propagate `await` through `generateActiveCatalogPackage`.
- Update `backend/src/publishing/publishing.module.ts` to provide `AuditLogService` to `CatalogPackageService` (LogsModule already imported by publishing flow via `CatalogPublishingService`; verify import chain).
- Add single Prisma migration at `backend/prisma/migrations/<timestamp>_currency_enum_backfill/migration.sql`: backfill UPDATE + per-row AuditLog INSERT + named CHECK constraint (Gate D) — all in one file (§5).
- Unit tests: `requireCurrency` whitelist; `validatePlacements` non-RUB price → blocking error.
- E2E test (Jest + supertest, if test infra supports it): full PUT prices USD flow returns 400 with new shape.

### Frontend (one dev)
- Create `frontend/src/shared/currency.ts` (constants).
- Update `frontend/src/features/prices/pricesApi.ts:72` (`UpdateStoreProductPriceRequest.currency: AllowedCurrency`).
- Update `frontend/src/main.tsx:1992-2006 PriceRow form` (dropdown next to price input; replace `currency: row.currentPrice?.currency ?? 'RUB'` with explicit dropdown value).
- Surface 400 errors with `code:'PRICE_CURRENCY_NOT_SUPPORTED'` in `rowError` text (existing error path at main.tsx:1972-1977 already handles error messages — verify message extraction handles the new shape).

### Coordination
- Shared constants split into two files (FE/BE) on purpose — no cross-stack import. FE+BE devs must keep arrays in sync; covered by visual review at PR.
- No risk of dev parallelism collision (different file trees).

---

## 10. Risks / open questions

- ~~Confirm `audit_logs.actorUserId` is nullable~~ — verified `actorUserId String?` in `schema.prisma:211`, both Gate C audit and migration backfill audit use NULL actor.
- ~~Prisma migration runner~~ — migration ships in branch; Maxim applies `prisma migrate deploy` manually post-merge (not in branch automation, not in dev sub-agent scope).
- ~~Backfill artifact location~~ — resolved §5: single Prisma migration with raw SQL.
- ~~Gate A AuditLog~~ — resolved §7: no.
- ~~CHECK constraint naming~~ — resolved §5: named `store_product_prices_currency_allowed`.
- ~~Gate C AuditLog before throw~~ — resolved §7: yes, with DI change to `CatalogPackageService`.
- **Out of scope**: scale firmware behavior on non-RUB. Once Gates A+B+C+D ship, scale will never receive non-RUB so this is moot for MVP.
- **Out of scope**: BUG-REG-023 (no upper price limit). Tracked separately.
