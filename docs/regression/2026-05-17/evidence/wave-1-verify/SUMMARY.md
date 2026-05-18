# Wave 1 Verify Summary — BUG-REG-027 + BUG-REG-029

- Verifier: tester
- Date: 2026-05-18 (local Europe/Amsterdam)
- Stack: TEST (`localhost:3001/api`, `localhost:5174`, `scale-admin-test-postgres`)
- Worktree: `/home/clawd/projects/scale-admin-test`
- Branch: `test/bug-reg-029-merged` @ `87f324d45b1aaa4febc01813b9a742797dac05b8`
- Mode: independent verify after manager's §4.3 dry-run (per AGENTS §6.5)
- UI runner: Playwright 1.60.0 headless chromium, viewport 1366×900, clean context (incognito-equivalent)

## Verdict

🟢 **BUG-REG-027 — PASS** (A1–A6 all green)
🟢 **BUG-REG-029 — PASS** (B1–B3 all green)
🟢 **UI flow — PASS** (UI1–UI5 all green; bundle delivers single-RUB dropdown, intercept-to-USD surfaces inline error)
🟢 **Migration / DB state — PASS** (M1–M4 all green)

**Recommendation:** Merge `test/bug-reg-029-merged` into target branch.

Side findings: none.

---

## A. BUG-REG-027 — PUT prices currency whitelist

Target row: `store_product_prices.id = 9d90d3e4-57b5-4fd6-a22d-381e199edf73` (Apples Red Weighted in STORE-001).

| Step | Input | Status | code | received | persisted currency | ✅/❌ |
|------|-------|--------|------|----------|--------------------|------|
| A1 | `{price:10,currency:"USD"}` | 400 | PRICE_CURRENCY_NOT_SUPPORTED | USD | — | ✅ |
| A2 | `{price:10,currency:"ZZZ"}` | 400 | PRICE_CURRENCY_NOT_SUPPORTED | ZZZ | — | ✅ |
| A3 | `{price:10,currency:"AAA"}` | 400 | PRICE_CURRENCY_NOT_SUPPORTED | AAA | — | ✅ |
| A4 | `{price:10,currency:"RUB"}` | 200 | — | — | RUB | ✅ |
| A5 | `{price:10}` (no currency) | 200 | — | — | RUB (default) | ✅ |
| A6 | `{price:10,currency:"rub"}` | 200 | — | — | RUB (normalized) | ✅ |

All 400 envelopes include `allowedCurrencies:["RUB"]` and an echoed `received` field.

Raw: `A1-A6.txt`.

---

## B. BUG-REG-029 — publish gate + scale E2E

### B1 — Gate B (validation reject on storage-level USD)

Bypass: `ALTER TABLE store_product_prices DROP CONSTRAINT store_product_prices_currency_allowed; UPDATE … SET currency='USD' WHERE id='9d90d3e4-…';`

| Sub | Endpoint | Result | ✅/❌ |
|-----|----------|--------|------|
| B1.3 | `POST /publishing/catalog-validation {}` | 201, `canPublish:false`, `blockingErrors[0]={code:PRICE_CURRENCY_NOT_SUPPORTED, entityType:StoreProductPrice, entityId:9d90d3e4-…, metadata:{productId:f8e3732b-…, currency:"USD", allowedCurrencies:["RUB"]}}` | ✅ |
| B1.4 | `POST /publishing/catalog-publish {}` | 400 with `validation` envelope mirroring the blocking error | ✅ |
| B1.5 | RESTORE: `UPDATE … SET currency='RUB'; ALTER TABLE … ADD CONSTRAINT … CHECK (currency IN ('RUB'));` | applied; post-restore `UPDATE … SET currency='USD'` rejected by check constraint | ✅ |

Raw: `B1-validation.json`, `B1-publish.json` (response bodies). Constraint round-trip recorded in `M1-M4.txt` (M3) and re-block sanity in `B1-step5d-constraint-blocks.log` (under `2026-05-18-verify-027-029/evidence/`).

### B2 — clean publish after restore

`POST /publishing/catalog-publish {}` → **201**, version 3 (`9878e913-d1eb-4019-ae63-2b2a3964ec9d`), packageChecksum `86881ea0151d39362e7fd525fd75dbdaddcfb43c875c8e432a5ea56db333f09c`, `packageData.categories[].items[].currency` unique = `["RUB"]`, itemCount=2. ✅

### B3 — scale E2E (BLOCK-10 H.1)

- `POST /scales/336f3a50-…/regenerate-token` → 201, new apiToken (43 chars; redacted in evidence)
- `POST /scales/check-update` with `x-scale-device-code: QA-TEST-001` + fresh `x-scale-api-token` + body `{}` → **201**
  - `hasUpdate:true` ✅
  - `versionId` and `packageChecksum` **byte-identical** to B2 publish — cryptographic proof scale receives the same bytes ✅
  - `packageData.categories[].items[].currency` unique = `["RUB"]` ✅

Raw: `B3-check-update.json` (token redacted before persistence).

---

## UI — Chrome headless incognito (Playwright 1.60.0)

| Step | What | Observation | ✅/❌ |
|------|------|-------------|------|
| UI1 | Login admin@example.com / admin12345 | `POST /api/auth/login` 200, `nav.app-nav` appears | ✅ |
| UI2 | nav `Stores` → STORE-001 → `Details` | `section.prices-tab` rendered with active catalog prices | ✅ |
| UI3 | Inline edit "Apples Red Weighted" (PLU 1001) | `<select aria-label="Currency for Apples Red Weighted">` is `disabled`, `value="RUB"`, options = `["RUB"]` (1 option) | ✅ |
| UI4 | Type price `11`, click Save | Request `PUT …/prices/f8e3732b-…` body = `{"price":11,"currency":"RUB"}` → 200; persisted row `price=11 currency=RUB` | ✅ |
| UI5 | Re-edit price `12`, **route intercept rewrites body** `currency:"RUB"` → `"USD"` | Backend 400 `PRICE_CURRENCY_NOT_SUPPORTED` (allowedCurrencies:["RUB"], received:"USD"); inline `.inline-error[role=alert]` rendered with text `"Currency not supported"` | ✅ |

Raw: `UI3.png`, `UI3-select-attrs.txt`, `UI4-network.png`, `UI4-network.json`, `UI5-error.png`, `UI5-error.json`.

`UI-page-errors.log` contains only:
- one `401` on the pre-login CSRF probe (expected before login),
- one `400` from UI5's intentional intercept (expected; same 400 we asked the backend to surface).

No unexplained console/page errors.

---

## M. Migration & DB state

| Sub | Query | Result | ✅/❌ |
|-----|-------|--------|------|
| M1 | `SELECT id,currency,price FROM store_product_prices WHERE id='9d90d3e4-…'` | `currency=RUB price=11.00` (after UI4 save; was 10 before UI flow, will not regress: constraint+API+validation+package all enforce RUB) | ✅ |
| M2 | `SELECT action,beforeData,afterData,metadata FROM audit_logs WHERE action='price.currency_backfilled'` | 1 row: `beforeData.currency="USD" afterData.currency="RUB"`, `metadata.migration="bug-reg-029-currency-enum-backfill"`, `metadata.productId="f8e3732b-…"` | ✅ |
| M3 | `SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='store_product_prices_currency_allowed'` | `CHECK ((currency = 'RUB'::text))` | ✅ |
| M4 | `SELECT count(*) FROM "_prisma_migrations" WHERE migration_name='20260518182358_currency_enum_backfill' AND finished_at IS NOT NULL` | 1 row, `applied_steps_count=1`, `rolled_back_at=NULL`, `finished_at=2026-05-18 18:50:58.71029+00` | ✅ |

Raw: `M1-M4.txt`.

Note on M1 row value: row also carries `price=11.00` because UI4 saved that value during the UI flow. This is expected end-state of the verify session (UI4 was a positive write); the **currency** field is the verified invariant and is `RUB`.

---

## Evidence inventory

```
docs/regression/2026-05-17/evidence/wave-1-verify/
  SUMMARY.md                ← this file
  A1-A6.txt                 ← raw curl -i for all 6 BUG-REG-027 cases
  B1-validation.json        ← /catalog-validation response body (Gate B, USD in DB)
  B1-publish.json           ← /catalog-publish 400 envelope (Gate B reject)
  B3-check-update.json      ← /scales/check-update body (apiToken redacted)
  M1-M4.txt                 ← psql SELECTs for row/audit/constraint/migration
  UI3.png                   ← Apples row screenshot (select disabled, RUB)
  UI3-select-attrs.txt      ← programmatic select introspection
  UI4-network.png           ← Apples row after Save with RUB
  UI4-network.json          ← captured PUT request + response (currency=RUB → 200)
  UI5-error.png             ← Apples row with inline error after USD intercept
  UI5-error.json            ← intercept payload + 400 response + inline error text
  UI-page-errors.log        ← only expected pre-login 401 and UI5's intentional 400
```

Sanitisation: apiToken redacted in `B3-check-update.json`; CSRF/session cookies never persisted to repo (only in `/tmp/verify-admin-cookies.txt`). Secret scan over `wave-1-verify/` produced no unredacted matches.

Companion raw set (helpers, per-step logs, constraint round-trip) lives at `docs/regression/2026-05-18-verify-027-029/` and is referenced where useful above.

---

## Defence-in-depth confirmation

The fix delivers four independent gates against non-RUB currency reaching a scale:

1. **API gate** — `PUT /stores/{}/prices/{}` rejects non-RUB at controller (A1–A3, UI5).
2. **DB gate** — `store_product_prices_currency_allowed CHECK (currency = 'RUB')` rejects any write that bypasses controllers (M3, B1.5 re-block sanity).
3. **Validation gate** — `/catalog-validation` reports `PRICE_CURRENCY_NOT_SUPPORTED` blocking error when DB is corrupted via bypass (B1.3).
4. **Publish gate** — `/catalog-publish` refuses to materialise a `CatalogVersion` whose validation has blocking errors (B1.4); on clean state it emits package with `currency=RUB` only (B2), and the byte-equivalent payload flows to the scale (B3).
