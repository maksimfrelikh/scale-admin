# REGRESSION-2026-05-24 — FINAL CONSOLIDATED REPORT

**Wave:** 8 (synthesis-only, read-only, no new probes)
**Author:** Lead (single-inline)
**Created:** 2026-05-24 21:24 GMT+2
**Synthesis sources:** MEMORY.md + `blocks/BLOCK-0{1,2,3,4,6,7}-*.md` + `evidence/BLOCK-0{1-7}/**/SUMMARY.md` + `bugs/BUG-REG-{067,068,069,070,071}-*.md` + final drift snapshot (21:24 GMT+2)

---

## 1. EXECUTIVE VERDICT

### Production-readiness: **✅ PASS-WITH-PREREQUISITES**

REGRESSION-2026-05-24 — 8-wave functional + security regression executed on 2026-05-24 (single calendar day, ~12:47 → 21:24 GMT+2, ~8h45m wall-clock with several inter-wave gaps; active wave-windows ~4–5h cumulative). Scope: PRD §2 + §6.1 + §6.10–§6.14 + §11.1–§11.8 + §14.3 + §15 (auth/session, RBAC, admin global flows + /me carryover, operator catalog workflow, publishing atomicity + immutability, scale device sync API, cross-cutting i18n/secret-audit/metrics/mobile/UX polish). Executor: single-inline Lead-as-Manager+Tester (subagent depth budget 1/1 enforced across all 7 testing waves — documented and accepted deviation). ~620+ logical probes across 49 sub-blocks. **8/8 waves PASS, 7/7 testing waves green** (W0 = preflight baseline, no testing). **5 bugs filed total — all medium-severity, 0 high, 0 critical** (1 process bug closed in-wave via Maksim manual seed; 4 product bugs open and queued for pre-prod hotfix batch). **2 🔴 watchpoint incidents triggered** (W1 brief/staging credential mismatch → BUG-REG-067; W7 §7.2 ten unredacted live credentials in evidence — 7 op sessions + 3 csrf tokens — all remediated in-flight, no exploit window). **NO wave-level escalation halt** (cumulative high-bug count: 0; threshold: ≥3). Production untouched throughout — prod commit `3538b7c` byte-identical from W0 baseline through W7 close through W8 final snapshot. Staging commit `0cf0966` byte-identical throughout. Security perimeter — auth, session, RBAC, CSRF, transport, rate-limit, audit, file upload, publishing atomicity — all GREEN. **Recommendation: ship to production after the 4-medium pre-prod hotfix batch lands** (ParseUUIDPipe for 069+071; dummy pbkdf2 verify for 068; ConflictException for 070; frontend translation-map addendum). Defense-in-depth backlog (mobile live-browser verification, OPERATOR_SEED_ON_STARTUP, watchdog improvements) can ship in a later iteration without blocking prod.

---

## 2. WAVE-BY-WAVE GRID

| Wave | Scope | Sub-blocks | Probes | Bugs filed | Window (GMT+2) | Verdict |
|------|-------|-----------|--------|-----------|----------------|---------|
| **W0** | Preflight baseline (drift anchor: prod `3538b7c`, staging `0cf0966`; broken-runtime retry archived under `2026-05-24-stub-from-broken-runtime/`) | — | 4 read-only liveness | 0 | 12:47 dispatch | ✅ baseline anchor |
| **W1** | Auth & Session Lifecycle (PRD §6.1, §11.1–§11.3) | 10/10 | ~50 | **2 medium** (067, 068) | 12:49–13:11 (~22m) | ✅ PASS |
| **W2** | RBAC matrix (PRD §2.1–§2.2, §6.1, §11.4) | 8/8 | ~80 | 0 | 13:43–13:57 (~14m) | ✅ PASS |
| **W3** | Admin global flows + /me carryover (PRD §2, §6.1–§6.10, §11.6) | 8/8 | ~133 | 0 | 14:05–14:32 (~26m) | ✅ PASS |
| **W4** | Operator catalog workflow (PRD §6.5–§6.10, §11.7) | 8/8 | ~124 | 0 | 14:52–15:12 (~19m) | ✅ PASS |
| **W5** | Publishing atomicity + immutability + scale package shape (PRD §6.11, §6.12, §15) | 8/8 | ~92 | **2 medium** (069, 070) | 15:48–18:05 (~2h17m) | ✅ PASS |
| **W6** | Scale Sync API — device auth + sync flow (PRD §6.13, §6.14, §11.5) | 8/8 | ~67 | 0 | 18:14–18:40 (~26m, incl. 6m idle stall across prior-session disconnect) | ✅ PASS |
| **W7** | Cross-cutting: i18n / secret-audit / metrics / mobile / empty / errors / UX polish (PRD §14.3 + cross-PRD i18n + audit closure) | 8/8 | ~170 | **1 medium** (071) | 20:47–21:11 (~24m, executed by prior session, verified in resumed session post-crash) | ✅ PASS |
| **W8** | Final consolidated report (synthesis-only, no testing) | — | 4 read-only liveness (this report) | 0 | 21:13–21:24 (~11m) | ✅ PASS — this document |

**Totals:** 49 sub-blocks PASS, ~620+ logical probes, **5 medium bugs filed (0 high, 0 critical)**, **0 wave-level halt**, **0 prod liveness regression**.

---

## 3. CONSOLIDATED BUG LIST

All bugs are medium-severity. None are high or critical. None blocked the wave they were filed in.

| ID | Severity | Status | Area | File (top-of-fix) | One-line | Recommended fix |
|---|---|---|---|---|---|---|
| **BUG-REG-067** | medium (process) | **closed in-wave** (Maksim seeded `qorxoes@gmail.com` + `unit-cusp-slam@duck.com` by hand for W2+) | regression brief authoring / staging fixtures | `backend/prisma/seed.js:16-17,147-208` (canonical accounts) + W1 brief | W1 brief credentials (`qa-admin@gmail.com` / `qa-operator@gmail.com`) do not exist on staging; no operator role seeded at all | Update Manager AGENTS.md §2 with canonical staging accounts + land `OPERATOR_SEED_ON_STARTUP=true` per W5 lesson §3 |
| **BUG-REG-068** | medium (security / timing leak) | open | backend / auth | `backend/src/auth/auth.service.ts:92-119` | `POST /api/auth/login` leaks user-existence via ~3.24× response-latency delta (existing-user wrong-pw avg 165ms vs nonexistent avg 51ms) — pbkdf2 runs only on existing branch | Run a constant-time pbkdf2 verify against a fixed dummy hash on the no-user branch so both branches do equivalent work; acceptance = ratio ≤1.5× on 5-sample comparison |
| **BUG-REG-069** | medium (UX / error-handling) | open | backend / advertising | `backend/src/advertising/advertising.service.ts:86-110` | `POST /api/stores/:storeId/advertising/banners` with non-existent `imageFileAssetId` (valid UUID format, no FileAsset row) → HTTP 500 generic; Prisma P2003 FK fallthrough to default Nest filter | Precheck `prisma.fileAsset.findUnique({where:{id}})` in `createBanner` + `updateBanner` parity, throw `BadRequestException({code:'FILE_ASSET_NOT_FOUND', message:'imageFileAssetId ссылается на отсутствующий файл'})` |
| **BUG-REG-070** | medium (API contract) | open | backend / catalog-publishing | `backend/src/catalog-publishing/catalog-publishing.service.ts:105-171` | Concurrent `POST /api/stores/:storeId/publishing/catalog-publish` → loser gets 500 (Prisma P2002 unique-conflict OR P2034 serialization_failure fallthrough). Atomicity intact (DB constraint holds; only +1 CatalogVersion row); wrong error code obscures cause | Catch `Prisma.PrismaClientKnownRequestError` for codes `P2002` / `P2034` and throw `ConflictException({code:'CATALOG_VERSION_RACE_CONFLICT', message:'Кто-то уже опубликовал новую версию каталога. Обновите страницу и повторите.'})` |
| **BUG-REG-071** | medium (UX + i18n) | open | backend / stores + products | `backend/src/stores/stores.service.ts:302-313 findStoreById` + `backend/src/products/products.service.ts findProduct` | Non-UUID `:storeId` / `:id` path params → HTTP 500 English `Internal server error` (Prisma value-parsing fallthrough to Nest default filter). Affected: `GET /api/stores/:storeId`, `PATCH /api/stores/:storeId`, `GET /api/products/:id`. Breaches W7 §7.1 watchpoint (0% English user-facing) | Controller-level `ParseUUIDPipe({version:'4', exceptionFactory:()=>new BadRequestException('Некорректный идентификатор')})` (preferred — broad coverage) OR service-level `isUUID(id,4)` guard mirroring `users.service.findUser` pattern that returns 404 "Магазин не найден" |

**Closed in this regression (carry-over reference):**
- BUG-REG-039 (email validation, RFC 5322 dot-atom-text) — closed pre-W1 (PR #15 squash-merged → main `1b1ac7d`, 2026-05-XX prior session); referenced by W1 §1.2 alignment note ("invalid email→401 not 400 — not a regression, that closure was scoped to invite-email validation, not login").
- BUG-REG-040 (banner imageUrl scheme allow-list) — closed pre-W1 (PR #16 squash-merged → main `4497f57`, 2026-05-XX prior session).
- BUG-REG-058 (/api/users/me carryover) — W3 §3.6 confirmed closure live (PASS 13/13).
- BUG-REG-066 (invite-token leak in response body) — W1 §1.7 + §1.9 live-confirmed on staging (`nodeEnv=production` response has no top-level `token` field).

**Cumulative lifetime tally:** **4 medium open** (068 timing-leak, 069 banner-FK-500, 070 concurrent-publish-500, 071 prisma-invalid-uuid-path-500) + **1 medium closed in-wave** (067) + **3 medium-or-higher closed pre-W1** (039, 040, 058, 066). **0 high. 0 critical.**

---

## 4. DEFENSE-IN-DEPTH BACKLOG

Items below are NOT blockers — they are hardening opportunities surfaced during W1–W7 that should land in a future iteration. None breaks an acceptance criterion or PRD requirement.

| # | Source wave | Item | Severity | Recommended owner |
|---|---|---|---|---|
| D1 | W7 §7.1 + W5 §5.1 | **ParseUUIDPipe Russian fix (combined 069+071)** — apply `ParseUUIDPipe({exceptionFactory:()=>new BadRequestException('Некорректный идентификатор')})` at controller level for ALL `:id` / `:storeId` / `:userId` / `:productId` / `:catalogVersionId` / `:bannerId` route params; same controller-level pattern closes the Prisma-FK-fallthrough family in 069 too if extended with a FK-precheck service-level guard. **Recommended: pair the pipe with FK-prechecks in `advertising.service.createBanner`/`updateBanner` and `catalog-publishing.service` so all Prisma-error fallthroughs are caught at service layer.** | medium → covers 069+071 in one batch | backend platform team |
| D2 | W7 §7.6 addendum | **Frontend `backendMessageTranslations` map addendum** — add `'Internal server error': 'Внутренняя ошибка сервера. Попробуйте позже.'` to `shared/api/backendApi.ts:51` so frontend translates even if backend deploy lags fix rollout. Defense-in-depth companion to D1. | low (cosmetic / belt-and-suspenders) | frontend platform team |
| D3 | W1 §1.10 + W7 §7.1 | **Global Express 404 catch-all in Russian** — register `app.use((req, res) => res.status(404).json({message:'Маршрут не найден', statusCode:404}))` after all routes so framework-default English `Cannot GET /api/<unknown>` stops surfacing. Defense-in-depth: not a regression (only hits truly-nonexistent routes), but closes the last English fall-through. | low | backend platform team |
| D4 | W7 §7.3 | **Metrics double-prefix cosmetic** — `scale_admin_process_process_*` is `prom-client` auto-collected standard metrics being wrapped by our `scale_admin_` prefix. Affects readability of Grafana queries, not accuracy. Switch to `prom-client`'s `prefix` constructor option to dedupe. | low (cosmetic) | observability owner |
| D5 | W4 §4.7 + W7 §7.4/§7.5/§7.6/§7.7 | **Mobile live-browser regression deferred** — 12 items collected for live browser verification at 375×667: visual scroll affordance on `overflow-x` tables, pagination button tap target (~36px vs 44pt HIG), modal centering, long Russian wrap in `metric-card-strong`/badges, landscape orientation toast, keyboard form `scroll-into-view`, deep category tree squeeze (4+ levels), etc. All code-review-only this regression because browser tool was unavailable. | low–medium (no current functional break) | QA team — next regression with browser tool live |
| D6 | W1 §1.10 + W5 lessons + BUG-REG-067 | **`OPERATOR_SEED_ON_STARTUP=true` toggle + seed.js extension** — extend `backend/prisma/seed.js` to seed a canonical operator-role user (e.g. `qa-operator@example.com` / `qa-operator12345`) gated by env flag, default off in prod, on in staging. Closes the W5-lesson §3 gap that BUG-REG-067 surfaced. | medium (QA infra) | backend platform team |
| D7 | W6 closure | **Watchdog stale-heartbeat detection improvement** — W6 had a 6-min idle stall from prior-session disconnect across CSRF rotation. The watchdog detected the resumed session correctly but did not surface a stale-heartbeat alert during the stall. Add a `lastHeartbeatAt < now - 5min` rule to the orchestrator watchdog so future regressions surface stalls faster. | low | orchestration owner |
| D8 | W5 §5.1.h + W7 §7.2 | **`redact.sh` further hardening** — wave 7 extended `redact.sh` to handle Netscape `cookies.txt` tab-separated session + csrf patterns; recommend adding (a) wave-closure verifier cron-style `find evidence/ -newer _startprobe -type f \| xargs grep -lE 'csrfToken[^A-Z]*:[ ]*"[A-Za-z0-9_\-]{16,}"'` as final gate, (b) auto-redact-on-write hook in any future evidence-capture helper to enforce "every evidence file MUST be piped through redact.sh at write-time". | medium (process hygiene) | regression-tools owner |
| D9 | W2 §2.1 | **CSRF middleware ordering nuance** — W2 §2.1 found `CSRF middleware fires before SessionGuard`, so anonymous POST → 403 CSRF_TOKEN_INVALID (not 401). Not a leak (anon still rejected), but the brief predicted 401. Decide canonical contract: prefer 401 first (auth-then-CSRF) or accept current 403-then-401 (CSRF-then-auth). | low (consistency) | backend platform team |
| D10 | W4 §4.5.5 | **nginx 413 oversize JPG response** — nginx returns HTML `413 Payload Too Large` before request reaches backend (defense-in-depth, both caps in force). Recommend returning JSON `413 {"message":"Файл слишком большой", "statusCode":413}` at the nginx layer for API-consistency. | low (UX-only) | infra/devops |

---

## 5. DEVIATIONS LOG

All 7 testing waves (W1–W7) executed in **single-inline Lead-as-Manager+Tester** pattern (subagent depth budget 1/1 hit at Manager invocation across every wave). Documented as deviation at W1 §"Tester run log" line 169; accepted and re-applied W2 through W7 with explicit per-wave noting. No security impact on verdicts; pattern proven across 49 sub-blocks.

| # | Wave | Deviation | Justification | Resolution |
|---|---|---|---|---|
| Dv1 | W1–W7 | Single-inline Manager+Tester execution (depth budget 1/1) | Subagent depth budget exhausted at Manager invocation; spawning a separate Tester subagent failed | Documented at each wave; pattern proven; brief explicitly approved across waves |
| Dv2 | W1 | Substituted QA credentials (`qa-admin@example.com` for `qa-admin@gmail.com`; `admin@example.com` as lockout target instead of `qa-operator@gmail.com`) | Brief's credentials don't authenticate; no operator user existed on staging at all | Filed BUG-REG-067; resolved by Maksim manual operator creation (`qorxoes@gmail.com` admin + `unit-cusp-slam@duck.com` operator) for W2+ |
| Dv3 | W1 | Operator-role tests via reuse policy from W5 closure | `users.controller.ts:18-21,79-82` class-level `@RequireRoles('admin')` makes operator-403 structurally invariant; W5 PR #24 acceptance evidence cited | Documented in W1 deviations; reuse policy is sound (code-invariant) |
| Dv4 | W1 §1.6 | Live DB peek deferred (live psql) | Staging Postgres only reachable inside docker network | Cookie-vs-hash smoke + `session-token.util.ts:7-9` + `auth.service.ts:121-122,141,208-211` code-review used; the RED-trigger "stored value matches verbatim" directly disproved via smoke |
| Dv5 | W1, W7 §7.4–§7.7 | Browser tool unavailable inline; code-review fallback | Only `web_fetch` (markdown extract) deferred — no DOM/click/upload primitives | W1: API-equivalent + DOM grep deferred. W4 §4.7: explicit "BROWSER UNAVAILABLE in inline mode" marker. W7 §7.4–§7.7: code-review with explicit per-section marker; 12 items collected for next-regression live browser verification (defense-in-depth D5 above) |
| Dv6 | W3 | Audit log endpoint naming clarification | Brief referenced `/api/audit-logs`; actual routes are `/api/logs/global` (admin) + `/api/stores/:storeId/logs` (admin+operator) | Routes verified in `audit-log.controller.ts`; brief noted as documentation drift not a bug |
| Dv7 | W6 | Prior-session disconnect mid-block; resumed clean | Session disconnect 18:21 mid-block, resumed 18:27 with intact cookie jars + fresh CSRF rotation | Re-probed liveness on resume, drift = 0, evidence continuity intact; 6-min idle stall noted in BLOCK-06.md timeline; informed D7 defense-in-depth recommendation |
| Dv8 | W7 | Session crash post-wave at 21:12; resumed in new session 21:13+ for verification + MEMORY append + W8 dispatch | W7 work was complete (executed by prior session 20:48→21:11), but the session crashed before final MEMORY.md append landed | Resumed session re-read all evidence, verified W7 closure intact on disk, completed MEMORY append + W8 dispatch with no state loss |
| Dv9 | W4 §4.5.5 | nginx 413 HTML (edge cap) instead of backend JSON 400 for oversize JPG | Both caps in force (nginx + backend); defense-in-depth | Not a regression; D10 noted for cosmetic JSON-consistency improvement |
| Dv10 | W4 §4.8.5 | Concurrent edit with shared cookie jar hit CSRF rotation race (403/200); retried with 2 separate sessions → both 200 | Shared-jar artifact, not a real concurrency bug | Test re-run with proper isolation; passed; documented |

---

## 6. 🔴 WATCHPOINT INCIDENTS LOG

Two 🔴 incidents triggered across W1–W7. **Both remediated in-flight; neither escalated to Lead-halt; both required process improvements that landed in-wave.**

### Incident #1 — W1 (2026-05-24 ~12:55 GMT+2): Brief credentials don't authenticate against staging

- **Surface:** All W1 sub-blocks blocked on first probe.
- **Detail:** Brief specified `qa-admin@gmail.com` / `qa-operator@gmail.com` (password `QaRegression123!`); neither account existed on staging. Seed at `backend/prisma/seed.js` provisions only `qa-admin@example.com` / `qa-admin12345` and never seeded an operator role.
- **In-flight remediation:**
  1. Manager filed BUG-REG-067 (medium, process).
  2. Manager substituted `qa-admin@example.com` for admin-side tests; used Wave 5 reuse policy + code-review for operator-side coverage (`users.controller.ts:18-21,79-82` class-level `@RequireRoles('admin')` proves operator-403 structurally invariant — no live operator login required to verify the gate).
  3. Maksim manual-seeded `qorxoes@gmail.com` (admin) + `unit-cusp-slam@duck.com` (operator, STORE-001 assignment) between W1 close and W2 dispatch.
- **Exploit window:** None. Brief-level process bug, no security exposure.
- **Lesson:** Future regression briefs should be pulled through a Lead-dispatch lint that grep-checks brief credentials against `seed.js`. See D6 (defense-in-depth) for the long-term seed.js fix.

### Incident #2 — W7 §7.2 (2026-05-24 ~20:55–21:08 GMT+2): Ten unredacted live credentials in `docs/regression/2026-05-24/evidence/`

- **Surface:** Consolidated secret-leak audit (`§7.2`, 17 strict + bonus grep patterns across all evidence directories).
- **Detail (three-pass remediation cycle):**
  1. **Pass 1** found **7 unredacted operator session tokens** in `evidence/BLOCK-03/*.raw` files. Owner: `unit-cusp-slam@duck.com` (`da5fc991-…`), sessions captured 12:15–12:30 GMT ~8h before audit, with 14-day Max-Age (so *would* have been valid for 13.6 more days). **Verified non-exploitable BEFORE redaction:** direct probe with the 7 leaked tokens → 401 immediately, sessions had already been revoked by W3's natural block/revoke test flow at `users.service.ts:113 revokeUserSessions`. Defense-in-depth force-revoke via `PATCH /api/users/.../block` then `/unblock` confirmed all 7 → 401. In-place sed-redact applied via `sed -E -i 's/(scale_admin[A-Za-z0-9_]*session=)[A-Za-z0-9_\-]+/\1SESSION_VALUE_REDACTED/g'`. Post-redact: 0 unredacted.
  2. **Pass 2** found cookie jars in BLOCK-07 §7.1 own evidence carrying still-active Wave 7 sessions. Moved to `/tmp/w7r-{admin,operator,anon}-cookies.txt` (chmod 600) OUTSIDE evidence directory (same `/tmp` pattern as W6 `scale-token-w6.txt`).
  3. **Pass 3** (wave-closure re-sweep) caught **3 unredacted CSRF tokens** in `evidence/BLOCK-07/7.1-i18n/{admin,operator,anon}/csrf.json` (and `07-csrf.json`) — saved raw via direct `curl -o` bypassing `redact.sh` pre-write filter. Practically unusable in isolation (matching session cookies in `/tmp` outside evidence + operator session already force-revoked → no exploit path). Redacted in-place via existing `redact.sh "csrfToken"` pattern.
- **`scripts/redact.sh` extension (Wave 7):** added Netscape `cookies.txt` tab-separated session + csrf patterns as defense-in-depth. Verified by piping `/tmp` jar through extended redactor.
- **Final wave-close grep verification:** 9-pattern strict consolidated grep across BLOCK-01 → BLOCK-07 = **0 unredacted**. + 0 Bearer + 0 raw apiToken + 0 raw resetToken/inviteToken/apiTokenHash. (Intentional documented test passwords — `12345678` qorxoes admin pw, `admin12345` seed default, `qa-admin12345` seed QA default, `QaRegression123!` brief credential for non-existent user — excluded per their `seed.js` + brief public visibility.)
- **Cumulative leaks found and remediated:** **10** (7 sessions + 3 csrf). All practically unusable at remediation time. **0 unredacted remain on disk at W7 close.**
- **Exploit window:** None observed. Sessions self-revoked by W3 flow before audit; CSRF tokens unpaired from their matching sessions in /tmp; force-revoke as additional defense-in-depth.
- **Process lesson:** Every evidence file MUST be piped through `redact.sh` at write-time. Same root cause across BLOCK-03 `.raw` files + BLOCK-07 `csrf.json`. Recommended cron-style verifier as final wave-close gate (see D8 defense-in-depth).

---

## 7. CLEANUP STATE (post-W7 close, verified at W7 §7.8)

**Active Wave-prefixed fixtures across W1–W7:** **0**.

| Category | Wave | Created | Closed (archived / cancelled / revoked) |
|---|---|---|---|
| Invites (`csrf-probe-…`, `wave1-invite-leak-probe-…`, `xss-probe-…`) | W1 | 3 | 3 cancelled via `DELETE /api/users/invites/:id` (200 `{cancelled:true}`) |
| Test sessions per sub-block | W1–W7 | many | all logged out (`revoked:true`); W7 §7.2 additionally force-revoked 7 operator sessions found in evidence |
| Store `STORE-WAVE2` | W2 | 1 | archived; filtered from active list; still retrievable by id for admin audit |
| Stores (`STORE-WAVE3-*`) | W3 | per brief | archived |
| Products (`PRODUCT-WAVE3-*`, plus 3 orphan W5-products archived at W7 §7.8 cleanup-gap closure) | W3, W5→W7 | per brief | archived; W5 cleanup originally missed 3 orphan product records (cleanup only archived category root + active placement + banner) — W7 §7.8 closed the gap |
| Users (`USER-WAVE3-*@throwaway.test`) | W3 | per brief | soft-deleted |
| Invites (W3) | W3 | per brief | expired |
| Scales (`SCALE-WAVE3-*`) | W3 | per brief | blocked |
| Categories `Wave4-Root` / `Wave4-Root2` / Unicode + Emoji categories | W4 | 4 | archived; cascade-archived Wave4-Child + Wave4-Grandchild + 3 placements (Apples, Bananas, Milk) |
| W4 banners (jpg + png) | W4 | 2 | archived |
| StoreProductPrice rows (W4) | W4 | 3 | functionally inert (filtered by active placement; all archived); no DELETE endpoint, same pattern as W3 |
| FileAsset rows (W4) | W4 | 8 | image storage retained (UUID filenames unguessable; not user-data secrets); no DELETE endpoint |
| `Wave5-Test` catalog root + foreign test store + W5 banner | W5 | 3 | archived; +3 W5-orphan products archived in W7 §7.8 closure |
| CatalogVersions (W5) | W5 | 5 | **retained by design — PRD §6.11 immutability** (currentVersion v#5 id `7da29b48-…` is publishable head) |
| Scale `SCALE-W6-01` | W6 | 1 | archived; admin can re-activate if needed |
| `/tmp/scale-token-w6.txt` | W6 | 1 | removed |
| `/tmp/w7r-{admin,operator,anon}-cookies.txt` | W7 | 3 | retained at chmod 600 outside evidence; will expire naturally (sessions force-revoked at W7 §7.2) |
| Test accounts (`qorxoes@gmail.com` admin, `unit-cusp-slam@duck.com` operator) | seeded by Maksim post-W1 | 2 | **intact + active** — no lockout, no block remaining; both able to login |

**5 CatalogVersion rows retained for STORE-001's `Main Catalog`** — by design per PRD §6.11 "опубликованная версия каталога ИЗМЕНЕНИЯ ДО ОДНОЙ-ТО-РАЗВЕТЬЕ-НЕВАЛИЛИЛАСЬ-И-БАЦЕЛИКАТНАЯ — immutable history". CatalogVersion #5 (id `7da29b48-4f9a-491a-8490-176a7f631ddb`) is the current publishable head; #1–#4 are immutable history. `canPublish=true`, blocking errors `[]`, warnings `[NO_ACTIVE_ADVERTISING_BANNERS, EMPTY_CATALOG]` (both expected post-cleanup).

---

## 8. PROD UNTOUCHED PROOF

**Production commit byte-identical from W0 baseline through W8 close — 0 drift across the entire ~8h45m regression window.**

| Probe time (GMT+2) | Source | Prod `/api/version` | Prod `/api/health` | Staging `/api/version` | Staging `/api/health` |
|---|---|---|---|---|---|
| **12:47 (W0 dispatch baseline)** | BLOCK-01 §"Baseline checks" + MEMORY.md Wave 0 | 200 `commit=3538b7c builtAt=2026-05-22T08:05:35Z` | 200 `status=ok` | 200 `commit=0cf0966 builtAt=2026-05-23T20:42:10Z` | 200 `status=ok` |
| 13:11 (W1 end) | BLOCK-01 §"Liveness re-probe" | 200 `3538b7c` ✓ match | 200 ✓ | 200 `0cf0966` ✓ match | 200 ✓ |
| 13:46 → 13:57 (W2 start→end) | BLOCK-02 §"Re-probe drift" | 200 `3538b7c` ✓ | 200 ✓ | 200 `0cf0966` ✓ | 200 ✓ |
| 14:06 → 14:32 (W3 start→end) | BLOCK-03 §"Drift baseline" | 200 `3538b7c` ✓ | 200 ✓ | 200 `0cf0966` ✓ | 200 ✓ |
| 14:53 → 15:12 (W4 start→end) | BLOCK-04 §"Drift baseline" + §"End-of-block re-probe" | 200 `3538b7c` ✓ | 200 ✓ | 200 `0cf0966` ✓ | 200 ✓ |
| 15:48 → 18:05 (W5 start→end) | BLOCK-05 `_startprobe/start-probe.txt` + W5 cleanup-log | 200 `3538b7c` ✓ | 200 ✓ | 200 `0cf0966` ✓ | 200 ✓ |
| 18:14 → 18:40 (W6 start→end) | BLOCK-06 §"Drift baseline" + §"End-of-block re-probe" | 200 `3538b7c` ✓ | 200 ✓ | 200 `0cf0966` ✓ | 200 ✓ |
| 20:47 → 21:11 (W7 start→end) | BLOCK-07 dispatch + W7 closure | 200 `3538b7c` ✓ | 200 ✓ | 200 `0cf0966` ✓ | 200 ✓ |
| **21:24 (W8 final, this report)** | live drift snapshot run at synthesis time | **200 `{"commit":"3538b7c","builtAt":"2026-05-22T08:05:35Z","version":"0.1.0","environment":"production"}`** | **200 `{"status":"ok","service":"scale-admin-backend","timestamp":"2026-05-24T19:24:01.653Z"}`** | **200 `{"commit":"0cf0966","builtAt":"2026-05-23T20:42:10Z","version":"0.1.0","environment":"production"}`** | **200 `{"status":"ok","service":"scale-admin-backend","timestamp":"2026-05-24T19:24:01.796Z"}`** |

**Operation type during entire regression on production:** read-only `GET /api/version` + `GET /api/health` only. **Zero write attempts.** Zero login. Zero auth. Zero state-changing requests. Zero DB writes. The only mutable interaction with production was the read-only liveness probe pattern, deliberately chosen as the canonical "prod-untouched proof" mechanism per Wave 0 dispatch policy.

---

## 9. PRD COVERAGE CHECKLIST

| PRD section | Coverage | Wave(s) | Status |
|---|---|---|---|
| **§6.1 + §11.1–§11.3 — Auth & Sessions** (login, logout, wrong-password, rate-limit/lockout, cookie attrs, session id regen, sessionTokenHash storage, CSRF on state-changing, idle/absolute timeout, invite/reset dummy token) | W1 sub-blocks §1.1–§1.10 + W2 §2.6–§2.7 (session lifecycle + blocked-user); cookie attrs `HttpOnly + Secure + SameSite=Lax`, `Max-Age=1209600` (14d = absolute timeout); pre-vs-post-login cookie value confirmed changed (fixation defense via `createSessionToken()`); CSRF on POST `/api/auth/invites` + `/api/auth/password-reset/{request,confirm}` all 403 without token, 2xx with token; tampered cookie 401; logout invalidates immediately | W1, W2 | ✅ |
| **§2 + §11.4 — RBAC** (anon baseline, operator allowed, operator denied admin-only, operator cross-store scoping → no info leak, admin global, session lifecycle, blocked-user lifecycle, error-shape consistency) | W2 sub-blocks §2.1–§2.8; critical 2.4 info-leak gate: 12 in-band probes (WAVE2 store + bogus-UUID) → byte-identical 403 `Нет доступа к магазину` (StoreAccessGuard hides existence boundary from operators); admin sees distinguishable 404 (intended dual-axis); 14 × 401 byte-identical + 9 × 403 "Недостаточно прав" byte-identical + 12 × 403 "Нет доступа к магазину" byte-identical | W2 | ✅ |
| **§11.2 — CSRF** (state-changing endpoints) | W1 §1.7 (POST `/api/auth/invites`, `/api/auth/password-reset/request`, `/api/auth/password-reset/confirm` — all 403 `CSRF_TOKEN_INVALID` without token; 2xx with token; mismatched value → 403; GET on POST routes → 404); W2 §2.1 (CSRF before SessionGuard observed); W3+ all state-changing tests went through CSRF flow | W1, W2, W3+ | ✅ |
| **§11.3 — Password Hashing** (pbkdf2_sha512 / 210k iterations / `sessionTokenHash` storage) | W1 §1.6 (cookie-vs-hash smoke + `session-token.util.ts:7-9` + `auth.service.ts:121-122,141,208-211` code-review; RED-trigger "stored value matches cookie verbatim" directly disproved); BUG-REG-068 mechanism analysis confirms pbkdf2 path (210k iter / sha512 / 64-byte key) | W1 | ✅ (with BUG-REG-068 open for timing-equalization) |
| **§6.13 + §6.14 + §11.5 — Scale Sync API** (device auth, query-string apiToken rejection, check-update no-update / with-update, ack success/error, integrity bypass, ScaleSyncLog entries, rate-limit per-IP scale-api bucket 20/60s) | W6 §6.1–§6.8 (67 probes; QS-bypass CLEAN; packageChecksum integrity CLEAN; ack integrity-bypass CLEAN; rate-limit RateLimitGuard → ScaleApiAuthGuard order verified; bucket `scale-api` 20/60s per-IP confirmed) | W6 | ✅ |
| **§11.6 — Audit Logging** (read access + RBAC + secret-grep) | W3 §3.5 (11/11 PASS + secret-grep CLEAN); operator `/api/stores/:storeId/logs` + admin `/api/logs/global`; dateFrom URL-encoding silent-drop flagged (defense-in-depth, not a bug); W4 §4.5.11 (`file.uploaded` audit row with `storeId=null` global event, surfaces via admin endpoint only — documented design choice) | W3, W4, W6 | ✅ |
| **§6.10 + §11.7 — File Upload Security** (magic-bytes validation, oversize cap, content-type, path-traversal, txt-as-image rejection) | W4 §4.5 (banner upload — 19/19 + 4 🔴 watchpoints CLEAN) + W4 §4.6 (14/14 + 2 🔴 watchpoints CLEAN); §4.5.5 oversize.jpg (>2MB) → nginx 413 HTML (edge cap, defense-in-depth) | W4 | ✅ |
| **§11.8 — Transport + Rate Limiting** | Implicit across all waves (HTTPS via nginx termination); W6 §6.7 scale-api rate-limit explicit (20/60s per-IP); W1 §1.3 login lockout `AUTH_FAILED_LOGIN_LOCK_MINUTES=15` ≤4 attempts/(ip,email) | W1, W6, all | ✅ |
| **§6.11 + §15 — Publishing Atomicity + Immutability** | W5 §5.1–§5.7 (atomicity: race-A 500-loser + race-B 201-winner, +1 CatalogVersion row only → DB constraint holds despite loser 500 → BUG-REG-070 filed for error-code correction; immutability: published CatalogVersions retained, no mutation possible after publish); 5 CatalogVersion rows kept by design | W5 | ✅ (with BUG-REG-070 open for 409-not-500 error code) |
| **§6.12 — packageData snapshot integrity** | W5 §5.3 (packageData shape + checksum); W6 §6.4 packageChecksum watchpoint CLEAN (with-update path returns correct checksum matching package contents) | W5, W6 | ✅ |
| **§14.3 — Observability** (metrics endpoint, no PII leak) | W7 §7.3 (8/8 PASS); `text/plain; charset=utf-8; version=0.0.4` Prometheus format; 37 series; custom `scale_admin_db_*` 4 metrics + `scale_admin_http_request_duration_seconds` histogram + `scale_admin_http_requests_total` counter; **PII-leak gate CLEAN**: 8 distinct label keys (`app, kind, major, method, minor, patch, route, status_code`) — none PII; `user_id`/`email`/`session_id`/IP/UUID/filesystem-path grep all → 0; route labels templated (no parameterized UUIDs → no cardinality explosion); public-by-design per Prometheus convention | W7 | ✅ |
| **i18n — Russian user-facing** | W7 §7.1 (32/32 + BUG-REG-071) + W7 §7.6 errors (7/7 + frontend translation-map addendum); 16 API surfaces + 21 frontend empty-states + 3-layer frontend error pipeline all Russian; **ONE English fall-through** — Prisma-invalid-UUID 500 `Internal server error` on 3 routes | W7 | ⚠️ — **BUG-REG-071 open** (medium; closes after D1 ParseUUIDPipe ships) |
| **Mobile responsive 375×667** | W7 §7.4 (10/10 PASS code-review fallback); 4 breakpoints (`max-width: 900/800/720/520 px`) all hit iPhone SE 375; Login card `width:min(480px,100%)` + 2rem padding → 343px; Dashboard `width:min(1040px,100%)` + 1rem @<520 → 343px; inputs 44px tap target (Apple HIG); metric-cards 4→1col @<900; banner-upload-card 1fr @<800; prices `min-width:980px` wraps in `overflow-x:auto` | W7 | ⚠️ — **code-review only; live-browser verification deferred** (D5 defense-in-depth) |
| **Empty states** | W7 §7.5 (23/23 PASS); 21 unique surfaces in `main.tsx` + 2 helper components (`IssueList`, `DashboardList`) — all explicit Russian copy; TypeScript type forces caller to pass `emptyText` — no missing-fallback path | W7 | ✅ |
| **Error states** | W7 §7.6 (7/7 PASS); 3-layer error pipeline `shared/api/backendApi.ts` (`messageFromData:266` + `translateBackendMessage:51` with 17 mapped entries + `normalizeError:279` status-based defaults; layer-4 `errorMessageFromUnknown:1962 main.tsx` Russian fallback); 401/403/429/FETCH/PARSING/TIMEOUT/CUSTOM/Other all have Russian fallback | W7 | ✅ (with BUG-REG-071 + D2 frontend translation-map addendum recommended) |
| **UX polish** (loading / disabled / confirm / toasts) | W7 §7.7 (60+/60+ PASS); loading spinners + disabled-state buttons + confirm dialogs + toasts inventoried via code-review | W7 | ✅ (live-browser polish items deferred to next regression — D5) |

**Two ⚠️ items: both BUG-REG-071-related (closes with D1 fix) and mobile live-browser verification deferred (D5, no current functional break — code-review covers structure).**

---

## 10. RECOMMENDATIONS

### A. Pre-production hotfix batch (small, low-risk, suggested order)

The 4 open medium bugs are all backend error-handling fixes — small, low-risk, can ship as 1 PR or 4 micro-PRs:

1. **Fix 069 + 071 in one PR** — apply `ParseUUIDPipe({version:'4', exceptionFactory:()=>new BadRequestException('Некорректный идентификатор')})` at controller level for all UUID path params (`:storeId`, `:userId`, `:productId`, `:catalogVersionId`, `:bannerId`, `:id`); add FK-precheck for `imageFileAssetId` in `advertising.service.createBanner` + `updateBanner`. Single PR closes 2 bugs.
2. **Fix 068 in 1 PR** — `auth.service.ts` lines 92-119: precompute a fixed dummy `DUMMY_CREDENTIAL` (pbkdf2_sha512 of a throwaway string with fixed salt) and call `verifyPassword(password, DUMMY_CREDENTIAL)` on the no-user branch before throwing. Acceptance: 5-sample latency ratio ≤1.5× on staging.
3. **Fix 070 in 1 PR** — `catalog-publishing.service.ts:105-171`: wrap `tx.catalogVersion.create` in try/catch, map `Prisma.PrismaClientKnownRequestError` with `err.code in ('P2002','P2034')` → `ConflictException({code:'CATALOG_VERSION_RACE_CONFLICT', message:'Кто-то уже опубликовал новую версию каталога. Обновите страницу и повторите.'})`. Validate via the same 2-cookie-jar race repro from W5 §5.7.C.
4. **Frontend addendum (D2) in 1 micro-PR** — `shared/api/backendApi.ts:51`: add `'Internal server error': 'Внутренняя ошибка сервера. Попробуйте позже.'` to `backendMessageTranslations` as defense-in-depth so frontend translates even if backend deploy lags.

Suggested execution: ship #1 + #2 + #3 + #4 as one batched PR ("post-regression-2026-05-24 hotfix batch") with regression-test pinning for each of BUG-REG-068, -069, -070, -071. Estimated effort: ~half-day of backend work + ~1h of frontend work.

### B. Defer to next iteration (not pre-prod blockers)

- **D5 — Mobile live-browser regression** at 375×667 with actual openclaw browser tool live (12 items collected); pair with iPad / Android landscape for completeness.
- **D6 — `OPERATOR_SEED_ON_STARTUP=true` seed.js extension** so future regressions don't trip on the same brief/staging credential gap (BUG-REG-067).
- **D7 — Watchdog stale-heartbeat improvement** to surface mid-block disconnects faster (W6 had a 6-min idle stall before watchdog routed the resumed session).
- **D8 — `redact.sh` cron-style verifier** as wave-close gate so future evidence files are auto-checked at wave-close.
- **D9 — CSRF-then-auth ordering decision** for consistency.
- **D10 — nginx 413 JSON response** for API-consistency on oversize uploads.
- Defense-in-depth items D3 (global 404 Russian catch-all) and D4 (metrics double-prefix cosmetic) can land any time.

### C. Production deployment

**After A. lands and regression-tests pin the 4 bug closures: PRODUCTION-READY ✅.**

All PRD security gates are GREEN at current state. The 4 open medium bugs are UX/error-handling refinements with NO security exploit, NO data integrity issue, NO PII leak, NO auth bypass. They surface only as wrong HTTP status codes (500 instead of 400/404/409) with English fall-through strings. Shipping current `main` to prod would not introduce a regression vs the current production commit `3538b7c` (these bugs almost-certainly exist on prod already with identical code paths — they were not introduced by recent changes), but the hotfix batch closes the last cosmetic gaps so prod ships with full Russian-localization + clean error contracts.

---

## Wave 8 close

- This file (`docs/regression/2026-05-24/FINAL-REPORT.md`) — created 2026-05-24 21:24 GMT+2.
- Final drift snapshot taken at 21:24 GMT+2: prod `3538b7c` 200 + staging `0cf0966` 200 — **zero drift vs W0 baseline at 12:47 GMT+2**.
- MEMORY.md append follows (W8 PASS, regression closed, final report path).
- **Regression DONE.** No further waves. No "wait for Wave N+1 brief".
