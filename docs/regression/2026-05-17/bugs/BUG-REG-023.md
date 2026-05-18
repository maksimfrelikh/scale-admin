# BUG-REG-023: Price поле принимает огромные значения (999999999999, 1e10) — нет верхнего лимита

- Severity: medium
- Area: forms / api / prices
- Role: admin + operator (storeAccess)
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: Chromium (Playwright) + curl
- Found: 2026-05-17 23:14
- Related known: —

## Шаги воспроизведения

UI:
1. Авторизоваться, открыть store-detail с placement-ом (например `/dashboard#store:e73ba6bd-...`).
2. В inline price input набрать `999999999999` (12 цифр) или `1e10`.
3. Enter / Save.

API:
```
PUT /api/stores/{storeId}/prices/{placementId}
{"price":999999999999,"currency":"RUB"}
```

## Ожидаемое

- 400 с верхним пределом ("Price must be ≤ 1000000.00" или эквивалент).
- UI input с атрибутом `max` (HTML5).
- Или хотя бы Pg numeric overflow → 500 (нет, это тоже плохо, нужно 400).

## Фактическое

- HTML5 `input[type=number]` с `min="0.01" step="0.01"` ограничивает только минимум и шаг, **нет `max`**.
- Backend принимает `999999999999` → возвращает 200 (по логам PUT body `{"price":999999999999,"currency":"RUB"}`).
- `1e10` → JS приводит к `10000000000` → принимается.

## Impact

- В выгрузке прайс-листов / опубликованных каталогах число такого размера может:
  - Переполнить int4 (если БД использует int), сломать sync на весы.
  - Сломать форматирование (`1e10` в Intl.NumberFormat = `10,000,000,000` → ломает layout).
  - В fiscal printer / scale firmware вызвать overflow / undefined behavior.
- Сценарий: operator кликает мимо клавиатуры, вводит лишний ноль — устраивает «акцию миллиардеру» в проде.

## Evidence

- `evidence/block-06/ui-report.json` → `H.bad_values["999999999999"]`, `H.bad_values["1e10"]`
- API уровень: тот же ответ `{"price":999999999999,"currency":"RUB"}` принимается без жалоб.

## Hypothesis

Серверная валидация цены: проверяется только тип (number) и положительность (`>= 0.01`). Нужно добавить `max` (например 100_000.00 для розничной цены) и в БД хранить как `numeric(10,2)` с CHECK constraint.

UI: добавить `max` на input и подсветку ошибки.
