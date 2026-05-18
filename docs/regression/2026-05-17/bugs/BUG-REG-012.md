# BUG-REG-012: Malformed/unknown hash routes → silent Dashboard fallback (BUG-UX-002 reproduces)

- Severity: medium
- Area: navigation, error-states
- Role: both (admin, operator)
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: Chromium 1366x768 (Playwright)
- Found: 2026-05-17 22:08
- Related known: **BUG-UX-002** (malformed hash routes broken panels) — REPRODUCED

## Шаги воспроизведения

1. Login (admin or operator).
2. В адресной строке открыть каждый URL:
   - `https://maksimfrelikh.ru/#garbage`
   - `https://maksimfrelikh.ru/#foo`
   - `https://maksimfrelikh.ru/#!`
   - `https://maksimfrelikh.ru/#/` (пустой path после слеша)
   - `https://maksimfrelikh.ru/#/stores/non-existent-uuid-12345`
   - `https://maksimfrelikh.ru/#/stores/e73ba6bd-abb9-4596-9289-cca474fb2ec1/nonexistent-tab`
   - `https://maksimfrelikh.ru/#stores/foo` (без leading slash)
   - `https://maksimfrelikh.ru/#/stores//empty`
   - `https://maksimfrelikh.ru/#stores/00000000-0000-0000-0000-000000000000` (UUID но bogus)
   - `https://maksimfrelikh.ru/#users/bogus`
   - `https://maksimfrelikh.ru/#audit-log`
   - `https://maksimfrelikh.ru/#audit`
   - `https://maksimfrelikh.ru/#logs`
   - `https://maksimfrelikh.ru/#users` (singular — отличается от canonical `#users-access`)

## Ожидаемое

Согласно плану Block 4 §D / BUG-UX-002:
> graceful 404 page или редирект на Dashboard с явным indicator, **не broken UI и не silent fallback**.

Минимально: либо "Page not found" / "Unknown section" банер, либо очистка hash до `/` с дефолтным dashboard. Текущий silent fallback оставляет broken URL в bar.

## Фактическое

Для **ВСЕХ** malformed hashes:
- URL остаётся точно как ввели (e.g., `/#garbage`, `/#stores/00000000-...`)
- Рендерится Dashboard (admin: "Fleet overview", operator: "Assigned stores")
- Никакого indicator что hash route невалидный
- Bookmarkable broken URL
- Hash route `#users` (singular) → fallback (хотя `#users-access` работает)
- Hash route `#logs` → fallback (хотя `#global-logs` работает)
- Hash route `#audit-log`, `#audit` → fallback (страницы аудита нет в SPA вообще; только Global Logs)

**Отдельная находка**: store detail page имеет нестандартный hash формат **`#store:{uuid}`** (singular, colon-separator), а не `#stores/{uuid}` или `#/stores/{uuid}`. Любые внешние ссылки в виде `#stores/{uuid}` или `#/stores/{uuid}` приводят к silent fallback на dashboard — это отдельная боль для deeplinking.

Под operator та же картина: все 5 malformed hashes показывают "Assigned stores" вместо понятного отказа/404.

## Network / Console

Никаких запросов на `/api/*` при заходе на malformed hash — SPA даже не пытается. Сразу рендерится дефолтная dashboard.

## Impact

- BUG-UX-002 не исправлен. Класс багов остаётся.
- Email/Slack/таск-трекер deeplinks могут молча перестать работать после релизов которые меняют canonical hash routes.
- При copy-paste URL с typo (e.g., `#user-access` вместо `#users-access`, `#logs` вместо `#global-logs`) — пользователь не узнает что hash typo.
- Bookmarks с прошлых versions приложения молча сломаются.
- Особенно болезненно для store detail: `#stores/{uuid}` (натуральный pattern, продолжающий list URL `#stores`) — не работает. Реальный URL `#store:{uuid}` неинтуитивен.

## Evidence

- Admin: evidence/block-04/D-_garbage.png, D-_foo.png, D-_.png, D-_stores_non_existent_uuid_12345.png, D-_stores_e73ba6bd_..._nonexistent_tab.png, D-_stores_foo.png, D-_stores_empty.png, D-_stores_00000000....png, D-_users_bogus.png, D-_audit_log.png, D-_audit.png
- Operator: evidence/block-04/D5-op-_garbage.png, D5-op-_foo.png, D5-op-_.png, D5-op-_stores_non_existent_uuid_12345.png, D5-op-_stores_foo.png
- Hash vs path: evidence/block-04/E-hash-_users.png (fallback), E-hash-_users_access.png (works), E-hash-_global_logs.png (works), E-hash-_logs.png (fallback), E-hash-_audit_log.png (fallback)
- Store hash format: evidence/block-04/C0-after-details.png (URL=`#store:adc14d18-...`), F2-store-detail.png (URL=`#stores/{uuid}` — shows dashboard)
- JSON: evidence/block-04/deep-report.json (ключи `D-*`, `E-hash-*`), evidence/block-04/FGH-report.json (ключи `D5-op-*`, `backFwdSteps`)

## Canonical hash routes (выявленные)

Working hash routes (admin):
- `#stores` — Stores list
- `#products` — Product catalog
- `#users-access` — Users & Access (admin-only)
- `#global-logs` — Global Logs (admin-only)
- `#store:{uuid}` — Store detail (специфичный singular+colon)

Working hash routes (operator):
- `#stores` — Assigned stores list
- `#products` — Product catalog
- `#store:{uuid}` — Store detail (если assigned, иначе fallback)

Не существуют (silent fallback): `#dashboard`, `#users`, `#logs`, `#audit-log`, `#audit`, `#invites`, `#stores/{uuid}`, `#stores/{id}/edit`, и любые другие.

## Hypothesis

В hash router нет default/catch-all route с 404 component. Любой unknown hash приводит к рендерингу default panel (Dashboard). Решение: добавить `<Route path="*" element={<NotFoundPanel />}/>` или эквивалент в hash router config; обработать typo-friendly aliases (`/#users` → `/#users-access`, `/#logs` → `/#global-logs`) либо явный 404.

Также desirable: унифицировать store detail URL pattern — заменить `#store:{uuid}` на `#stores/{uuid}` (consistent с list).

Связано с BUG-REG-011 (path routes тоже silently fallback) — та же корневая проблема.
