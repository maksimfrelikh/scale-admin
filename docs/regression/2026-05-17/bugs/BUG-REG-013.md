# BUG-REG-013: Post-login URL остаётся `/login`, hash navigation building на /login префикс

- Severity: low
- Area: auth, navigation
- Role: both (admin, operator)
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: Chromium 1366x768 (Playwright)
- Found: 2026-05-17 22:00
- Related known: —

## Шаги воспроизведения

1. Открыть https://maksimfrelikh.ru/login
2. Залогиниться (admin или operator credentials).
3. Подождать загрузку Dashboard.
4. Посмотреть на URL в адресной строке.
5. Кликнуть Stores в навигации.
6. Посмотреть на URL.

## Ожидаемое

После успешного login клиент должен `history.replaceState` или `navigate` на canonical URL (`/`, `/dashboard`, или `/#`). URL `/login` после авторизации некорректен.

## Фактическое

- После successful POST `/api/auth/login` URL остаётся **`https://maksimfrelikh.ru/login`** (h2 = "Fleet overview" — это уже admin dashboard).
- Клик "Stores" в навигации → URL становится **`/login#stores`** (hash добавляется к login префиксу).
- Клик "Products" → **`/login#products`**.
- Клик "Users & Access" → **`/login#users-access`**.
- Клик "Global Logs" → **`/login#global-logs`**.

То же поведение под operator: `/login#stores`, `/login#products` после клика nav.

При прямом заходе на `/` или `/dashboard` (без редиректа через /login) URL остаётся правильный (`/`, `/dashboard`). Проблема только при login flow.

## Impact

- Bookmark с URL `/login#stores` будет валидным когда залогинены (URL хоть какой принимается, см. BUG-REG-011), но визуально путанный.
- Share URL коллегам в виде `/login#users-access` выглядит как ссылка на login, а не на админ-секцию.
- При copy URL из address bar после клика — попадает `/login#...` вместо чистого `/#...` или `/users-access`.
- Не уязвимость и не блокер, но UX hygiene issue.
- Возможный риск: если в будущем будет роутинг по pathname и `/login` начнёт строго редиректить на login form при наличии session, такие bookmarks сломаются.

## Network / Console

Никаких 4xx/5xx. POST `/api/auth/login` → 200 (с set-cookie). После этого SPA рендерит dashboard, но `history.replaceState`/`pushState` на `/` не вызывается. URL остаётся `/login`.

## Evidence

- evidence/block-04/A0-admin-after-login.png — URL `https://maksimfrelikh.ru/login`, content admin dashboard
- evidence/block-04/B0-operator-after-login.png — URL `https://maksimfrelikh.ru/login`, content operator dashboard
- evidence/block-04/A-admin-Stores.png — URL `/login#stores`
- evidence/block-04/A-admin-Products.png — URL `/login#products`
- evidence/block-04/A-admin-Users_Access.png — URL `/login#users-access`
- evidence/block-04/A-admin-Global_Logs.png — URL `/login#global-logs`
- JSON: evidence/block-04/ABC-report.json (ключи `A-*`, `B-*`)

## Hypothesis

После `POST /api/auth/login → 200` SPA просто рендерит Dashboard component без вызова `history.replaceState({}, '', '/')`. Fix — одна строка в login success handler:
```js
window.history.replaceState({}, '', '/');
// или router.navigate('/', { replace: true });
```
