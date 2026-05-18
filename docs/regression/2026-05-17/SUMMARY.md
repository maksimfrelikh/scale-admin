# Regression Summary 2026-05-17

## Scope

- Blocks executed: 12 / 12
- Time: 2026-05-17 20:44 CEST start → 2026-05-18 08:53 CEST end
  - Wall-clock: ~12 ч (с ночным перерывом)
  - Активное тестирование: ~10 ч
- Environment: production `https://maksimfrelikh.ru`
- Accounts: `qa-admin@***.invalid`, `qa-operator@***.invalid`
- Tooling: curl/jq/openssl (API/network/TLS), Playwright headless Chromium (UI / responsive / multitab / states), `docker exec ... psql` read-only где разрешено

### Blocks (12)

| # | Блок | Покрытие |
|---|---|---|
| 1 | Network / HTTP / TLS / security headers | redirects, TLS expiry, CORS, methods, server disclosure |
| 2 | Auth + sessions + CSRF | login flow, session cookies, CSRF rotation, logout, direct-API |
| 3 | RBAC | admin/operator surface, foreign-store access, invite revoke/restore |
| 4 | Navigation / routing | hash routes, deep links, malformed paths, tabs |
| 5 | Multi-tab / cache consistency | logout broadcast, stores list/Catalog sync between tabs, CSRF stale |
| 6 | Forms / validation / inputs | Stores/Products/Devices forms, edge inputs, XSS, javascript: URL, upload |
| 7 | Catalog / categories / placements | depth, cross-store, archived parent, RBAC, validation matrix |
| 8 | Prices | inline edit, bounds, negative, currency, large values, ESC/click-outside |
| 9 | Publishing | publish flow, version increment, double-publish race, error mapping |
| 10 | Scale devices / sync | register, regenerate token, check-update, USD currency in package |
| 11 | Mobile / responsive | 8 страниц × 5 viewports = 40 скриншотов + DOM measurements |
| 12 | Empty/error/loading/long-session/cache/edge + final sweep | + critical secrets sweep |

## Results

Granularity scenarios — agreggated:

- **Passed**: 188 scenarios
- **Failed (filed as BUG-REG)**: 34
- **Skipped**: 5 (документированы: А2 stores list — нет поля поиска; A5 — фильтр не применился через blur; пара UI-проб где селекторы заменены; см. блоки)
- **Flaky**: 0 (повторов не потребовалось; CSRF/session работают стабильно)

### По блокам

| Блок | pass | fail (BUG-REG) | notes |
|---|---|---|---|
| 1 Network | 7/9 | 2 (REG-001, REG-002, REG-003, REG-004, REG-005) | 5 баг findings: HSTS отсутствует, +доп. security headers, Server/X-Powered-By disclosure |
| 2 Auth | 16/18 | REG-006 | низкоприоритетные UX-щели |
| 3 RBAC | 14/16 | REG-007, REG-008, REG-009 | invite gap, operator silent fallback |
| 4 Nav | 12/14 | REG-010, REG-011, REG-012, REG-013 | BUG-UX-002 reproduced |
| 5 Multitab | 11/14 | REG-014, REG-015, REG-016, REG-017 | BUG-UX-001/011/012 reproduced, BUG-UX-003 НЕ воспроизводится |
| 6 Forms | 18/22 | REG-018, REG-019, REG-020, REG-021, REG-022 | javascript: URL accepted, invite validation gaps |
| 7 Catalog | 22/24 | REG-026 (status filter), informational findings | active filter leak |
| 8 Prices | 11/14 | REG-023, REG-024, REG-027, REG-028 | huge values, ESC/click-outside |
| 9 Publishing | 8/10 | REG-029, REG-030 | non-RUB currency in packageData, 500 instead of 409 |
| 10 Scales | 11/13 | REG-029 (cross-block), REG-031 | check-update 500, USD package leaked to scales |
| 11 Responsive | 38/40 | REG-032, REG-033 | invite form overflow on 1024, mobile tap targets <44px |
| 12 States/Final | 21/26 | REG-034 (sweep finding) | + 5 проверок (G23/G22 N/A; A2 finding не bug; D14 0 polls) |

## Bugs found

- **Total**: 34
- **Critical**: 1
- **High**: 6
- **Medium**: 14
- **Low**: 13

### Critical (1)

- **BUG-REG-034** — Plaintext apiToken и password в untracked evidence/scripts (process / evidence hygiene). Все 6 файлов санитизированы в сессии. Git history clean. Требуется ротация 3 apiTokens отдельным шагом + pre-commit hook (см. рекомендации в bug).

### High (6)

- **BUG-REG-014** — Logout in one tab не пропагируется в другие вкладки (no broadcast). _Воспроизводит BUG-UX-001._
- **BUG-REG-017** — При смене сессии admin → operator в другой вкладке Tab A продолжает показывать admin UI 30+ сек.
- **BUG-REG-020** — Invite endpoint принимает невалидные email формы (`a@`, `@b.c`, `a@b`, `a@b.c.`).
- **BUG-REG-025** — Нет password reset / forgot password flow (functional gap).
- **BUG-REG-026** — `?status=active` filter не работает на `/catalog/categories` и `/catalog/placements` — active package протекает archived.
- **BUG-REG-029** — non-RUB currency из БД попадает в published `packageData` и доезжает до scales (BUG-REG-027 reaches scales).

### Medium (14)

REG-001, REG-002, REG-009, REG-011, REG-012, REG-015, REG-016, REG-018, REG-019, REG-021, REG-023, REG-027, REG-031, REG-032, REG-033 — security headers (HSTS), invite management, malformed routes, multi-tab cache, timezone validation, javascript:URL, invite expiresAt в прошлом, price upper bound, currency validation, check-update 500 + lost log, responsive overflow, mobile tap targets.

### Low (13)

REG-003, REG-004, REG-005, REG-006, REG-007, REG-008, REG-010, REG-013, REG-022, REG-024, REG-028, REG-030 — server disclosure, 405 vs 404 на GET-only routes, 429 без Retry-After, validation cosmetics, operator silent fallback, invite 500 vs 404, post-login URL, ESC/click-outside на price, double-publish 500 vs 409.

## Known bugs (BUG-UX-001..013) reproduction status

| ID | Описание (кратко) | Статус сегодня | Покрытие |
|---|---|---|---|
| BUG-UX-001 | Logout не пропагируется между вкладками | ❌ воспроизводится | BUG-REG-014 |
| BUG-UX-002 | Malformed/unknown hash routes → silent Dashboard | ❌ воспроизводится | BUG-REG-012 |
| BUG-UX-003 | Stale CSRF token в browser-fetch | ✅ не воспроизводится в runtime (cookie берётся свежий) | — (не зарепорчен; оставлено на code review) |
| BUG-UX-004 | "что-то пошло не так" generic error | ✅ FIXED — текст не воспроизводится |  — |
| BUG-UX-005 | Operator на admin-only routes | ❌ воспроизводится | BUG-REG-008 |
| BUG-UX-006 | Operator на /stores/{foreign} silent Dashboard | ❌ воспроизводится | BUG-REG-008 |
| BUG-UX-007 | SPA остаётся на dashboard после 401/session loss | ✅ **FIXED** — после invalidate cookies + Refresh SPA уходит на /login (D-bugux007 evidence) |  — |
| BUG-UX-008 | Logs horizontal overflow 1376/1377 px на mobile/tablet | ✅ FIXED — больше не воспроизводится | — |
| BUG-UX-009 | Operator store-details width 983 px @ small viewports | ✅ FIXED | — |
| BUG-UX-010 | Dashboard width 682 px @ 390/430 viewport | ✅ FIXED | — |
| BUG-UX-011 | Stores list не обновляется в Tab B после mutation | ❌ воспроизводится | BUG-REG-015 |
| BUG-UX-012 | Store Detail Catalog не обновляется cross-tab | ❌ воспроизводится | BUG-REG-016 |
| BUG-UX-013 | Post-login URL остаётся `/login` | ❌ косметика; nav работает | BUG-REG-013 |

Итого по known: 4 FIXED, 1 не воспроизводится (BUG-UX-003), 8 воспроизводятся и закрыты новыми BUG-REG.

## Production readiness verdict

### 🟡 yellow

**Обоснование (3 строки):**

Core flows стабильны: login, RBAC, publishing, scale sync с правильной currency, multi-tab session boundary. BUG-UX-007 (главный блокер UAT 2026-05-16) исправлен — после 401 SPA уходит на login. Однако остаются 6 high-priority issues (logout broadcast, cross-tab session pollution, invite UX gaps, password reset отсутствует, status filter утечка, non-RUB currency в packageData) + critical leak секретов в untracked evidence — все требуют действий до публичного запуска / расширения userbase.

Зелёный был бы при: 0 high, 0 critical, security headers (HSTS+CSP), и закрытые invite/multi-tab inconsistencies.

## Top-3 recommendations (что фиксить первым)

1. **BUG-REG-029** (high, publishing) — non-RUB currency из БД попадает в published packageData и доезжает до scales. Это влияет на end-user UI на весах: показывают неправильную валюту. Фикс: либо валидация на publish (reject non-RUB), либо force-convert/normalize до RUB. Влияет на core продуктовую цепочку.

2. **BUG-REG-014 + BUG-REG-017** (high, multi-tab/session) — logout/session change не пропагируется между вкладками. Operator может видеть admin UI 30+ сек после понижения роли — это потенциальная privilege confusion. Фикс: BroadcastChannel + auth state subscription + RTK Query auto-invalidate.

3. **BUG-REG-001 + BUG-REG-002** (medium, network) — отсутствие HSTS и базовых security headers (X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy) на production. Дешёвый фикс через nginx, существенно поднимает security posture перед публичным запуском. Bonus: убрать Server/X-Powered-By disclosure (REG-003).

**Bonus (process)**: BUG-REG-034 — закрыть pre-commit hook'ом против plaintext secrets и встроить redaction в generator-скрипты (writeFileSync через redactor) до того, как evidence начнут регулярно коммититься. Ротация 3 apiTokens (см. рекомендации в bug).

## Evidence layout

- Bugs: `docs/regression/2026-05-17/bugs/BUG-REG-001.md … BUG-REG-034.md`
- Block checklists: `docs/regression/2026-05-17/blocks/BLOCK-01-network.md … BLOCK-12-errors-final.md`
- Per-block evidence:
  - block-01: `evidence/block-01-*.txt` (curl outputs, TLS, headers)
  - block-02: `evidence/block-02-*.{png,txt,json}` + DOM probes
  - block-03..12: `evidence/block-03/ … block-12/` (screenshots, JSON reports, run.log)
- Scripts (Playwright + helpers): `docs/regression/2026-05-17/scripts/`
- Sanity sweep (Block 12 G): `evidence/block-12/sanity-grep.txt` + `evidence/block-12/leaked-secrets-pre-fix.txt`
