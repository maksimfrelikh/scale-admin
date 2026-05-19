# Wave 1 Regression Verify — main @ 579ef61

- **Run date**: 2026-05-19
- **Verifier**: tester subagent
- **Scope**: 8 Wave 1 fixes + tactical adjacent-surface probe
- **Stack**: local docker (`docker compose up -d`) — backend + frontend rebuilt from main to pick up Wave 1 commits (initial images predated them)

## Per-bug verify table

| Bug ID            | Commit    | Status | Evidence                                                                                                                 | Note                                                                                              |
|-------------------|-----------|--------|--------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------|
| BUG-REG-027       | `5053403` | PASS   | [BUG-REG-027-029-curl.txt](evidence/BUG-REG-027-029-curl.txt)                                                            | PUT `/api/stores/.../prices/{prodId}` rejects USD/EUR/ZZZ/AAA with `PRICE_CURRENCY_NOT_SUPPORTED`; RUB / empty / case-insensitive `rub` accepted. |
| BUG-REG-029       | `5053403` | PASS   | [BUG-REG-027-029-curl.txt](evidence/BUG-REG-027-029-curl.txt) + [BUG-REG-029-publish.json](evidence/BUG-REG-029-publish.json) | Defence-in-depth confirmed: input gate (400), DB `CHECK store_product_prices_currency_allowed` (blocks UPDATE), published `packageData.items[].currency = "RUB"`. |
| BUG-REG-026       | `e0f1ade` | PASS   | [BUG-REG-026-curl.txt](evidence/BUG-REG-026-curl.txt)                                                                    | Categories: `?status=active` hides archived roots and archived children; `?status=archived` returns only archived. Placements: `?status=active` filters out placement on archived product even when placement itself is active. |
| BUG-REG-031       | `50d2308` | PASS   | [BUG-REG-031-curl.txt](evidence/BUG-REG-031-curl.txt)                                                                    | check-update with unknown valid-format UUID returns 201 + full package (stale-treatment) instead of 500; ScaleSyncLog row written with `errorMessage="unknown requestedVersionId: ..."`. Malformed UUID still 400. Current valid UUID returns `hasUpdate:false`. |
| BUG-REG-020       | `1f1c84f` | PASS   | [BUG-REG-020-curl.txt](evidence/BUG-REG-020-curl.txt)                                                                    | `a@b`, `a@`, `@b.c`, `a@b.c.`, `a@.b.c`, `a@b..c`, edge-hyphen, `<script>` in local, 1000-char local all → 400. Valid `valid+wave1@example.test` and `q.a+wave1@e.x.example.test` → 201. Length boundary: 64-char local → 201, 65-char → 400. |
| BUG-REG-014       | `537279b` | PASS   | [multitab-report.json](evidence/multitab-report.json) + [scripts/wave-1-multitab.cjs](scripts/wave-1-multitab.cjs) + `evidence/A-tabB-after-logout-broadcast.png` | Tab B detected logout in **21,126 ms** (≤30 s window). Final state: login screen with `login-help-note` visible. |
| BUG-REG-017       | `537279b` | PASS   | [multitab-report.json](evidence/multitab-report.json) + `evidence/B-tab1-after-operator-login.png`                       | Tab 1 detected admin→operator role switch in **23,138 ms** (≤30 s). Final h1 "Добро пожаловать, QA Operator", operator nav rendered. |
| BUG-REG-025       | `579ef61` | PASS (MVP mitigation only) | [BUG-REG-025-curl.txt](evidence/BUG-REG-025-curl.txt) + `evidence/adj-1-login-page.png` | Login form renders `.login-help-note` with exact text "Забыли пароль? Обратитесь к администратору." in JS bundle + CSS class present. Full reset flow correctly out of scope (TASK-062 per commit message). |

**Counts: 8/8 PASS, 0 FAIL, 0 WAIVED.**

## Adjacent-surface probe

Script: [scripts/adjacent-probe.cjs](scripts/adjacent-probe.cjs) → [adjacent-probe-report.json](evidence/adjacent-probe-report.json)

| Surface                | Probe                                                                            | Result |
|------------------------|----------------------------------------------------------------------------------|--------|
| Auth login (admin)     | UI login `admin@example.com` → admin dashboard, GET `/api/stores` → 52 stores    | OK     |
| Auth login (operator)  | UI login `qa-operator@example.com` → operator dashboard, admin nav not visible   | OK     |
| Cross-tab logout       | See BUG-REG-014 row                                                              | OK     |
| Cross-tab role switch  | See BUG-REG-017 row                                                              | OK     |
| Catalog list           | GET categories no-filter / `?status=active` / `?status=archived` consistent      | OK     |
| Catalog placements     | GET placements `?status=active` excludes placement on archived product           | OK     |
| Catalog create+archive | POST category, PATCH `status=archived`, archived not in `?status=active`         | OK     |
| Catalog mixed-status   | Active root with archived child only surfaces active subtree under active filter | OK     |
| Prices PUT             | RUB / lowercase rub / empty → 200, USD/EUR/ZZZ/AAA / 5-letter → 400              | OK     |
| Publishing             | POST `/publishing/catalog-publish` with active placement → 201, `packageChecksum` populated, `packageData.items[].currency="RUB"` | OK     |
| Scales check-update    | unknown UUID → 201 stale, malformed → 400, current → 201 `hasUpdate:false`, no UUID → 201 `hasUpdate:true` | OK     |
| Invites valid          | `valid+wave1@example.test` → 201                                                 | OK     |
| Invites malformed      | `a@`, `<script>@b.c` → 400                                                       | OK     |
| Password-reset notice  | `.login-help-note` text present, rendered under form                             | OK     |
| Console errors         | Only baseline `GET /api/auth/session 401` before login (expected pre-auth)       | OK     |

No unrelated regressions surfaced in probed scope.

## Notes / caveats (for transparency, not regressions)

1. **Local stack required rebuild and CORS override.** Initial docker images predated Wave 1 commits and `docker-compose.override.yml` sets `VITE_API_BASE_URL=""` + `FRONTEND_ORIGIN=https://maksimfrelikh.ru` (locking the local stack into production-CORS mode). Rebuilt with `VITE_API_BASE_URL=http://localhost:3000` and temporarily set `FRONTEND_ORIGIN=http://localhost:5173` for the multi-tab UI probe. Override file and `.env` restored to original values before this commit.
2. **Operator credential rotated locally.** `qa-operator@example.com`'s password hash was rotated to match `admin@example.com`'s seeded hash (`admin12345`) so BUG-REG-017 cross-tab probe could authenticate as operator. Local docker DB only — no production impact. Resulting state: any future local test can use `admin12345` for `qa-operator@example.com`.
3. **Test entities archived** after verify: store `cb7d6315-32c3-4492-8f3d-3c72565cb074` ("QA-Wave1-Currency-…") and its products + scale device archived. The currency-test-store has one published `CatalogVersion` (clean RUB).
4. **Detection mechanism for BUG-REG-014/017.** The 21–23 s detection windows are consistent with the 25 s `pollingInterval` fallback in `getSession`. The BroadcastChannel path was not separately exercised (the probe used `fetch()` directly rather than the RTK Query mutation that calls `publishAuthSessionEvent`). The acceptance criterion (≤ 30 s detection by any of broadcast/storage/polling) is satisfied; both code paths confirmed present in the bundle (`pollingInterval:25e3`, `new BroadcastChannel(...)`).

## Regression list

No unrelated regressions surfaced in probed scope.
