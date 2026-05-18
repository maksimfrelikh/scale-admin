# BLOCK-04 — Navigation / Route consistency

- Date: 2026-05-17
- Start: 21:57 CEST
- End: 22:15 CEST
- Environment: production https://maksimfrelikh.ru
- Accounts: qa-admin@***.invalid, qa-operator@***.invalid

## Цель

Маршруты приложения работают корректно, malformed URL не ломают UI, hard refresh не теряет состояние, back/forward не приводит в broken state. Закрыть Block 3 inconsistency hash vs path routes под admin.

## Контекст из Block 3

- BUG-REG-007 + BUG-REG-008: silent dashboard fallback под operator на admin-only paths.
- BUG-UX-004 FIXED (operator Global Logs показывает корректный admin-only баннер).
- Inconsistency hash vs path под operator подтверждена.

## Inventory

| Sample store (assigned to operator) | Foreign store sample | Bogus store ID | Total stores (admin) |
|---|---|---|---|
| `e73ba6bd-abb9-4596-9289-cca474fb2ec1` | `adc14d18-59b7-43f1-995f-f079c2ef0b96` (STORE-002) | `00000000-0000-0000-0000-000000000000` | 44 |

## Канонические маршруты (выявлены в этом блоке)

### Hash routes (working)
| Hash | Admin | Operator |
|---|---|---|
| `#stores` | ✅ Stores list (44) | ✅ Assigned stores (1) |
| `#products` | ✅ Product catalog | ✅ Product catalog |
| `#users-access` | ✅ Invites, roles, store-accesses | — (admin-only) |
| `#global-logs` | ✅ Global Logs | — (admin-only) |
| `#store:{uuid}` | ✅ Store detail (singular, colon) | ✅ если assigned |

### Path routes
| Path | Behaviour |
|---|---|
| `/` | OK — admin/operator dashboard |
| `/dashboard` | OK — admin/operator dashboard (URL остаётся `/dashboard`) |
| `/login` | После login URL остаётся `/login`; SPA рендерит dashboard. Все nav-клики добавляют hash → `/login#stores`, `/login#products` etc. (**BUG-REG-013**) |
| **Любой другой path** | Silent fallback на dashboard. Нет 404, нет редиректа (**BUG-REG-011**) |

### Anti-canonical (silent fallback to dashboard под обеими ролями)
- Hash typos: `#users`, `#logs`, `#audit-log`, `#audit`, `#invites`, `#dashboard`
- Hash variants: `#stores/{uuid}` (правильный — `#store:{uuid}`), `#stores/{uuid}/edit`
- Random hash: `#garbage`, `#foo`, `#!`, `#/`, `#stores/foo`, `#/stores//empty`, `#stores/00000000-...`, `#/stores/{any}/nonexistent-tab`
- Path catch-all: `/users`, `/audit-log`, `/logs`, `/global-logs`, `/stores/new`, `/stores/{id}/edit`, `/this-route-does-not-exist`, `/admin/something`, `/foo/bar/baz`

## Чек-лист и результаты (29 пунктов)

### A. Admin nav menu (через клики)
- [x] A.1 Dashboard — клик Dashboard в nav → URL остаётся (без hash), content "Fleet overview". ⚠️ URL после login сохраняет `/login` префикс (BUG-REG-013). Иначе ок.
- [x] A.2 Stores → `#stores`, h2 "Stores" ✅
- [x] A.3 Products → `#products`, h2 "Product catalog" ✅
- [x] A.4 Users & Access → `#users-access`, h2 "Invites, roles and operator stores" ✅
- [x] A.5 Logs / Global Logs → реальный URL `#global-logs`, h2 "Global Logs" ✅ (в nav это label "Global Logs")

### B. Operator nav menu (через клики)
- [x] B.1 Dashboard — в operator nav нет separate "Dashboard" entry; стартовый view = "Assigned stores" h2 = операторский dashboard. N/A pass.
- [x] B.2 Stores → `#stores`, h2 "Stores", 1 assigned store ✅
- [x] B.3 Products → `#products`, h2 "Product catalog" ✅
- [x] B.4 Users & Access — count в DOM = **0** (не disabled, отсутствует) ✅
- [x] B.5 Global Logs / Logs / Audit / Invites — count в DOM = **0** для всех ✅

### C. Store Details tabs (admin)
**Architectural note**: Store Detail page — **single-page layout**, не tabbed. Все секции стеком на одной странице (Overview header → Catalog block → Prices block → Advertising banners block → Scale Devices block → Versions/Publishing block → Logs block). Кнопки "Catalog"/"Prices"/etc. как nav tabs **отсутствуют** — есть только action-кнопки внутри секций (Refresh catalog, Create root category, Refresh banners, Register device, Refresh prices, Publish catalog, Refresh history, Refresh logs).

URL store detail: `#store:{uuid}` (e.g., `/#store:adc14d18-59b7-43f1-995f-f079c2ef0b96`) — singular `store`, colon-separator. Bookmarking `#stores/{uuid}` (естественный pattern продолжающий list) **не работает** — silent fallback на dashboard (см. BUG-REG-012).

- [x] C.1 Overview — header "Store details", метаданные (Address, Timezone, status) присутствуют сразу на лэндинге `#store:{uuid}` ✅
- [x] C.2 Catalog — секция с "Refresh catalog" / "Create root category" buttons, отдельной "Catalog" вкладки нет 🟡 (design)
- [x] C.3 Prices — секция с "Refresh prices" button ✅
- [x] C.4 Advertising — секция "Refresh banners" ✅
- [x] C.5 Scale Devices — секция "Refresh devices" / "Register device" ✅
- [x] C.6 Versions / Publishing — секции "Run validation" / "Publish catalog" / "Refresh history" ✅
- [x] C.7 Logs — секция "Refresh logs" / "Clear filters" ✅
- Network на лэндинг store detail: `GET /api/stores/{id}/catalog/categories` → 404 для STORE-002 (нет категорий), `GET /api/stores/{id}/prices` → 404 для STORE-002. Empty-data 404 vs пустой массив — отдельное возможное наблюдение, но не блокирует — данные пусты и UI ок.

### D. Malformed hash routes
- [x] D.1 `/#garbage`, `/#foo`, `/#!`, `/#/` под admin → ВСЕ silent fallback "Fleet overview" ❌ **BUG-REG-012**
- [x] D.2 `/#/stores/non-existent-uuid-12345` под admin → silent fallback ❌ **BUG-REG-012**
- [x] D.3 `/#/stores/{valid_id}/nonexistent-tab` под admin → silent fallback ❌ **BUG-REG-012**
- [x] D.4 `/#stores/foo`, `/#/stores//empty`, `/#stores/{bogus-uuid}`, `/#users/bogus`, `/#audit-log`, `/#audit` под admin → all silent fallback ❌ **BUG-REG-012**
- [x] D.5 D.1-D.3 повторить под operator (`/#garbage`, `/#foo`, `/#/`, `/#/stores/non-existent-uuid-12345`, `/#stores/foo`) → silent fallback на "Assigned stores" ❌ **BUG-REG-012**

### E. Path vs hash routes (admin)
- [x] E.1 `/users`, `/audit-log`, `/logs`, `/global-logs`, `/stores/new`, `/stores/{id}/edit` под admin → ВСЕ silent fallback "Fleet overview" ❌ **BUG-REG-011**
- [x] E.2 Сравнение hash vs path:
  - `#users` → fallback ❌ (canonical `#users-access` → works ✅) — inconsistency BUG-REG-012
  - `#global-logs` ✅ vs `/global-logs` ❌ silent fallback — BUG-REG-011/012
  - `#audit-log` → fallback ❌, `/audit-log` → fallback ❌ — нет canonical audit page

### F. Back/Forward
- [x] F.1 login → /#stores → /#stores/{uuid} → клик Catalog/Prices → Back×3:
  - Back#1: `/#stores` (h2 "Stores") ✅
  - Back#2: `/login` (h2 "Fleet overview") ✅
  - Back#3: `about:blank` — выход за пределы приложения, не баг
- [x] F.2 Данные после Back актуальные (списки рендерятся, нет stale) ✅
- [x] F.3 После logout → URL `/#`, h1 "Вход в систему" (login form) ✅. Back после logout → URL изменяется (`/#stores`), но content остаётся login form ✅. **Protected страница не восстанавливается**. ✅

### G. Hard refresh
- [x] G.1 Hard refresh на `#stores`, `#products`, `#users-access`, `#global-logs` → session preserved (cookies persistent), URL не меняется, content рендерится корректно ✅
- [x] G.2 Hard refresh на `#stores/{uuid}` → URL не меняется (`/#stores/{uuid}` тот же), content "Fleet overview" (silent fallback — это собственно `#stores/{uuid}` ≠ `#store:{uuid}`, см. BUG-REG-012). Hard refresh **не** усугубляет; просто не оживляет broken route.

### H. 404 fallback
- [x] H.1 `/this-route-does-not-exist`, `/admin/something`, `/api-wrong/path`, `/foo/bar/baz` под admin → ВСЕ silent fallback "Fleet overview", **404 page отсутствует** ❌ **BUG-REG-011**
- [x] H.2 Direct `/api/auth/session` в адресной строке → **200 JSON** (browser cookies → authed). Content-Type: `application/json; charset=utf-8`. Body: `{"session":{"id":"0e0561e0-...","createdAt":"2026-05-17T20:10:25.293Z",...},"user":{"id":"4df893ce-..."}}`. **Не редирект на login** ✅ (под user expectation 401 — но при наличии активной session 200 норма; ответ JSON, не HTML).

### I. Known bugs verification
- [x] I.1 **BUG-UX-002** (malformed hash routes broken panels) — **REPRODUCES** (BUG-REG-012). Конкретные URLs воспроизводящие баг — см. BUG-REG-012 (10+ permutations, оба роли).

## Bugs filed in this block

| ID | Severity | Title |
|---|---|---|
| BUG-REG-011 | medium | Admin — silent Dashboard fallback на любой non-canonical path route (расширяет BUG-REG-008 — теперь подтверждено что та же проблема под admin) |
| BUG-REG-012 | medium | Malformed/unknown hash routes → silent Dashboard fallback (**BUG-UX-002 reproduces**) — includes store detail `#stores/{uuid}` not working (canonical `#store:{uuid}`) |
| BUG-REG-013 | low | Post-login URL остаётся `/login`, hash navigation building на /login префикс |

## Notes / Observations

### Root-cause hypothesis (объединяющая)
Hash router в SPA не имеет default/catch-all с 404 component → unknown hashes → дефолтный dashboard. nginx `try_files` → `/index.html` для любого path → SPA игнорирует pathname → дефолтный dashboard. Решение: либо catch-all в client router с 404 panel, либо server-side 404 для non-canonical paths и явный path-to-hash mapping в SPA bootstrap.

### Store detail URL inconsistency
- list: `#stores` (plural)
- detail: `#store:{uuid}` (singular + colon, не slash)
- естественный pattern (как у RESTful URLs) `#stores/{uuid}` — НЕ работает
- Это main inconsistency которая ловит руками разработчиков и пользователей при copy/paste URL

### Под operator
- B.4/B.5 — admin items не в DOM, не просто hidden. ✅
- D.5 — malformed hashes → operator dashboard (вместо admin) — те же fallback правила, разные дефолтные view (admin = Fleet overview, operator = Assigned stores).

### Поведение которое работает корректно
- Back/Forward через history ✅
- Hard refresh: session preserved, content rendered ✅
- Logout: protected page не восстанавливается даже через Back ✅
- `/api/auth/session` direct: JSON response, не HTML redirect ✅

### Что хорошо бы посмотреть отдельно
- 404 endpoint paths (`/api/stores/{id}/catalog/categories` 404 vs пустой массив для empty store) — возможно UI-баг что пустые секции спамят 404 в Network — обсудить с manager-ом.

## Exit criteria

- [x] 29 пунктов пройдены или зафейлены (29/29 с подробностями выше)
- [x] BLOCK-04-nav.md заполнен
- [x] Bugs filed: BUG-REG-011, 012, 013
- [x] Скриншоты broken states (40+ PNG в evidence/block-04)
- [x] Таблица URL → ожидание → факт (см. секции "Канонические маршруты" + чек-лист)
- [x] Heartbeat manager-у — Telegram сообщение по шаблону
