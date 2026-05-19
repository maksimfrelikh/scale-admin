# BLOCK 7 — Prices

**Verdict:** PASS — BUG-REG-027 + BUG-REG-029 closures CONFIRMED
**Time:** ~2 min
**Scripts:** `scripts/block-07-prices.cjs`, `scripts/probe-block-07-ui-fixed.cjs`
**Report JSON:** `evidence/block-07-report.json`

## Scenarios

| ID | Scenario | Expected | Actual | Verdict |
|---|---|---|---|---|
| 7.0 | Setup store + category + product + placement | all created | all created | ✅ |
| 7.1 | List prices — no price set | 200, row visible with null price | 200 + row present | ✅ |
| 7.2 | PUT price, RUB, 99.50 | 200 + currency RUB + price 99.5 | 200, currency=RUB, price="99.5" | ✅ |
| 7.3 | **PUT price USD — BUG-REG-027 closure** | 400 currency rejected | 400 "Currency not supported" | ✅ |
| 7.4 | PUT price EUR | 400 | 400 "Currency not supported" | ✅ |
| 7.5 | PUT price no currency → default RUB (`DEFAULT_CURRENCY` in `shared/currency.ts`) | 200 + RUB | 200, currency=RUB | ✅ |
| 7.6 | PUT negative price | 400 | 400 "Price must be greater than 0" | ✅ |
| 7.7 | PUT non-numeric "not-a-number" | 400 (graceful — no 500) | 400 "Price must be greater than 0" (coerced to NaN, treated as 0) | ✅ |
| 7.8 | PUT zero price | 400 (must be > 0) | 400 "Price must be greater than 0" | ✅ |
| 7.9 | List with `?missingPrice=true` | 200 + only no-price rows | 200, 0 (our product now has price) | ✅ |
| 7.10 | List with `?categoryId=<id>` | 200 + filtered | 200, 1 | ✅ |
| 7.11 | PUT /prices/:productId (path-form) | 200 + updated price | 200, price=77.77 | ✅ |
| 7.12 | Search by name | 200 + match | 200, 1 | ✅ |
| 7.13 | **UI: prices tab — RUB-only currency selector** (BUG-REG-029 closure) | currency `<select>` has only `<option value="RUB">RUB</option>` and is `disabled` | confirmed in DOM: `<select ... disabled=""><option value="RUB">RUB</option></select>` | ✅ |

## BUG-REG-027/029 closure verdict — CONFIRMED

API path:
- PUT `/stores/:storeId/prices` with `currency: 'USD'` → 400 `"Currency not supported"`
- Same for EUR, GBP, etc.
- Missing currency defaults to RUB (no leak path).

UI path:
- Prices tab inline editor uses a `<select disabled>` element with literally one option: `<option value="RUB">RUB</option>`.
- This means even a forged DOM mutation to send a different currency would still hit the API guard from BUG-REG-027 and be rejected.
- Defense-in-depth: UI restricts choice, API double-checks.

## Notes

- **Initial Block 7 test 7.13 was a false positive:** my Playwright script navigated to `/stores/:id/prices` (a non-existent path-style URL) which fell back to the root dashboard. Dashboard happens to list "Latest published versions" — including products named `QAB10USD004708 · QA Block 10 USD repro 004708` from prior regressions. The "USD" hit was a substring match in a *product name*, not currency UI. After switching to the correct hash-style route `#store:<uuid>` and clicking the Prices tab, the actual prices tab DOM is RUB-only-locked.
- FE uses **hash-based routing** (`window.location.hash`), not path-based. Documented for future regression runs.
- The product name dropdown in the prices tab also serves as collateral confirmation that React safely escapes XSS — leftover `<img src=x onerror=...>Wave3XSS-...` products from Block 4 are rendered as text, not HTML.
- The price input is `<input type="number" min="0.01" step="0.01">` — UI enforces positive prices and 2-decimal increments. Matches API rule.

## Stack state at end of block

Local docker, CORS=localhost; +1 test store with 1 priced product (77.77 RUB).

## New BUG-REG opened
None.
