# BUG-REG-016: Store Detail Catalog — категория, созданная в одной вкладке, не появляется в другой 30 сек

- Severity: medium
- Area: cache, catalog
- Role: admin
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: Chromium 1366x768 (Playwright), один контекст, две вкладки
- Found: 2026-05-17 22:32
- Related known: BUG-UX-012, TASK-052

## Шаги воспроизведения

1. В одном Chromium открыть две вкладки.
2. Обе залогинены `qa-admin@***.invalid`.
3. Создать тестовый магазин (например `QA-MTAB-D-001`) — у нового магазина авто-создаётся active main catalog.
4. Обе вкладки навигировать на `https://maksimfrelikh.ru/#store:{новый-store-uuid}` (Store Detail).
5. Вкладка A: создать категорию `QA-MTAB-CAT-001` в каталоге (POST /api/stores/{sid}/catalog/categories → 201).
6. Вкладка B: НЕ refresh-ить, наблюдать страницу 30 секунд.

## Ожидаемое

- Категория `QA-MTAB-CAT-001` появляется в Каталоге Вкладки B автоматически (≤30 сек), либо хотя бы виден индикатор stale.

## Фактическое

- 6 поллингов × 5 сек = 30 сек: категория ни разу не появилась в Вкладке B (D3 все `seenInB: false`).
- После hard refresh во Вкладке B — категория появляется (D4: true). То есть кэш только на клиенте, backend данные корректны.
- Также при первом запуске на старом магазине без active mainCatalog API вернул 404 "Active store catalog not found" — отдельная заметка, см. Notes.

## Network / Console

```
Tab A POST /api/stores/{sid}/catalog/categories  201
Tab B (30 сек idle)  — ни одного запроса к /api/stores/{sid}/catalog/categories из Tab B
Tab B reload         GET /api/stores/{sid}/catalog/categories  200  содержит QA-MTAB-CAT-001
```

## Evidence

- screenshots: `evidence/block-05/D_fixed-A-store-detail.png`, `D_fixed-B-store-detail.png`, `D_fixed-B-after-30s.png`, `D_fixed-B-after-reload.png`
- scripts: `scripts/block-05-multitab-2.cjs` (D_fixed)
- report: `evidence/block-05/report-round2.json` → `D_fixed.D3_B_poll_30s_without_refresh`, `D_fixed.D4_B_after_reload_has_category`

## Notes

При первой попытке (round 1) тест был запущен на магазине `adc14d18-59b7-43f1-995f-f079c2ef0b96` ("Manager Verify Store 002") — у которого нет active mainCatalog (POST /api/stores/{sid}/catalog/categories возвращает 404 "Active store catalog not found"). Стоит отдельно посмотреть на legacy магазины: либо чинить миграцию (бэкфиллить main catalog), либо корректно обрабатывать в UI/API. Это нюанс не для текущего бага, но достоин tracking.

## Hypothesis (необязательно)

Same root cause как BUG-REG-015: RTK Query инвалидация работает только в пределах одной Redux store. Нужен либо BroadcastChannel, либо polling, либо refetchOnFocus.
