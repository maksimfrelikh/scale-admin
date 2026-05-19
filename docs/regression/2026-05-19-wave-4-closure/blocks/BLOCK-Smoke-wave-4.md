# BLOCK Smoke + Session-Rate: PASS

Wave 4 closure regression — smoke probe plus Wave-1 regression guard on
`/api/auth/session` polling rate.

**Re-dispatch run** after staging wrapper redeploy on 2026-05-19 ~22:50 GMT+2.
Previous run at `verify/wave-4-closure @ 96d7d63` SKIPPED this block per
FAIL-FAST policy after Block 2 tripped. With Block 2 now PASS, this block
runs to completion.

- Target: `https://staging.maksimfrelikh.ru`
- Branch: `verify/wave-4-closure` off `main@4497f57`
- Playwright: 1.60.0 (resolved from `/tmp/openclaw-pw/node_modules`)
- Total scenarios: 8 (7 smoke + 1 session-rate)
- Passed: 8
- Median elapsed: 16 ms (smoke calls; rate guard runs full 120 s window separately)

## Smoke scenario table

| # | Scenario | Expected | Actual | Status | Elapsed ms |
|---|---|---|---|---|---|
| S1 | POST /api/auth/login (admin) | 200, session cookie | 200, user `450d3b7a…` | PASS | 87 |
| S2 | GET /api/health | 200 | 200 | PASS | 14 |
| S3 | GET / (Vite SPA shell) | 200 + `<title>Scale Admin</title>` + `/assets/index-*.js` + `id="root"` | 200, shell OK | PASS | 33 |
| S4 | GET /api/stores | 200 + stores[] | 200, 1 store (`e4d711db…`) | PASS | 16 |
| S5 | GET /api/stores/:id (store detail) | 200 | 200 | PASS | 15 |
| S6 | GET /api/stores/:id/advertising/banners | 200 + banners[] | 200 | PASS | 9 |
| S7 | GET /api/auth/csrf | 200 + csrfToken | 200, fresh token | PASS | 7 |

## Session-rate guard

| Window | Hits to /api/auth/session | Rate / min | Threshold | Status |
|---|---|---|---|---|
| 120 s on dashboard, idle | 1 | 0.50 / min | < 2 / min | PASS |

Single hit is the initial session bootstrap on page load; no background
polling loop observed. Confirms the Wave-1 regression
(BUG-REG-014/017 cross-tab + polling fallback was reverted in `98c085d`
and never re-introduced) remains absent.

## Spec corrections noted during this run

- **Block 3 brief listed `GET /api/advertising/banners?storeId=…` as a
  smoke target. The actual route surface (per `advertising.controller.ts:31`)
  is nested: `GET /api/stores/:storeId/advertising/banners`. Test was
  adapted to use the canonical route. Logged as a side finding (brief
  doc drift, not a code regression).**

## Evidence

- `../evidence/block-3-smoke-report.json` — full per-scenario capture
- `../evidence/session-rate.json` — minute-by-minute hit timestamps
- `../evidence/block-3-dashboard.png` — dashboard screenshot post-load
