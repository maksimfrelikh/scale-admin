# BUG-REG-011: Admin — silent Dashboard fallback на любой non-canonical path route

- Severity: medium
- Area: navigation, error-states
- Role: admin (мирроринг BUG-REG-008 которая была про operator)
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: Chromium 1366x768 (Playwright)
- Found: 2026-05-17 22:05
- Related known: расширяет BUG-REG-007 / BUG-REG-008 (operator) — теперь подтверждено что та же проблема под admin

## Шаги воспроизведения

1. Login `qa-admin@***.invalid`.
2. В адресной строке открыть каждый URL:
   - `https://maksimfrelikh.ru/users`
   - `https://maksimfrelikh.ru/audit-log`
   - `https://maksimfrelikh.ru/logs`
   - `https://maksimfrelikh.ru/global-logs`
   - `https://maksimfrelikh.ru/stores/new`
   - `https://maksimfrelikh.ru/stores/e73ba6bd-abb9-4596-9289-cca474fb2ec1/edit`
   - `https://maksimfrelikh.ru/this-route-does-not-exist`
   - `https://maksimfrelikh.ru/admin/something`
   - `https://maksimfrelikh.ru/api-wrong/path`
   - `https://maksimfrelikh.ru/foo/bar/baz`

## Ожидаемое

Согласно плану Block 4 §E.1: для admin "корректно работать (для admin), либо давать понятный 404. Silent fallback на Dashboard под admin — BUG-REG."

То есть один из:
- Корректная admin страница (для `/users`, `/audit-log`, `/global-logs`, `/stores/new`, `/stores/{id}/edit` — есть admin access)
- Понятная 404 страница для несуществующих маршрутов

## Фактическое

Для **ВСЕХ** перечисленных путей:
- URL остаётся точно как ввели в адресной строке (e.g., `/users`, `/foo/bar/baz`)
- Рендерится Admin Dashboard ("Fleet overview", h1 "Добро пожаловать, QA Admin")
- Никакого 404, никакого indicator что route не существует
- Bookmarkable broken URL (если bookmark `/users` ожидая Users & Access — получите dashboard)
- `/stores/new`, `/stores/{id}/edit` — admin functionality которая ДОЛЖНА работать на этих URL — не работает; вместо формы Create/Edit показывается dashboard

Эта silent fallback одинакова под admin и operator (для operator зафиксировано в BUG-REG-007 / BUG-REG-008).

## Network / Console

При входе на любой такой URL:
- `GET /api/auth/session` 200 (если залогинены)
- Никаких дополнительных запросов на конкретный ресурс — SPA не пытается достучаться до `/api/users`, `/api/logs/global`, etc.
- Console error единственный — `GET /api/auth/session 401` на самой инициализации до того как cookies подтянулись (это отдельная история, не относится к этому багу)

## Impact

- Admin не может bookmark/share direct URL для admin страниц (`/users`, `/stores/new`, `/stores/{id}/edit`).
- Любая deeplink из email/Slack/таск трекера на admin URL не работает.
- Пользователь может думать что находится на нужной странице (URL bar показывает `/users`), но видит dashboard — confusing.
- Отсутствует 404 page — нет feedback для пользователя что URL невалидный.
- Bookmarks с прошлых версий приложения могут молча перестать работать.

## Evidence

- screenshots: evidence/block-04/E-path-_users.png, E-path-_audit_log.png, E-path-_logs.png, E-path-_global_logs.png, E-path-_stores_new.png, E-path-_stores_e73ba6bd_..._edit.png, E-path-_dashboard.png, E-path-_.png, E-path-_login.png
- screenshots 404 probes: evidence/block-04/H-path-_this_route_does_not_exist.png, H-path-_admin_something.png, H-path-_api_wrong_path.png, H-path-_foo_bar_baz.png
- JSON: evidence/block-04/deep-report.json (ключи `E-path-*`), evidence/block-04/FGH-report.json (ключи `H-path-*`)

## Hypothesis

SPA использует hash-based routing (`#stores`, `#users-access`, etc.) поверх любого pathname. nginx/server отдаёт index.html для любого path. SPA не имеет catch-all React Router route для path-based URLs — игнорирует pathname полностью.

Решение либо:
1. Server: `try_files` → `/index.html` остаётся, но SPA должен распознать ожидаемые path routes (`/users`, `/dashboard`, etc.) и переключать hash-route соответствующе.
2. Server: rewrite `/users` → `/#users-access`, `/audit-log` → 404 page, etc.
3. Single canonical strategy: либо чистый hash routing (`/#users-access`) и редирект path routes на свои hash-эквиваленты, либо path routing с полноценным React Router config.

Связано с BUG-REG-012 (malformed hash тоже silently fallback) — та же первопричина.
