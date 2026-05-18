# BUG-REG-007: Operator на direct `/users` URL получает Dashboard вместо отказа/редиректа

- Severity: low
- Area: rbac
- Role: operator
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: Chromium 1920x1080 (Playwright)
- Found: 2026-05-17 21:05
- Related known: —

## Шаги воспроизведения

1. Login operator (QA credentials per AGENTS.md §2).
2. Открыть напрямую https://maksimfrelikh.ru/users (вписать в адресную строку).

## Ожидаемое

Согласно AGENTS.md / плану BLOCK-02 §H.2:
> Под operator открыть `/users` напрямую → отказ или редирект (не silent admin UI).

То есть один из:
- Редирект на `/dashboard` (URL очищается)
- Страница 403 Forbidden / "Access denied"

## Фактическое

- URL остаётся `https://maksimfrelikh.ru/users` после загрузки.
- В содержимом — обычный operator dashboard: заголовки "Добро пожаловать, QA Operator", "Assigned stores", кнопка "Refresh stores", "Open catalog". Никаких admin элементов (Users & Access, list пользователей, role column) нет.
- Никакого явного индикатора "у вас нет доступа" нет.

Playwright observation:
```json
{
  "url": "https://maksimfrelikh.ru/users",
  "showsAdminUI": false,
  "hasUserManagementHeading": false,
  "hasRoleColumn": false,
  "hasInviteButton": false,
  "hasDashboardHeading": true,
  "h1h2": ["Добро пожаловать, QA Operator", "Assigned stores"]
}
```

## Impact

- Не уязвимость (никакие admin-данные не утекают, API на `/api/users` отдаёт 403 для operator — проверено отдельно)
- Но UX confusing: пользователь думает что он на странице /users но видит дашборд
- При bookmark на /users → каждый раз попадание на dashboard без объяснения
- Может ввести в заблуждение во время отладки/багрепортов

## Network / Console

API запросы при заходе на /users — operator GET /api/users (если вызывается из SPA) вернул бы 403, но фронт даже не пытается — рендерит default route fallback.

## Evidence

- evidence/block-02-H2-operator-users-direct.png
- evidence/block-02-round2-report.json → `results["H.2"]`, `reports.operatorOnUsersDirect`
- Подтверждение API защиты: evidence/block-02-B3-login-operator.txt → `GET /api/users -> HTTP 403 "Insufficient role"`

## Hypothesis (опционально)

В React Router (или аналоге) route `/users` либо не задан явно для operator, либо guard просто пропускает рендеринг компонента и показывает default. Решение: либо явный 403 page для не-admin, либо `<Navigate to="/dashboard" replace />`. Поведение должно быть консистентно с тем, как обрабатывается direct `/logs` (тоже admin-only) — это тоже надо проверить.
