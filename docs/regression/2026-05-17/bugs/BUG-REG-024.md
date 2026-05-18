# BUG-REG-024: Price inline edit — ESC не откатывает изменение, click-outside не сохраняет

- Severity: low
- Area: forms / prices / ux
- Role: admin + operator
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: Chromium 1366x900 (Playwright)
- Found: 2026-05-17 23:15
- Related known: —

## Шаги воспроизведения

UI на store-detail с placement-ом:
1. Открыть store-detail, выбрать price input (`<input type="number" placeholder="0.00" aria-label="Price for ...">`).
2. Зафиксировать текущее значение (например `66.66`).
3. Очистить поле, ввести `77.77`.
4. Нажать **ESC**.
5. Наблюдать значение поля.
6. Повторить: ввести `55.55`, кликнуть в любое место вне inputа (например h2 заголовок).

## Ожидаемое (стандартный inline-edit UX)

- **ESC** → отмена, поле возвращается к исходному `66.66`. Никакого HTTP запроса.
- **Click outside / blur** → одно из: автосейв (с PUT) или отмена. Третий путь — pending state (dirty marker) с понятным индикатором.

## Фактическое

| Действие | Значение after | HTTP fired |
|---|---|---|
| Ввести `77.77` + ESC | `77.77` (не откатилось) | 0 |
| Ввести `55.55` + click outside | `55.55` (dirty, не отправлено) | 0 |
| Ввести значение + Enter | значение | PUT отправлен ✅ |
| Save All (button) | значение | PUT отправлен ✅ |

То есть:
- ESC — **no-op** (значение остаётся изменённым).
- Click outside — dirty value сохраняется в UI state, но не отправляется на сервер.

## Impact

- Operator думает, что ESC откатил изменение, переключается на другое поле — на самом деле dirty value висит, и при следующем "Save All" улетит непреднамеренное значение.
- Никакого visible dirty-indicator на input нет (по евиденции — input не подсвечивается, не отображается badge `*`).

## Evidence

- `evidence/block-06/ui-report.json` → `H.escape`, `H.click_outside`, `H.enter`
  ```json
  "escape": {"after": "77.77"},
  "click_outside": {"httpFired": 0, "after": "55.55"}
  ```

## Hypothesis

Handler на input не обрабатывает `keydown:Escape`. Click-outside (blur) тоже без revert или save. Достаточно либо:
- На Escape: `setValue(initial)` + `setDirty(false)`.
- На blur при dirty: показывать confirm "Сохранить изменения?" или мягкий toast.
- В любом случае добавить visible dirty-indicator (border-color, "*" в углу input).
