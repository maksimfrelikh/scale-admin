# BUG-REG-032: Invite-form input выпадает за viewport на tablet landscape (1024 px), вызывая page-level horizontal overflow на Users & Access

- Severity: low
- Area: frontend / responsive — Users & Access page (`#users-access`)
- Role: admin
- Environment: production https://maksimfrelikh.ru
- Browser: Chromium 1223 (Playwright headless)
- Viewport: **1024 × 768** (tablet landscape)
- Found: 2026-05-18 01:15 CEST
- Related: BLOCK-11 §2.G; не воспроизводится на v1366, v768, v414, v375

## Шаги воспроизведения

1. Login как `qa-admin@***.invalid`.
2. Navigate `https://maksimfrelikh.ru/#users-access`.
3. Установить viewport 1024×768 (DevTools tablet emulation, "iPad Pro 11 landscape" или Playwright `viewport: {w:1024,h:768}`).
4. Дождаться загрузки секции "Invites, roles and operator stores".
5. Проверить `document.documentElement.scrollWidth`.

## Ожидаемое

`docScrollW <= viewport.width` (1024). Все поля invite-form помещаются в viewport, либо grid сжимается / переносит последнюю колонку.

## Фактическое

`docScrollW = 1039` (+15 px над 1024).

Виновник — input в трёх/четырёх-колоночном `.invite-grid`:

```
section.panel > form.invite-form > div.invite-grid > label > input
  width: 295 px
  bounding-rect.right: 1039 px  ← выпадает за viewport
  scrollWidth: 293
```

На v768 (tablet portrait) и v414/v375 (mobile) grid корректно сжимается / стэкает поля — overflow отсутствует. На v1366 (laptop) ширины хватает. Проблема локализована именно в диапазоне 1024 ± несколько десятков пикселей: media-query breakpoint скорее всего стоит на `min-width: 1025px` / `max-width: 1023px`, и 1024 точка попадает в "нерастягивающийся" сценарий без collapse.

## Evidence

- `docs/regression/2026-05-17/evidence/block-11/G-users-v1024.png` — full-page screenshot, видна invite-form в верхней части.
- `docs/regression/2026-05-17/evidence/block-11/report.json` → `results[14].metrics.overflowers[0]`.
- Script: `docs/regression/2026-05-17/scripts/block-11-responsive.cjs`.

## DOM селектор

`section.panel > form.invite-form > div.invite-grid > label:last-child > input`
(один input в `<label>` контейнере, последний в grid).

## User impact

На tablet landscape (iPad 10.9″ / iPad Pro 11″ в portrait-mode device width = 1024) пользователь-admin видит 15-px горизонтальный scroll на странице Users & Access. Это не блокирует функциональность (invite-form всё ещё работает; submit, validation OK), но:
- Page-level scroll visible на правом краю.
- Последнее поле формы может частично уходить за фрейм при touch-scroll.
- Нарушает контракт "no horizontal overflow", который был восстановлен после BUG-UX-008/009/010.

## Suggested fix direction

В `.invite-grid` parent применить одно из:
- `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))` вместо фиксированного числа колонок;
- breakpoint на `@media (max-width: 1100px)` свернуть в 2 колонки;
- или `min-width: 0` на `.invite-grid > label` + `width: 100%` на `input` чтобы вписаться в ячейку grid.

Тест после фикса — повторить sweep `scripts/block-11-responsive.cjs` с viewport 1024×768 и проверить `docScrollW`.

## Repro condition

- Viewport exactly **1024**px wide; reproducible at 1023–1039 range (предположительно).
- Logged in as admin (operator не видит users-access по RBAC).
- Empty или заполненная invite-form — не важно (overflow вызывает сам layout, не значение).

## Status

Reported.
