# Verify Summary — BUG-REG-027 + BUG-REG-029

- Verifier: tester
- Date: 2026-05-18
- Stack: TEST (localhost:3001 API / localhost:5174 FE / scale-admin-test-postgres)
- Worktree: /home/clawd/projects/scale-admin-test
- Branch: test/bug-reg-029-merged @ 87f324d45b1aaa4febc01813b9a742797dac05b8
- Mode: independent verify of acceptance steps from manager (manager already prereq-checked §4.3 repro)

## Verdict

✅ **BUG-REG-027 — PASS (all 6 acceptance steps)**
✅ **BUG-REG-029 — PASS (all 3 acceptance steps)**
✅ **UI smoke — PASS (dev bundle serves single-RUB dropdown; old fallback removed)**

Recommend merging fix branch.

## Side findings

None within verify scope.

---

## BUG-REG-027 acceptance (PUT /stores/{}/prices/{}, row id 9d90d3e4-...)

| Step | Input | Status | code | received | resulting currency | Verdict |
|------|-------|--------|------|----------|--------------------|---------|
| A1 | `{"price":10,"currency":"USD"}` | 400 | PRICE_CURRENCY_NOT_SUPPORTED | USD | — | ✅ |
| A2 | `{"price":10,"currency":"ZZZ"}` | 400 | PRICE_CURRENCY_NOT_SUPPORTED | ZZZ | — | ✅ |
| A3 | `{"price":10,"currency":"AAA"}` | 400 | PRICE_CURRENCY_NOT_SUPPORTED | AAA | — | ✅ |
| A4 | `{"price":10,"currency":"RUB"}` | 200 | — | — | RUB | ✅ |
| A5 | `{"price":10}` (no currency) | 200 | — | — | RUB (default) | ✅ |
| A6 | `{"price":10,"currency":"rub"}` | 200 | — | — | RUB (normalized) | ✅ |

All 400 responses include `allowedCurrencies:["RUB"]` envelope.

Raw evidence: `evidence/A1-USD.raw` … `evidence/A6-lowercase-rub.raw`.

---

## BUG-REG-029 acceptance

### B1 — Gate B (publish-time validation) bypass repro

Bypass enabled by dropping CHECK constraint `store_product_prices_currency_allowed` and forcing row `9d90d3e4-...` to currency=USD (storage-level corruption that BUG-REG-027 used to allow at API level).

- **B1.3 catalog-validation** → 201, `canPublish:false`
  - `blockingErrors[0].code = PRICE_CURRENCY_NOT_SUPPORTED` ✅
  - `blockingErrors[0].entityType = StoreProductPrice` ✅
  - `blockingErrors[0].entityId = 9d90d3e4-57b5-4fd6-a22d-381e199edf73` ✅
  - `metadata.productId = f8e3732b-...` ✅
  - `metadata.currency = "USD"` ✅
  - `metadata.allowedCurrencies = ["RUB"]` ✅
- **B1.4 catalog-publish** → 400 Bad Request with full validation envelope (same blocking error) ✅

- **B1.5 RESTORE**:
  - UPDATE → currency=RUB ✅
  - ADD CONSTRAINT `CHECK ((currency = 'RUB'::text))` ✅
  - Post-restore sanity: repeat `UPDATE … SET currency='USD'` now blocked with `violates check constraint "store_product_prices_currency_allowed"` ✅ (no residual hole)

Raw evidence: `evidence/B1-step1-drop.log`, `B1-step2-update.log`, `B1-step3-validation.raw`, `B1-step4-publish.raw`, `B1-step5*` logs.

### B2 — clean publish after restore

- POST `/stores/cce1036c.../publishing/catalog-publish` `{}` → **201** ✅
- versionNumber = **3** (previous v2 was the pre-fix baseline)
- versionId = `9878e913-d1eb-4019-ae63-2b2a3964ec9d`
- packageChecksum = `86881ea0151d39362e7fd525fd75dbdaddcfb43c875c8e432a5ea56db333f09c`
- `packageData.categories[].items[].currency` unique values = **["RUB"]** ✅
- itemCount = 2 (Apples + Bananas)

Raw evidence: `evidence/B2-publish.raw`, summary `evidence/B2-summary.json`.

### B3 — BLOCK-10 H.1 E2E (scale device receives clean snapshot)

- **B3a** POST `/scales/336f3a50-.../regenerate-token` (admin) → **201**, new apiToken issued (43 chars, redacted in `evidence/B3a-regenerate.raw`)
- **B3b** POST `/scales/check-update` with `x-scale-device-code: QA-TEST-001` + `x-scale-api-token: <new>` + body `{}` → **201**
  - hasUpdate = **true** ✅
  - versionId = `9878e913-d1eb-4019-ae63-2b2a3964ec9d` (= B2.versionId) ✅
  - versionNumber = 3 (= B2)
  - packageChecksum = `86881ea0151d39362e7fd525fd75dbdaddcfb43c875c8e432a5ea56db333f09c` ✅
  - **packageChecksum at scale === packageChecksum at publish** — cryptographic proof that bytes are identical
  - `packageData.categories[].items[].currency` unique = **["RUB"]** ✅
  - itemCount = 2

Raw evidence: `evidence/B3a-regenerate.raw` (apiToken redacted), `evidence/B3b-check-update.raw` (Authorization redacted), `evidence/B3b-summary.json`.

---

## UI smoke (`http://localhost:5174`)

Frontend served as production build `/assets/index-Dw0MAKZQ.js`.

- `frontend/src/shared/currency.ts` introduces `ALLOWED_CURRENCIES = ['RUB'] as const` + `AllowedCurrency` type ✅
- `pricesApi.ts:73` tightens `UpdateStoreProductPriceRequest.currency` from optional `string` to `AllowedCurrency` ✅
- `main.tsx:1933-1938` selects initial currency from saved value iff whitelisted, else `ALLOWED_CURRENCIES[0]` (never leaks USD/ZZZ back into PUT) ✅
- `main.tsx:1947` `currencyLocked = ALLOWED_CURRENCIES.length === 1` → `<select disabled>` while only RUB exists ✅
- `main.tsx:1974` PUT body now sends dropdown state directly; old `row.currentPrice?.currency ?? 'RUB'` fallback removed ✅
- Built bundle `/assets/index-Dw0MAKZQ.js`:
  - contains aria-label `Currency for ${l.product.name}` (1 match) ✅
  - contains `disabled:z` (minified `currencyLocked`) ✅
  - **zero occurrences** of `row.currentPrice?.currency ?? 'RUB'` ✅

Conclusion: bundle in browser will only ever submit RUB on inline price edits.

Raw evidence: `evidence/UI-bundle-greps.txt`, code references above.

---

## Evidence inventory

```
evidence/
  A1-USD.raw                     # PUT USD → 400 + PRICE_CURRENCY_NOT_SUPPORTED
  A2-ZZZ.raw                     # PUT ZZZ → 400
  A3-AAA.raw                     # PUT AAA → 400
  A4-RUB.raw                     # PUT RUB → 200 currency=RUB
  A5-no-currency.raw             # PUT {price:10} → 200 currency=RUB
  A6-lowercase-rub.raw           # PUT rub → 200 currency=RUB
  B1-pre-state.log               # row state before bypass (currency=RUB)
  B1-constraint-before.log       # constraint name present
  B1-step1-drop.log              # ALTER TABLE DROP CONSTRAINT
  B1-step2-update.log            # UPDATE → currency=USD
  B1-step3-validation.raw        # /catalog-validation → 201 canPublish=false
  B1-step4-publish.raw           # /catalog-publish → 400 envelope
  B1-step5a-restore-rub.log      # UPDATE → currency=RUB (restore)
  B1-step5b-add-constraint.log   # ALTER TABLE ADD CONSTRAINT
  B1-step5c-verify.log           # final row + constraint definition
  B1-step5d-constraint-blocks.log # confirms USD UPDATE now rejected
  B2-publish.raw                 # /catalog-publish → 201 v3
  B2-summary.json                # versionId/checksum/currencies/itemCount
  B3a-regenerate.raw             # regenerate-token 201 (apiToken redacted)
  B3b-check-update.raw           # /scales/check-update 201 (token redacted)
  B3b-summary.json               # hasUpdate/versionId/checksum/currencies
  UI-bundle-greps.txt            # bundle introspection
scripts/
  verify-helpers.sh              # CSRF/login/admin_req helpers for test stack
```

All evidence sanitised — no apiToken/session/CSRF values in committed files.
