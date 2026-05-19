# Wave 3 Full Regression — INDEX

**Status:** COMPLETE
**Run ID:** `2026-05-19-full-regression-post-wave-2`
**Base commit:** `main` @ `bd3d5e2` (Wave 1 minus 014/017 revert; Wave 2 complete)
**Tester:** Wave 3 Full Regression subagent
**Tech harness:** Playwright headless Chromium against production-built frontend bundle (CORS-flipped local mode) + real backend + real PostgreSQL — no mocks
**Started → finished:** 2026-05-19 14:57Z → 2026-05-19 15:36Z (≈ 39 min wall clock)
**See:** [PLAN.md](PLAN.md) for scope.

## Overall verdict

**PASS-with-2-new-bugs (no blockers)** — Wave 1 + 2 fixes hold; the post-revert (`98c085d`) state is healthy (no `/api/auth/session` polling loop); 2 medium-severity validation gaps discovered as adjacent findings.

## Per-block results

| # | Block | Verdict | New BUGs | Note |
|---|---|---|---|---|
| 1 | Login/session/RBAC + Cross-tab MODE_A | ✅ PASS | 0 | MODE_A correctly EXPECTED-OFF post-revert; `/api/auth/session` poll rate = 0/min during 30 s window — Wave 1 loop signature NOT reproducing |
| 2 | Users & Access | ✅ PASS-with-1-bug | **BUG-REG-039** (medium) | Invite create + revoke OK; password-reset stateless OK (no enumeration); RBAC OK; adjacent finding on email RFC 5321 validation gaps |
| 3 | Stores CRUD + Details | ✅ PASS | 0 | All CRUD + RBAC + archive/restore + store details Catalog tab |
| 4 | Products master catalog | ✅ PASS | 0 | CRUD + search + status filter + duplicate-PLU + XSS in name correctly escaped by React |
| 5 | Categories | ✅ PASS | 0 | **BUG-REG-035 closure CONFIRMED** — archive root cascade flips root + 2 children + grandchild atomically |
| 6 | Catalog placements | ✅ PASS | 0 | **BUG-REG-026 closure CONFIRMED** — duplicate-active invariant (409 with helpful message) + cascade archive on category archive |
| 7 | Prices | ✅ PASS | 0 | **BUG-REG-027/029 closure CONFIRMED** — API rejects USD/EUR (400); UI uses disabled `<select>` with only `<option value="RUB">RUB</option>` |
| 8 | Advertising banners | ✅ PASS-with-1-bug | **BUG-REG-040** (medium) | Cascade archive works; adjacent finding on imageUrl validation accepting `javascript:` and garbage |
| 9 | File uploads | ✅ PASS | 0 | Magic-byte detection + extension match + 2 MB cap + traversal-defeated by UUID filename rewrite + RBAC + unauthenticated rejected |
| 10 | Publishing | ✅ PASS | 0 | **BUG-REG-029 defense-in-depth CONFIRMED** — only `"currency":"RUB"` in publish payloads; CatalogVersion immutability confirmed (no PATCH/PUT/DELETE endpoints) |
| 11 | Scale API | ✅ PASS | 0 | **BUG-REG-031 closure CONFIRMED** — unknown valid UUID → 201 + `hasUpdate:true` + latest version (NOT 500); token regen rotates cleanly (old → 401, new → 200) |
| 12 | Dashboards + Logs | ✅ PASS | 0 | Audit-log coverage good (auth, store, price, scale events); RBAC enforced; filter is `contains` substring match (WAI) |

## New BUG-REG opened

| ID | Severity | Title | Area |
|---|---|---|---|
| [BUG-REG-039](../2026-05-17/bugs/BUG-REG-039-invite-email-rfc5321-gaps.md) | medium | Invite email validation accepts several RFC 5321 violations (BUG-REG-020 fix incomplete) | auth/invites/validation |
| [BUG-REG-040](../2026-05-17/bugs/BUG-REG-040-banner-imageurl-permissive.md) | medium | Advertising banner `imageUrl` validation accepts arbitrary strings (incl. `javascript:` URI and garbage) | advertising/validation |

## Closure verdicts (Wave 1 + 2 fixes)

| Bug | Status | Evidence block |
|---|---|---|
| BUG-REG-014 (cross-tab logout broadcast) — REVERTED on main | ✅ NO REGRESSION (post-revert state healthy: no `/api/auth/session` polling loop) | Block 1 scenario 1.12 |
| BUG-REG-017 (cross-tab role switch) — REVERTED on main | ✅ NO REGRESSION (same evidence as 014; expected-off per moratorium) | Block 1 scenario 1.12 |
| BUG-REG-020 (RFC 5321 invite email validation) | ⚠️ PARTIAL — see BUG-REG-039 | Block 2 scenario 2.4 + probe |
| BUG-REG-025 (password-reset static notice) | ✅ CLOSED | Block 2 scenario 2.8 |
| BUG-REG-026 (placement single-active invariant + cascade) | ✅ CLOSED | Block 6 scenarios 6.3, 6.9 + probe |
| BUG-REG-027 (price RUB-only API) | ✅ CLOSED | Block 7 scenarios 7.3, 7.4 |
| BUG-REG-029 (price RUB-only UI + publish defense-in-depth) | ✅ CLOSED | Block 7 scenario 7.13 + Block 10 currency probe |
| BUG-REG-031 (scale check-update unknown UUID → stale not 500) | ✅ CLOSED | Block 11 scenario 11.5b (probe) |
| BUG-REG-034 (gitleaks pre-commit hook; token rotation hygiene Stream A) | ✅ HYGIENE CONFIRMED (clean rotation, old token → 401, new → 200) | Block 11 scenarios 11.11–11.13 |
| BUG-REG-035 (cascade archive parent → children) | ✅ CLOSED | Block 5 scenarios 5.9, 5.10 |
| BUG-REG-037 (cross-tab CSRF rotation moratorium) | ✅ EXPECTED-OFF (no fix attempted on main) | Block 1 scenario 1.12 |
| BUG-REG-038 (production Dockerfile no migration recovery) | ⏭️ NOT EXERCISED (not in scope — no deploy in this run) | n/a |

## Wave 4 priority recommendation

**No Wave 3 emergency follow-up needed.** Both new bugs are medium severity validation hygiene gaps with limited direct impact (no XSS execution, no data loss). Bundle for Wave 4:

- **Wave 4 priority queue:**
  - BUG-REG-039 — Invite email RFC 5321 validation (medium): tighten `email-validation.util.ts` dot-atom-text enforcement; pairs naturally with future invite-link UX work
  - BUG-REG-040 — Banner imageUrl validation (medium): add URL scheme guard (`http`/`https` only); aligns with future banner-upload-only UX

- **Wave 3+ backlog (cleanup):**
  - None additional — the regression run did not surface low-severity findings beyond what's already documented in BUG-REG-036/037/038 stubs

## Stack restore confirmation

- Local docker stack rebuilt + restarted with original `docker-compose.override.yml` content (`VITE_API_BASE_URL=""`, `FRONTEND_ORIGIN=https://maksimfrelikh.ru`).
- Verified `Access-Control-Allow-Origin: https://maksimfrelikh.ru` returned on OPTIONS preflight for production origin.
- Local `localhost:5173` origin no longer receives a matching Allow-Origin header — browser CORS will correctly reject local requests against this backend.
- `docker-compose.override.yml.bak-wave3` deleted (temp file).

## Caveats / partial-run notes

None. All 12 blocks completed in scope.

## Local DB state notes

- Garbage test invites: 6 rows in `user_invite` from BUG-REG-039 probe (`a@b@c.com`, `has space@…`, `.user@…`, `us..er@…`, `user.@…`, `a,b@…`) — left for triage on the fix branch.
- Several Wave3 test entities (stores, categories, products, placements, banners, scale devices, prices, catalog versions, audit/sync log rows, file assets) seeded in local DB — none collide with QA seed accounts; safe to leave or batch-cleanup before next regression. QA accounts (`qa-admin@gmail.com`, `qa-operator@gmail.com`) intact.

## Artifact size

- 12 block summary docs
- 12 main scripts + 11 probe scripts + 1 helper
- 32 evidence files (PNGs + report JSONs) totaling ~1.8 MB
- 2 new BUG-REG stubs in `docs/regression/2026-05-17/bugs/`
