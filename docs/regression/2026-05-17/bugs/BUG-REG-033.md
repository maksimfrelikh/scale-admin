# BUG-REG-033: Tap targets ниже 44×44 px на mobile — table action buttons 61×37 / 287×37 + системные primary 43 px высотой

- Severity: medium
- Area: frontend / responsive — touch UX на mobile
- Role: admin + operator (admin шире охват, т.к. больше кнопок)
- Environment: production https://maksimfrelikh.ru
- Browser: Chromium 1223 (Playwright `isMobile=true, hasTouch=true`)
- Viewports: 414×896 (iPhone 11 emulation), 375×667 (iPhone SE emulation)
- Found: 2026-05-18 01:18 CEST
- Related: BLOCK-11 §3

## Контекст

Touch target threshold = **44×44 px** (Apple Human Interface Guidelines, Material Design 48dp / Manager spec в задании Block 11). Меньше — повышенный mis-tap rate (Fitts' law).

## Шаги воспроизведения

1. Login (admin или operator) через UI.
2. Установить viewport 375×667 или 414×896 (`isMobile=true, hasTouch=true`).
3. Открыть любую страницу с табличным действиями (например `/#products`) и любую dashboard карточку с CTA (например `/`).
4. В DevTools / Playwright измерить `boundingClientRect` каждого `button / a[href] / [role="button"]`.
5. Сравнить с порогом 44×44.

Reproducer: `docs/regression/2026-05-17/scripts/block-11-responsive.cjs` (tap-target audit в `measure()`).

## Ожидаемое

Все интерактивные элементы на mobile: `width >= 44 && height >= 44` (или ≥ 48 по Material).

## Фактическое

### Severe — height ≤ 40 px (≥ 4 px ниже target)

| Element | Size | Location | Frequency |
|---|---|---|---|
| `BUTTON Edit` (row action) | **61 × 37** | F-products row actions; H-logs (некоторые контексты) | 20× across mobile pages |
| `BUTTON Open store` (overview card CTA) | **287 × 37** (v414), **248 × 37** (v375) | B-overview "Problematic scales" / "Latest sync errors" карточки | 9× per viewport |
| `BUTTON ← Back to stores` | **148 × 19** | E-store-det header (link-as-button) | 2× per viewport |

37 px высота = **−7 px от target (−16 %)**, реальный пальцевой mis-tap rate растёт значимо. 19 px у back-link — на грани невозможности точно ткнуть.

### Near-limit — height 41–43 px (1–3 px ниже target)

Системно ВСЯ primary-кнопочная гамма имеет height = **43 px**:

`Logout`, `Overview`, `Stores`, `Products`, `Users & Access`, `Global Logs`, `Create store`, `Refresh dashboard`, `Refresh stores`, `Refresh catalog`, `Refresh products`, `Refresh users`, `Refresh logs`, `Details`, `Edit` (large variant), `Block`, `Revoke`, `Login`, `Search`, `Clear filters`, `Create invite`, `Create product`, `Create root category`, `Add child`, `Add to category`, `Open catalog`, `Edit store`, `Selected`, `Assign store`, `↑`, `↓`.

Минус 1 px от target — близко к допуску. Скорее всего следствие `border: 1px solid` + `box-sizing` / line-height расчёта на 42-line.

## Evidence

- `docs/regression/2026-05-17/evidence/block-11/report.json` → каждый `results[*].metrics.tapSmall` для viewports v375 / v414. Уникальных (text, w, h) комбинаций ≥ 50.
- Аггрегация (топ): см. BLOCK-11-responsive.md §3.
- Screenshots: `evidence/block-11/F-products-v375.png` (`Edit` 61×37 в строках); `evidence/block-11/B-overview-v414.png` ("Open store" 287×37 в карточках); `evidence/block-11/E-store-det-v375.png` ("← Back to stores" 148×19).

## User impact

На реальном тачскрине (iPhone SE / 11 / любой 4-6″ Android):
- **Severe**: попадание по `Edit` 61×37 в таблице из ≥10 строк — частые mis-taps на соседнюю строку. На table-heavy странице (Products) это блокирующий UX-fail.
- **Near-limit**: 43 px primary buttons работают на практике (1 px терпимо), но дизайн-system нарушает explicit заявленный target 44.

Operator получает меньший набор страниц (нет admin tables), но `Open store` CTA с тем же 37 px на C-overview затрагивает и его flow.

## Suggested fix direction

1. **Severe table row actions** (`Edit` 61×37):
   - Поднять `min-height: 44px` или `padding-block: 12px` в CSS селекторе `.product-table button.row-action, .logs-table button.row-action` (точные классы — см. inspect).
   - На mobile breakpoint оставить либо тот же 44, либо превратить в icon button 44×44.
2. **Overview card CTAs** (`Open store` 287×37):
   - Аналогично `min-height: 44px`. 287 px ширина в порядке — стэк-card layout.
3. **Back-arrow link** (`← Back to stores` 148×19):
   - Дать ему `padding: 12px 8px` и заметную hit-area; либо превратить в icon button 44×44 (как chevron) с ARIA-label.
4. **System-wide 43 px**:
   - В global button styles `line-height` / `padding-block` поднять так, чтобы computed height = 44 px ровно (или 48 px по Material).

После фикса перепрогон tap-target audit через `scripts/block-11-responsive.cjs` ожидает `tapSmall == []` на v375/v414 для каждого page кроме A-login (где меньше элементов).

## Repro environment

`viewport={w:375,h:667}` или `{w:414,h:896}`, `isMobile=true, hasTouch=true` (Playwright `chromium.newContext`). Без `isMobile=true` физическая ширина та же, но scaling/zoom может маскировать (CSS px = device px).

## Status

Reported.
