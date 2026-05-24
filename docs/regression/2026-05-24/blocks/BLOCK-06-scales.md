# BLOCK-06 — Scale Sync API (device auth + sync flow)

**Wave:** 6 of REGRESSION-2026-05-24
**Dispatched:** 2026-05-24 18:11 GMT+2 (Maksim)
**Started:** 2026-05-24 18:14 GMT+2 (Lead, single-inline Manager+Tester per depth budget 1/1)
**Verdict:** ✅ **PASS 8/8** (67 probes, 0 bugs filed, 3 🔴 watchpoints CLEAN, ZERO drift across full window)
**Completed:** 2026-05-24 18:40 GMT+2 (active windows: 18:14–18:21 §6.1-6.3 prior session + 18:27–18:40 §6.4-6.8 resume; idle stall 18:21–18:27 from prior-session disconnect across CSRF rotation)

**Target:** https://staging.maksimfrelikh.ru. Production — только GET /api/version и /api/health.

## Drift baseline (pre-wave, 18:14 GMT+2)

- prod `https://maksimfrelikh.ru/api/version` → 200 `commit=3538b7c environment=production builtAt=2026-05-22T08:05:35Z`
- prod `/api/health` → 200 `status=ok`
- staging `https://staging.maksimfrelikh.ru/api/version` → 200 `commit=0cf0966 environment=production builtAt=2026-05-23T20:42:10Z`
- staging `/api/health` → 200 `status=ok`

ZERO drift since W5 closure (18:05 GMT+2 = 9 min ago).

## Verdict grid

| Sub-block | Scope | Verdict | Bugs filed |
|-----------|-------|---------|------------|
| 6.1 | Scale device CRUD (admin lifecycle, RBAC, hash-only storage) | ✅ PASS 13/13 | none |
| 6.2 | check-update authentication (token/device validity, query-string rejection) | ✅ PASS 11/11 + 🔴 QS-bypass CLEAN | none |
| 6.3 | check-update no-update path (hasUpdate:false + ScaleSyncLog no_update) | ✅ PASS 5/5 | none |
| 6.4 | check-update with-update + 🔴 packageChecksum watchpoint | ✅ PASS 5/5 + 🔴 packageChecksum CLEAN | none |
| 6.5 | ack (success vs error) + 🔴 integrity-bypass watchpoint | ✅ PASS 10/10 + 🔴 integrity-bypass CLEAN | none |
| 6.6 | ScaleSyncLog entries + admin/operator RBAC | ✅ PASS 9/9 | none |
| 6.7 | Rate limiting (PRD §11.5, bucket=scale-api, 20/60s per IP) | ✅ PASS 4/4 | none |
| 6.8 | Edge cases + cleanup + end probe | ✅ PASS 10/10 | none |

## End-of-block re-probe (18:40 GMT+2 vs dispatch 18:14)

- prod `/api/version` → 200 `commit=3538b7c builtAt=2026-05-22T08:05:35Z` (byte-identical)
- prod `/api/health` → 200 `status=ok`
- staging `/api/version` → 200 `commit=0cf0966 builtAt=2026-05-23T20:42:10Z` (byte-identical)
- staging `/api/health` → 200 `status=ok`

**ZERO drift** across the full ~26-min wave window.

## Closure

- SCALE-W6-01 archived (status=archived) — admin can re-activate if needed.
- `/tmp/scale-token-w6.txt` removed.
- Redact-grep 4 patterns × `evidence/BLOCK-06/` → 0 unredacted hits.
- Operator session (`unit-cusp-slam@duck.com`) intact + active; admin session (`qorxoes@gmail.com`) intact + active.
- No bugs filed. No 🔴 escalation triggers fired. Wave 6 STOP — awaiting Wave 7 brief in new session per Maksim's W6 brief stop clause.

## Routes under test

Admin/operator session-auth (cookies + x-csrf-token):
- `POST   /api/stores/:storeId/scales` — admin only
- `GET    /api/stores/:storeId/scales` — admin + operator (store-access guarded)
- `PATCH  /api/scales/:deviceId/status` — admin only
- `POST   /api/scales/:deviceId/regenerate-token` — admin only
- `GET    /api/logs/global` — admin only
- `GET    /api/stores/:storeId/logs` — admin + operator (store-access guarded)

Scale device API (deviceCode + apiToken via body or `x-scale-device-code`/`x-scale-api-token` headers; `@SkipCsrf()`):
- `GET    /api/scale-api/auth-check`
- `POST   /api/scales/check-update` (and legacy `POST /api/scale-api/check-update`)
- `POST   /api/scales/ack`

Guards on scale-api: `RateLimitGuard` (bucket `scale-api`, 20 attempts / 60 s, **per-IP key**) → `ScaleApiAuthGuard`. No session, no CSRF.

## Hard security rules in force

1. `apiToken` plain NEVER in query string. Rejection tests use throwaway invalid value only.
2. `apiToken` plain captured at register/regenerate is kept ONLY in `/tmp/scale-token-w6.txt` (chmod 600). Never written to evidence dir; redactor substitutes `API_TOKEN_REDACTED` before disk.
3. `docs/regression/2026-05-24/scripts/redact.sh` extended to match `"apiToken":"..."`, `x-scale-api-token: ...`, and `apiToken[:=]...` patterns (verified ✅ at 18:14 GMT+2).

## Browser tool availability

**NO.** Browser tools not present in deferred-tool catalog this session — only `web_fetch` (read-only). API + DB-via-curl + code review path used throughout; no W6 sub-block requires browser interaction.

## Wave plan

Same single-inline Lead-as-Manager+Tester pattern as W1/W2/W3/W4/W5 (depth budget 1/1). Each sub-block: probe → assert → SUMMARY.md with verdict + grid. End-of-block re-probe at close. Brief explicitly approved this deviation across waves.
