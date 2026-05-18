# BUG-REG-008: operator silent Dashboard fallback на множестве admin-only и foreign-store URL

- Severity: low
- Area: rbac, navigation, error-states
- Role: operator
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: Chrome headless 1366x768
- Found: 2026-05-17 21:30
- Related known: расширяет BUG-REG-007 (только `/users`) и BUG-UX-005 (admin-only форма)

## Шаги воспроизведения

1. Залогиниться под `qa-operator@***.invalid`.
2. Открыть каждый из URL ниже (direct URL bar, не через нав):
   - `/users` (BUG-REG-007 базовый кейс)
   - `/users/new`
   - `/invites`
   - `/audit-log`
   - `/logs`
   - `/stores/new`
   - `/stores/{assigned_id}/edit`
   - `/stores/{foreign_id}` (где foreign = магазин не из assigned)
   - `/stores/{foreign_id}/edit`
   - `/dashboard#invites`
   - `/dashboard#audit-log`
3. Наблюдать что рендерится.

## Ожидаемое

Для каждого admin-only URL operator должен видеть один из:
- редирект на `/dashboard` (с обновлением URL bar)
- explicit "Access denied" / "X is admin-only" message
Поведение должно быть консистентно по всем admin-only маршрутам.

Для foreign-store URL — explicit "Store access denied" или редирект на собственную list.

## Фактическое

URL bar остаётся на admin/foreign-store пути, в `<h1>` — `Добро пожаловать, QA Operator`, в `<h2>` — `Assigned stores`. Контент — operator dashboard. Никакого баннера/тоста/редиректа. Bookmarkable broken URL.

Особая непоследовательность: **/dashboard#global-logs и /dashboard#users-access ПРАВИЛЬНО показывают** `h2: "Global Logs is admin-only"` и `h2: "Users & Access is admin-only"`. То есть SPA умеет показывать корректный denial, но только для 2 хешей. Остальные admin-only пути падают в silent fallback.

## Network / Console

`/users`, `/users/new`, `/invites`, `/audit-log`, `/logs`, `/stores/new`, `/stores/{any}/edit`, `/stores/{foreign}`: **никаких** `/api/*` запросов на эти "ресурсы" — SPA даже не пробует достучаться. Просто рендерит дефолтный operator dashboard. Backend RBAC всё ещё корректно работает на самих API endpoints (см. блок C/D).

`/dashboard#global-logs` (PASS-кейс): идёт `/api/auth/session 200` + `/api/auth/csrf 200`, рендерится явный admin-only баннер.

## Evidence

- screenshots: evidence/block-03/H-operator__users.png, ...users_new.png, ...invites.png, ...audit-log.png, ...logs.png, ...stores_new.png, ...stores_e73ba6bd...e1_edit.png, ...stores_adc14d18...96_edit.png, ...adc14d18...96.png
- JSON: evidence/block-03/ui-report.json (operator UI walk), evidence/block-03/H-operator-hash-routes.json (hash comparison)
- screenshots hash routes: evidence/block-03/H-operator-hash-global-logs.png, ...users-access.png, ...audit-log.png, ...invites.png

## Hypothesis

В operator SPA `App.tsx`/router маршруты `#global-logs` и `#users-access` имеют явные `<AdminOnlyGuard>` components с текстом denial, а direct-URL пути типа `/users`, `/audit-log`, `/stores/:id/edit` либо не зарегистрированы (404 в client router → SPA-index fallback → operator dashboard), либо guarded без denial UI. Унификация (один `<AdminOnlyOrForeignStoreGate>` для всех admin paths) сняла бы рассинхрон.
