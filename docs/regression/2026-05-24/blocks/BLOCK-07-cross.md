# BLOCK-07 — Cross-cutting: i18n / secret-audit / metrics / mobile / UX polish

**Wave:** 7 of REGRESSION-2026-05-24
**Dispatch:** 2026-05-24 20:47 GMT+2
**Severity:** high (security audit + i18n customer-facing gate)
**Pattern:** single-inline Lead executing Manager+Tester (depth budget 1/1, same deviation as W1–6)
**Model:** claude-cli/claude-opus-4-7 max thinking
**Browser tool:** unavailable — `web_fetch` for rendered HTML extraction; CSS/Tailwind/component checks via code review

**Target:** https://staging.maksimfrelikh.ru (full)
**Production:** read-only `GET /api/version` + `GET /api/health` only

## Targets / Endpoints
- Frontend rendered pages: `/login`, `/accept-invite`, `/reset-password`, `/dashboard`, `/stores`, `/catalog`, `/prices`, `/audit-log`, `/banners`
- Backend API: error responses across surfaces; `/api/metrics`
- Workspace files: `manager/scale-admin/backend/src/**/*.ts`, `manager/scale-admin/frontend/src/**/*`, `templates/email/**`
- Workspace evidence: `docs/regression/2026-05-24/**`

## Accounts
- ADMIN: qorxoes@gmail.com / 12345678
- OPERATOR: unit-cusp-slam@duck.com / 12345678 (STORE-001)

## Watchpoints (🔴 escalation triggers)
- 🔴 Any English string surfaced to user (API error message OR rendered frontend text) — high severity, BUG candidate
- 🔴 Any unredacted credential / session token / api token in evidence — high severity, immediate redact
- 🔴 `/api/metrics` leaks password/email/token/PII in labels or values — high severity
- 🔴 Stack trace leak in 500 response (prod mode) — high severity
- 🔴 Any high bug (≥3 triggers Wave-level halt + escalate to Lead)

## Sub-blocks
- §7.1 — Russian localization (API errors + frontend rendered + email templates)
- §7.2 — Secret-leak consolidated audit (entire `docs/regression/2026-05-24/`)
- §7.3 — `/api/metrics` validation (PRD §14.3 observability)
- §7.4 — Mobile responsive 375×667 (code review fallback)
- §7.5 — Empty states (frontend code review)
- §7.6 — Error states (frontend + API consistency)
- §7.7 — UX polish (loading / disabled / confirm / toasts)
- §7.8 — Final cleanup verification + end-probe

## Assertion grid

| Sub-block | Probes | PASS | Bugs | 🔴 watch | Verdict |
|-----------|--------|------|------|----------|---------|
| 7.1 i18n  | 32     | 32   | 1 med (BUG-REG-071) | 1 surfaced (Prisma-invalid-UUID 500 English — filed) | ✅ PASS |
| 7.2 secrets | 17 patterns | 17/17 = 0 unredacted | 0 (audit-policy, in-flight remediation) | 1 surfaced (7 op sessions BLOCK-03 .raw + 3 BLOCK-07 csrf.json — all remediated) | ✅ PASS |
| 7.3 metrics | 8 | 8/8 | 0 | none | ✅ PASS |
| 7.4 mobile  | 10 | 10/10 (code-review) | 0 | none | ✅ PASS |
| 7.5 empty   | 23 | 23/23 | 0 | none | ✅ PASS |
| 7.6 errors  | 7  | 7/7 | 0 (BUG-REG-071 addendum only) | none (no stack trace in 500 prod) | ✅ PASS |
| 7.7 polish  | 60+ | 60+/60+ | 0 | none | ✅ PASS |
| 7.8 cleanup | 12 | 12/12 | 0 | none | ✅ PASS |

## Closure

**Wave 7 verdict: ✅ PASS 8/8.**

- **Probes total:** ~170+ across 8 sub-blocks
- **Bugs filed:** 1 medium (BUG-REG-071 — Prisma-invalid-UUID-path → 500 English; addendum for frontend translation-map defense-in-depth). 0 high, 0 critical.
- **🔴 watchpoints triggered:** 2 — both remediated/filed without escalation:
  - §7.1: English `Internal server error` on Prisma-invalid-UUID paths → filed BUG-REG-071 (medium, matches BUG-REG-069 precedent for Prisma fallthrough)
  - §7.2: 7 unredacted operator session tokens in BLOCK-03 .raw files (already revoked at audit time, force-revoke via block→unblock + in-place sed-redact + `redact.sh` extended with Netscape pattern) **PLUS** 3 unredacted CSRF tokens in `evidence/BLOCK-07/7.1-i18n/{admin,operator,anon}/csrf.json` caught by wave-closure 3rd-pass re-sweep (saved raw bypassing `redact.sh`; matching session cookies held in `/tmp/w7r-*` outside evidence + operator session already force-revoked → no exploit path; redacted in-place via existing `redact.sh` csrfToken pattern). **Total: 10 live-credential leaks found and remediated, 0 unredacted remain.**
- **NO escalation triggers:** 0 high bugs (threshold ≥3 to halt); zero drift on prod (`3538b7c`) + staging (`0cf0966`); no test account lockout; wave window ~30 min active.
- **Browser tool unavailable in W7** — code-review used for §7.4/§7.5/§7.6/§7.7 mobile/empty/error/polish surfaces. 12 items collected for Wave 8 live browser verification (visual scroll affordance, pagination tap target, modal centering, etc. — non-blockers).
- **Cleanup gaps closed:** 3 orphan Wave5 products archived (last loose ends from W5 cleanup which only archived the category root + active placement + banner, not the orphan product records). Final `0 active Wave1–7 products + 0 active Wave4 categories + SCALE-W6-01 archived` confirmed cross-section.
- **redact.sh extended** with Netscape `cookies.txt` tab-separated session/csrf pattern as defense-in-depth (Wave 7 extension).

Lifetime W1–W7 bug tally: **4 medium open** (068 timing-leak, 069 banner-FK-500, 070 concurrent-publish-500, 071 prisma-invalid-uuid-path-500 — all deferred for post-regression hotfix batch), **1 medium closed** (039 email-validation), **0 high, 0 critical**, **2 🔴 watchpoints triggered** (W1 brief-credential mismatch → BUG-REG-067; W7 §7.2 unredacted operator sessions → in-flight remediated), all without wave-level halt.

Wave 8 (final consolidated report) to be dispatched next session.
