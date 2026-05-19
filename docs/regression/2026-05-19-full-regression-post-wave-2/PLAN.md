# Wave 3 Full Regression — Test Plan

**Run ID:** `2026-05-19-full-regression-post-wave-2`
**Trigger:** Maksim — full regression of Wave 1+2 closures + sanity check `main` health after the 2026-05-19 production incident (cross-tab broadcast revert at `98c085d`) + verification that BUG-REG-038 manual-migration recovery path is operational.
**Base commit:** `main` @ `bd3d5e2` (Wave 3 backlog stubs opened) — superset of Wave 1 (6/8 on main; 014+017 reverted) + Wave 2 (007 docs-close, 015 verified, 034 closed, 035 fix, 036 stub, 037 stub, 038 stub).
**Mode:** BLOCK & GO — autonomous; one final HB summary.

## Tech harness (mandatory)

- **UI driver:** Playwright headless Chromium (≥1.50).
- **Bundle:** production-built — `cd backend && docker compose build frontend` with `VITE_API_BASE_URL=http://localhost:3000` for the run; then `vite preview` is *served by the frontend container itself* (it already serves on `:5173`). The `npm run build` + `vite preview` directive translates to a clean docker rebuild of the frontend service with local API URL; the container's existing serve command IS the preview.
- **Backend:** real NestJS in `scale-admin-backend`, real PostgreSQL in `scale-admin-postgres`. No mocks.
- **CORS stack-flip:** Per BUG-REG-015 protocol — temporarily set `FRONTEND_ORIGIN=http://localhost:5173` and rebuild frontend with `VITE_API_BASE_URL=http://localhost:3000`. **Restore `docker-compose.override.yml` to production-CORS state before final report.**
- **QA accounts (per Maksim's spec):**
  - `qa-admin@gmail.com / QaRegression123!` — role admin
  - `qa-operator@gmail.com / QaRegression123!` — role operator
  - Both already seeded in local DB (verified). Tester to confirm password match; if hash differs, rotate in local DB only and document.

## Blocks (12, per Maksim's taxonomy)

| # | Block | Scope |
|---|---|---|
| 1 | **Login / session / RBAC + Cross-tab MODE_A** | Login, session cookies, CSRF, RBAC (admin vs operator routes / store access), cross-tab MODE_A propagation (NOTE: BUG-REG-014/017 cross-tab fix is REVERTED on main; MODE_A is expected NOT to propagate logout/role-switch — verify there is no infinite `/api/auth/session` loop and no Login↔Checking flicker; document expected-no-propagation per moratorium [BUG-REG-014/017/037]) |
| 2 | **Users & Access** | Admin/operator listing, invite create/revoke/restore, password reset notice (MVP — full flow deferred to TASK-062), invite email validation (BUG-REG-020 closure) |
| 3 | **Stores CRUD + Store Details** | Stores list, create, edit, archive/restore, store detail Catalog tab, RBAC scoping |
| 4 | **Products master catalog** | CRUD, search, status filter, archive cascade |
| 5 | **Categories** | Tree, parent/child, sortOrder, archive cascade parent→children (BUG-REG-035 closure) |
| 6 | **Catalog placements** | Single active per (store,product), move flow, cascade archive on parent archive (BUG-REG-026 closure) |
| 7 | **Prices** | Inline editing, RUB-only currency (BUG-REG-027/029 closure), filters, no-price highlight |
| 8 | **Advertising banners** | Upload, sortOrder, archive cascade |
| 9 | **File uploads** | Validation, size limits, MIME enforcement, XSS protection |
| 10 | **Publishing** | Validation, packageData shape, RUB-only in publish output (BUG-REG-029 defence-in-depth), CatalogVersion immutability |
| 11 | **Scale API** | check-update with valid/unknown/malformed UUID (BUG-REG-031 closure), ack, sync log, token regeneration (BUG-REG-034 Stream A rotation hygiene check) |
| 12 | **Dashboards + Logs** | Admin/operator dashboard, global/store logs, audit completeness |

## Cross-tab convention (canonical, from BUG-REG-015)

- **MODE_A** (same browser context, two pages): primary verify mode. SLO 30 s per assertion. Watch `/api/auth/session` call rate — >2 calls/min sustained = Wave 1 infinite-loop pattern → flag CRITICAL FAIL.
  - For Block 1: post-revert (`98c085d`) MODE_A propagation is **EXPECTED-OFF**. Document timeout as expected per moratorium. Document healthy `/api/auth/session` rate (<1 call / 25 s).
- **MODE_B** (two independent browser contexts): timeouts **EXPECTED** per cross-tab moratorium (BroadcastChannel doesn't cross independent contexts). Document, do not fail.

## Adjacent findings (§3.4 workflow)

- Any new bugs discovered → stub at `docs/regression/2026-05-17/bugs/BUG-REG-039+.md`.
- Severity guess (low/med/high/critical) — Lead's sole judgment.
- Body: reproduction steps, expected, actual, impact, hypothesis paths.

## Output layout

```
docs/regression/2026-05-19-full-regression-post-wave-2/
├── PLAN.md                          (this file)
├── INDEX.md                         (overall verdict + per-block roll-up + new BUG list)
├── blocks/
│   ├── BLOCK-01-login-session-rbac-multitab.md
│   ├── BLOCK-02-users-access.md
│   ├── BLOCK-03-stores.md
│   ├── BLOCK-04-products.md
│   ├── BLOCK-05-categories.md
│   ├── BLOCK-06-placements.md
│   ├── BLOCK-07-prices.md
│   ├── BLOCK-08-banners.md
│   ├── BLOCK-09-uploads.md
│   ├── BLOCK-10-publishing.md
│   ├── BLOCK-11-scale-api.md
│   └── BLOCK-12-dashboards-logs.md
├── scripts/                         (Playwright .cjs + helper shells)
└── evidence/                        (screenshots, JSON reports, curl/network dumps)
```

## Critical blocker escape hatch

If Tester reports a fundamentally broken core (login fails for both accounts, frontend doesn't build, docker stack won't start, etc.):
- Document as critical FAIL in the affected block.
- Continue with remaining blocks if independently possible.
- Recommend abort/refocus in final HB.

## Adjacent contract (Wave 3 vs Wave 1+2 status)

- This run **does not** re-merge or re-deploy anything. Branch `2026-05-19-full-regression-post-wave-2` is artifact-only (write to `main` allowed per Lead workspace exception §1, as this is regression docs only — no code).
- Wave 4 priority is decided by the bug-severity mix at the end of this run, not pre-decided here.
