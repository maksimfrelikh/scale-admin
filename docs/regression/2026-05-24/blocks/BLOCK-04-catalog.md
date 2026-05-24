# BLOCK-04 — Operator Catalog Workflow

**Wave:** 4 of REGRESSION-2026-05-24
**Dispatched:** 2026-05-24 14:52 GMT+2 (Maksim)
**Started:** 2026-05-24 14:53 GMT+2 (Lead, single-inline Manager+Tester per depth budget)
**Verdict:** ✅ PASS 8/8 sub-blocks — 0 bugs filed
**Completed:** 2026-05-24 15:12 GMT+2 (19-minute wave window)

**Target:** https://staging.maksimfrelikh.ru. Production — только GET /api/version и /api/health.

## Drift baseline (pre-wave, 14:53 GMT+2)

- prod `https://maksimfrelikh.ru/api/version` → 200 `commit=3538b7c environment=production builtAt=2026-05-22T08:05:35Z`
- prod `/api/health` → 200 `status=ok`
- staging `https://staging.maksimfrelikh.ru/api/version` → 200 `commit=0cf0966 environment=production builtAt=2026-05-23T20:42:10Z`
- staging `/api/health` → 200 `status=ok`

Matches W3 closure baseline (zero drift since 14:32 GMT+2 = 21 min ago).

## Verdict grid

| Sub-block | Scope                                | Verdict | Bugs filed |
|-----------|--------------------------------------|---------|------------|
| 4.1       | Categories CRUD (operator)           | ✅ PASS 15/15 | —     |
| 4.2       | Tree validation (depth/cycle/foreign-catalog) | ✅ PASS 7/7 | —     |
| 4.3       | Placements (add/move/sortOrder)      | ✅ PASS 16/16 + 3 🔴 watchpoints CLEAN | —     |
| 4.4       | Prices (filter/search/inline update/audit) | ✅ PASS 21/21 + 🔴 Product-immutability CLEAN | —     |
| 4.5       | Advertising (upload/magic-bytes/reorder) | ✅ PASS 19/19 + 4 🔴 watchpoints CLEAN | —     |
| 4.6       | File upload security (PRD §11.7)     | ✅ PASS 14/14 + 2 🔴 watchpoints CLEAN | —     |
| 4.7       | Browser/UI checks (probe first)      | ✅ PASS via API + code review (BROWSER UNAVAILABLE explicit marker) | —     |
| 4.8       | Edge cases + cleanup                 | ✅ PASS 12/12 + cleanup verified | —     |

**Total probes:** 124 logical assertions. **Bugs filed:** 0. **500s found:** 0. **Drift:** 0 (prod 3538b7c, staging 0cf0966 — unchanged across the 19-minute window). **🔴 escalation triggers:** 0 fired.

## End-of-block re-probe (15:12 GMT+2 vs dispatch 14:53)

- prod `/api/version` 200 `commit=3538b7c environment=production`
- prod `/api/health` 200
- staging `/api/version` 200 `commit=0cf0966 environment=production`
- staging `/api/health` 200

**ZERO drift.** Local repo HEAD untouched.

## Browser tool availability

**NO.** Confirmed via ToolSearch deferred-tool catalog scan. Only `web_fetch` is available (markdown extraction; no DOM/click/upload primitives). §4.7 documented with explicit "BROWSER UNAVAILABLE in inline mode" marker + API equivalent + frontend code review (see `evidence/BLOCK-04/4.7-browser-ui/SUMMARY.md`).

## Cleanup verified

- Wave4-Root-Renamed → archived (cascade also archived Wave4-Child + Wave4-Grandchild + 3 placements: Apples, Bananas, Milk)
- Wave4-Root2 → archived (from §4.1)
- Unicode category (`Овощи и фрукты — категория тест`) → archived
- Emoji category (`🥑 Avocados/Авокадо 🍌`) → archived
- 2 W4 banners (jpg + png) → archived
- 0 active placements in STORE-001 catalog
- 0 active banners in STORE-001

**Not archived (no DELETE endpoints — same pattern as W3):**
- 3 StoreProductPrice rows (functionally inert because /prices filters by active placements; all archived)
- 8 FileAsset rows (image storage retained; UUID filenames are unguessable; not user-data secrets)

## Deviations (documented, no security impact)

1. Single-inline Lead-as-Manager+Tester (subagent depth budget 1/1 — same pattern as W1/W2/W3, documented).
2. §4.7 browser checks deferred to API+code-review path with explicit marker (BROWSER UNAVAILABLE in inline mode) — per brief's instruction.
3. §4.2 foreign-catalog parentId test is structurally indistinguishable from "wrong-catalog parentId" because the API auto-derives catalogId from storeId — both fold into same 400 "Родительская категория не найдена в активном каталоге".
4. §4.5.5 oversize.jpg (>2MB) returned **nginx 413 HTML** (edge cap) instead of backend JSON 400 — defense-in-depth, both caps in force.
5. §4.5.11 `file.uploaded` audit row has `storeId=null` (global event) — only surfaces via admin `/api/logs/global`, not operator `/api/stores/:id/logs`. Documented design choice.
6. §4.8.5a concurrent edit with shared cookie jar hit CSRF rotation race (403/200); retried with 2 separate sessions (admin+operator) at §4.8.5b → both 200, last-write-wins, no data corruption.
7. §4.7 brief's "drag-reorder" wording vs implementation's button-based ↑/↓ reorder — documentation drift, not a bug.

## Production untouched throughout

Only GET requests to `https://maksimfrelikh.ru/api/version` + `/api/health` (drift probes). No mutations.

## Brief (from Maksim, verbatim)

> REGRESSION-2026-05-24 — Wave 4: Operator catalog workflow.
> Wave 3 PASS в MEMORY.md (0 bugs, 121 probes, 26 min). W1-W3 single-inline pattern доказал себя. После Wave 4 PASS — STOP, жди Wave 5 brief в новой сессии.
> ⚠️ Wave 5 требует explicit Maxim approval перед dispatch — создание real CatalogVersion на staging.
>
> Severity: high (operator core workflow + file upload security).

Targets:
- Staging: https://staging.maksimfrelikh.ru
- Prod: https://maksimfrelikh.ru — read-only GET /api/version + /api/health only

Test accounts:
- ADMIN: qorxoes@gmail.com / 12345678
- OPERATOR: unit-cusp-slam@duck.com / 12345678 (assigned STORE-001)

Test fixtures (Tester setup → cleanup):
- В STORE-001: создать дерево Wave4-Root → Wave4-Child → Wave4-Grandchild (2-3 уровня)
- Использовать seeded products или создать 2-3 тестовых
- В конце archive всё созданное

Escalate немедленно:
🔴 operator пишет в чужой store catalog
🔴 archived product в active placement
🔴 archived category принимает new placement
🔴 file upload bypass: txt принят как image / >2MB принят / path traversal
🔴 inline price update меняет Product (не Store-scoped)
🔴 ≥3 high bugs
🔴 prod /api/version или /api/health не 200
🔴 Lead stuck >2 часа

## Credentials

- admin: `qorxoes@gmail.com` / `12345678`
- operator: `unit-cusp-slam@duck.com` / `12345678` (assigned to STORE-001)

Reused from W2/W3.

## Tooling notes

- API/CSRF gotchas from W1-3: GET /api/auth/csrf → POST with `x-csrf-token` header, `Origin` header required, cookie env-scoped `scale_admin_staging_*`.
- Routes discoveries from W3: `/api/logs/global` (admin), `/api/stores/:id/logs` (operator), `/api/users/me` → 400 redirect to `/api/auth/session`.
- Browser tool probe at §4.7: if unavailable → explicit "BROWSER UNAVAILABLE in inline mode" marker + API equivalent + code review.

## Test plan

(populated per sub-block during execution — see `evidence/BLOCK-04/4.{1-8}/SUMMARY.md`)
