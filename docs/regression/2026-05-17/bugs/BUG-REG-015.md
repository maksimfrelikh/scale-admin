# BUG-REG-015: Stores list не auto-refresh между вкладками после mutation в другой вкладке

- Severity: medium
- Area: cache, navigation
- Role: admin
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: Chromium 1366x768 (Playwright), один контекст, две вкладки
- Found: 2026-05-17 22:27
- Related known: BUG-UX-011, TASK-051

## Шаги воспроизведения

1. В одном Chromium браузере открыть две вкладки.
2. Обе вкладки залогинены `qa-admin@***.invalid`.
3. Обе вкладки на `https://maksimfrelikh.ru/#stores`. Подождать рендер списка магазинов (видно 44 шт).
4. Вкладка A: создать магазин с именем `QA-MULTITAB-001` (POST /api/stores → 201).
5. Вкладка B: НЕ refresh-ить страницу. Подождать 30 секунд, наблюдать список.

## Ожидаемое

- Желаемо: в Вкладке B новый магазин `QA-MULTITAB-001` появляется автоматически (RTK Query invalidation с broadcast, polling, или refetchOnFocus при фокусе вкладки).
- Допустимо (минимум): рядом со списком виден явный индикатор "Данные могут быть устаревшими, нажмите для обновления".

## Фактическое

- 6 поллингов по 5 сек (всего 30 сек) — `QA-MULTITAB-001` ни разу не появился в Вкладке B.
- Никакого визуального индикатора stale-состояния тоже нет — список выглядит так же, как до создания.
- После hard refresh (`Ctrl+Shift+R`) в Вкладке B — магазин появляется (sanity: backend данные корректны, проблема только в client-side кэше).

## Network / Console

```
Tab B GET /api/stores  (initial)   200  n=44
Tab A POST /api/stores             201  id=fa402ca3-4ff7-4c0f-b33e-e259b91adf3f  name=QA-MULTITAB-001
Tab B (30 сек без действий)         — ни одного запроса к /api/stores из Tab B
Tab B reload                       GET /api/stores  200  n=45
```

То есть RTK Query (или эквивалент) не делает refetch ни по invalidation tag (другая Redux-store изоляция), ни по таймеру, ни по visibility-change.

## Evidence

- screenshots: `evidence/block-05/C1-A-stores.png`, `C1-B-stores.png`, `C3-B-after-30s-no-refresh.png`, `C4-B-after-reload.png`
- scripts: `scripts/block-05-multitab.cjs` (секция C)
- raw: `evidence/block-05/run.log`, поле `sections.C.C3_B_poll_30s_without_refresh` в `report.json`

## Hypothesis (необязательно)

Same root cause как BUG-UX-011: RTK Query кэш живёт в Redux store одной вкладки и не транслируется. Решение — либо BroadcastChannel для invalidation tags, либо `refetchOnWindowFocus`, либо явный `pollingInterval` на listStores endpoint.

Затрагивает также Catalog/Categories в Store Detail (см. BUG-REG-016 если завершится round 2) и потенциально все list-эндпоинты под admin.
