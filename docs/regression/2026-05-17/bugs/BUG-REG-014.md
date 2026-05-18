# BUG-REG-014: Logout in one tab does not propagate to other tabs (no broadcast)

- Severity: high
- Area: auth, cache, rbac
- Role: both (admin, operator)
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: Chromium 1366x768 (Playwright), same browser context, two pages (вкладки)
- Found: 2026-05-17 22:28
- Related known: BUG-UX-001, TASK-048/049/050

## Шаги воспроизведения

1. В одном Chromium браузере открыть две вкладки (общая cookie jar и localStorage).
2. Вкладка A: залогиниться `qa-admin@***.invalid`. Перейти на `#stores`.
3. Вкладка B: открыть `/dashboard`. Под admin сессией показывается главная панель.
4. Вкладка A: вызвать logout (POST /api/auth/logout, либо клик "Logout").
5. Вкладка B: не делать ничего 60 секунд. Наблюдать состояние.

## Ожидаемое

- В течение разумного времени (≤30 сек) Вкладка B должна либо перейти на экран Login, либо отобразить баннер "Session ended", либо иным образом показать пользователю, что сессия закончилась.
- Подразумевалось через BroadcastChannel (TASK-050) или storage event listener (TASK-049) или короткий polling /api/auth/session (TASK-048).

## Фактическое

- Вкладка B остаётся в admin UI: URL `#store:{uuid}`, h1 "Добро пожаловать, QA Admin", навигация admin (Users & Access, Global Logs, Create store).
- Server возвращает 401 на `GET /api/auth/session` при первом запросе из Вкладки B сразу после logout в A, но клиент Вкладки B этот сигнал не использует и UI не перерисовывает.
- Состояние "stale admin Dashboard поверх неавторизованной сессии" висит как минимум 60 сек (поллили 12×5 сек, всё время bH1 = "Добро пожаловать, QA Admin", session=401).
- Storage event listener в Вкладке B на `window.addEventListener('storage', …)` ни одного события не получил.
- BroadcastChannel подписки на каналы `auth`, `session`, `app`, `scale-admin`, `logout`, `rtk-query`, `cache`, `main` — ни одного сообщения не приняли (повторно проверено в round 2 после фикса теста).

## Network / Console

```
GET /api/auth/session  401   (Tab B, через 5 сек после Tab A logout)
GET /api/auth/session  401   (Tab B, +10 сек)
… повторяется 12 раз за 60 сек — UI Tab B не реагирует
```

После того как пользователь сам кликает по nav-ссылке Stores в Вкладке B:

```
GET /api/stores      401
```

UI Вкладки B мгновенно переходит на форму Login. То есть UX-починка стучит только когда пользователь сам что-то нажмёт — это и есть фактический workaround.

## Evidence

- screenshots: `evidence/block-05/A2-A-after-logout.png`, `A2-B-after-60s.png`, `A3-B-after-stores-click.png`, `E_fixed-B-after-logout.png`
- scripts:
  - `scripts/block-05-multitab.cjs` — основной сценарий A
  - `scripts/block-05-multitab-2.cjs` — round 2 с правильным таймингом установки listener
- raw: `evidence/block-05/run.log`, `evidence/block-05/run-round2.log`
- json: `evidence/block-05/report.json` (поля `sections.A.A2_B_poll_60s` и `sections.E.E4_storage_events_during_logout`, `E5_broadcast_channel_events_during_logout`)

## Hypothesis (необязательно)

Фронтенд не подписан на storage event и не использует BroadcastChannel для синхронизации auth-состояния. localStorage и sessionStorage пустые (никаких auth-related ключей), IndexedDB.databases() возвращает пустой массив. Единственный канал передачи auth-состояния — HttpOnly cookie + опрос /api/auth/session, но клиент Вкладки B не опрашивает /api/auth/session самостоятельно (по крайней мере в течение 60 сек после logout в Вкладке A). RTK Query не делает refetchOnFocus или интервальный poll на /api/auth/session.

Любой из трёх запланированных подходов (BUG-UX-001 решение через BroadcastChannel / storage event / polling) был бы достаточным.
