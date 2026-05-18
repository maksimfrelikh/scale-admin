# BUG-REG-017: При смене сессии (admin → operator) в другой вкладке Вкладка A продолжает показывать admin UI 30+ сек

- Severity: high
- Area: auth, rbac, cache
- Role: admin (затронут в первой вкладке)
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: Chromium 1366x768 (Playwright), один контекст, две вкладки
- Found: 2026-05-17 22:33
- Related known: связан с BUG-UX-001 (no broadcast). Это другая разновидность того же общего root cause, но с другим UX impact.

## Шаги воспроизведения

1. Один Chromium контекст, две вкладки. Cookie jar и localStorage общие.
2. Вкладка A: залогиниться `qa-admin@***.invalid`. Открыть Store Detail любого магазина: `#store:{uuid}`. Видны admin-only элементы: nav "Users & Access", "Global Logs", "Create store"; на Store Detail кнопки "Edit store", "Refresh catalog", "Refresh banners", "Refresh devices", "Refresh prices", "Run validation".
3. Вкладка B (в этом же браузере): через прямой POST /api/auth/login залогиниться `qa-operator@***.invalid` — это перезаписывает `scale_admin_session` cookie на operator сессию. Reload Вкладки B — она показывает operator dashboard, "Active session for qa-operator@***.invalid · role: operator".
4. Вкладка A: ничего не делать 30 секунд. Наблюдать.

## Ожидаемое

- Вкладка A в течение ≤30 сек должна обнаружить смену сессии (через broadcast, polling /api/auth/session, или refetchOnFocus при возврате фокуса) и либо переходить в operator UI, либо показать баннер "Your session changed in another tab — please refresh".

## Фактическое

- Вкладка A 30 секунд (6 поллингов × 5 сек) продолжает показывать admin UI:
  - h1 "Добро пожаловать, QA Admin"
  - "Active session for qa-admin@***.invalid · role: admin"
  - nav: Logout, Overview, Stores, Products, Create store, Global Logs, Users & Access
  - Store Detail buttons: Edit store, Refresh catalog, Refresh banners, Refresh devices, Refresh prices, Run validation
- Но server подтверждает: `GET /api/auth/session` возвращает `role: operator`, `email: qa-operator@***.invalid` (за весь этот период).
- Когда пользователь Вкладки A кликает по admin-ссылке "Users & Access":
  - URL меняется на `#users-access`
  - UI рендерит admin layout, секцию "Invites, roles and operator stores", admin nav остаётся
  - API запрос `GET /api/users` → **403 Forbidden**
  - UI 403 НЕ обрабатывает: нет toast-уведомления, нет редиректа, нет переключения на operator-режим. Просто пустая (или частично пустая) секция Users & Access поверх admin layout.

## Network / Console

```
20:32:43 Tab B  POST /api/auth/login (operator)              200
20:32:44 Tab B  GET  /api/auth/session  → role:operator      200
20:32:51..20:33:16  Tab A (6 опросов) /api/auth/session → role:operator каждый раз
                    Tab A UI остаётся admin (h1 admin, navItems admin)
20:33:16  Tab A click Users & Access → GET /api/users         403
                    UI: остаётся в admin рендере, без обработки 403
```

## UX последствия

- Пользователь в Вкладке A не знает, что его роль сменилась — может пытаться выполнять admin действия. Все state-changing запросы (POST/PATCH/DELETE) под admin endpoint будут падать с 403 (что хорошо со стороны безопасности), но UX покажет либо тишину, либо непонятную ошибку.
- Если admin сменяет своё рабочее окружение на operator (например, login from another device) — Вкладка A на admin машине превращается в "ghost admin" с активной UI до перезагрузки.
- В тестовых сценариях это легко вызвать; в реальной жизни менее частый сценарий, но симметричное логично-возможное состояние: operator → admin тоже потенциально проблема.

## Evidence

- screenshots: `evidence/block-05/B-A-after-30s-no-action.png`, `B-B-operator-view.png`, `B-A-after-admin-link.png`
- script: `scripts/block-05-multitab-2.cjs` (секция B)
- report: `evidence/block-05/report-round2.json` → `B.B2_A_poll_30s`, `B.B3_A_admin_link_state`, `B.B3_A_recent_api`

## Hypothesis (необязательно)

Same root cause как BUG-REG-014 / BUG-UX-001: фронтенд не подписан на смену сессии. Любой из broadcast/polling/storage-event подходов закрывает оба бага одновременно. Дополнительно — клиент не имеет глобального обработчика 403 на API ответах: получив 403, надо как минимум подсунуть refetch `/api/auth/session` и пересмотреть UI исходя из реальной роли.
