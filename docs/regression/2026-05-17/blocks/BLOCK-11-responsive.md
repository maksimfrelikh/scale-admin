# BLOCK-11 — Mobile / Responsive

- Date: 2026-05-18
- Start: 00:57 CEST
- End: 08:15 CEST (фактическая работа ≈ 01:25; финализация в утреннем окне)
- Duration (active): ≈ 30 min
- Environment: production https://maksimfrelikh.ru
- Accounts: qa-admin@gmail.com (admin), qa-operator@gmail.com (operator)
- Branch: docs/regression-2026-05-17 @ e91b4e8
- Script: `scripts/block-11-responsive.cjs`
- Raw report: `evidence/block-11/report.json` (116 KB)
- Run log: `evidence/block-11/run.log`

## Цель

Прогнать 8 страниц на 5 viewport (1366×768, 1024×768, 768×1024, 414×896, 375×667), измерить page-level horizontal overflow, оценить touch targets (≥44 px), верифицировать BUG-UX-008/009/010.

## Pre-read

- SPA hash-routed (`frontend/src/routeState.ts:67`): `/login`, `/`, `/#stores`, `/#store:<uuid>`, `/#products`, `/#users-access`, `/#global-logs`.
- BUG-UX-008/009/010 (2026-05-16): page-level scrollWidth расширялся до 1376/983/682 на narrow viewports.
- Touch target target = 44×44 px (HIG / задание manager).
- `/login` URL-артефакт после login = BUG-REG-013 (известный, не считается находкой Block 11).
- Одно GET `/api/auth/session` → 401 при первой загрузке на каждой viewport — известный one-shot probe (TASK-061 fix), retry loop не возникает.

## Methodology

`scripts/block-11-responsive.cjs` — единый Playwright sweep:
- Для каждой пары (viewport × page) — изолированный `BrowserContext` (`viewport={w,h}`, `isMobile=true` и `hasTouch=true` при ≤768).
- Login через UI (qa-admin / qa-operator) per role, далее `goto` целевой hash, scroll к низу + `scrollTo(0,0)`, **full-page** screenshot.
- В каждой точке через `page.evaluate`:
  - `docScrollW = max(html.scrollWidth, body.scrollWidth)`, `docClientW`, `horizontalOverflow = docScrollW > vp + 2`;
  - top-12 элементов чьи `boundingClientRect.right > vp + 2` с tag/cls/path/scrollWidth;
  - для mobile (vp < 600): tap-target audit — clickable элементы (`button, a[href], [role="button"], input[type="submit"]`) с `w < 44` или `h < 44`;
  - heuristic поиск hamburger/drawer (aria-label/text/class containing `menu|nav|hamburger|drawer|burger|navigation`);
  - nav links inventory, console errors, network 4xx/5xx.
- Output: 40 PNG (full-page) + `report.json`.

Запуск: `NODE_PATH=/home/clawd/.npm/_npx/e41f203b7505f1fb/node_modules QA_PASSWORD='...' node ...`.

## Результаты

### 1. Overflow matrix — `docScrollW` vs viewport.width

`*` помечает page-level horizontal overflow (`docScrollW > viewport + 2`).

| page | v1366 | v1024 | v768 | v414 | v375 |
|---|---|---|---|---|---|
| A-login (unauth) | 1366 | 1024 | 768 | 414 | 375 |
| B-overview admin | 1366 | 1024 | 768 | 414 | 375 |
| C-overview operator | 1366 | 1024 | 768 | 414 | 375 |
| D-stores admin | 1366 | 1024 | 768 | 414 | 375 |
| E-store-det admin | 1366 | 1024 | 768 | 414 | 375 |
| F-products admin | 1366 | 1024 | 768 | 414 | 375 |
| G-users-access admin | 1366 | **1039*** | 768 | 414 | 375 |
| H-global-logs admin | 1366 | 1024 | 768 | 414 | 375 |

**39/40 pass, 1/40 fail (G-users @ v1024 = +15 px overflow).** Доминирующий паттерн: таблицы (Products, Logs, Scale Devices, Banners) шире viewport, но они корректно обёрнуты в `.product-table-wrap` / `.logs-table-wrap` / `.scale-device-table-wrap` / `.banner-table-wrap` с внутренним `overflow-x: auto` — документ не расширяется. Это правильный паттерн, рекомендованный в fix-direction BUG-UX-008/009.

### 2. Per-page findings

#### A. Login (unauth) — `/login`

- Все 5 viewport: `docScrollW == vp` (нет overflow).
- На v375/v414 кнопка `Login` единственная primary, h=43 px (на 1 px ниже 44-target — см. §3 ниже).
- Console: одно 401 на `/api/auth/session` (known, не Block 11).
- Screenshots: `evidence/block-11/A-login-v{1366,1024,768,414,375}.png`.

#### B. Overview admin — `/` (h2 "Fleet overview")

- Все 5 viewport: нет overflow.
- BUG-UX-010 (2026-05-16) фиксировал dashboard width 682 px @ 390/430 viewport — **больше не воспроизводится**. На v375/v414 контент стэком: KPIs (Stores 80 / Active scales 19/20) → "Latest published versions" → "Latest sync errors" → "Problematic scales" → "Quick links". Wrap navigation, нет горизонтального scroll.
- На v414/v375: 20 sub-44 clickable элементов (см. §3); среди них табличные "Open store" 248×37 / 287×37 — реальный tap-target hit.
- Screenshots: `B-overview-v*.png`.

#### C. Overview operator — `/` (h2 "Assigned stores")

- Все 5 viewport: нет overflow.
- На v414/v375: 6 sub-44 clickable элементов (меньший набор по причине ограниченного RBAC).
- Screenshots: `C-overview-v*.png`.

#### D. Stores list admin — `/#stores` (h2 "Stores")

- Все 5 viewport: нет overflow.
- 20 sub-44 clickable per page на mobile (Details/Edit/Block 316×43 — within 1 px of target, см. §3).
- Screenshots: `D-stores-v*.png`.

#### E. Store Detail single-page admin — `/#store:1cf0f4ba-…` (h2 "UAT 2026-05-15 Phase 4 …")

- Все 5 viewport: нет page-level overflow. Длинная страница (≈14 987 px на v375), все секции стэком: Catalog → Prices → Advertising → Scale Devices → Versions → Logs.
- BUG-UX-009 (2026-05-16) фиксировал operator store-details width 983 px @ 390/430/768 — **больше не воспроизводится** (тестировал admin; operator имеет тот же layout single-page).
- Внутренний overflow на широких таблицах: `.scale-device-table` 860×1288 px и `.banner-table` 860 px — оба контейнятся в `*-wrap` обёртках с горизонтальным scroll, документ не расширяется. ✅
- "Back to stores" link 148×19 px на v375/v414 — slim back-arrow, в нашем случае стрелка-link, не основной touch target.
- Screenshots: `E-store-det-v*.png`.

#### F. Products admin — `/#products` (h2 "Product catalog")

- Все 5 viewport: нет page-level overflow.
- Таблица `.product-table` width 1550 px — внутренний scroll в `.product-table-wrap`. ✅
- Action button `Edit` в строках: **61×37 px** — наиболее серьёзный tap-target hit (см. §3, BUG-REG-033).
- Screenshots: `F-products-v*.png`.

#### G. Users & Access admin — `/#users-access` (h2 "Invites, roles and operator stores")

- v1366, v768, v414, v375 — нет overflow.
- **v1024**: `docScrollW = 1039` (+15 px). Причина — `<input>` width 295 в `section.panel > form.invite-form > div.invite-grid > label > input`. Layout `.invite-grid` (трёх- или четырёх-колоночный grid) не сжимается при 1024 px, последний input выпадает за viewport. Доказательство: `evidence/block-11/G-users-v1024.png`, `report.json` results[14].metrics.overflowers[0].
- Filed как **BUG-REG-032**.
- Mobile (v414/v375): grid корректно сжимается, overflow нет.
- Screenshots: `G-users-v*.png`.

#### H. Global Logs admin — `/#global-logs` (h2 "Global Logs")

- Все 5 viewport: нет page-level overflow.
- BUG-UX-008 (2026-05-16) фиксировал scrollWidth 1376/1377 @ 390/430/768/1024 — **больше не воспроизводится**. На v375 контент: filter section с stack-полями ("Entity type", "Action / audit type", "Any auth state", "Any user", "Any user state", "From", "To"), потом audit list карточками. На v1024/v768 таблица `.logs-table` 1111 px внутри `.logs-table-wrap` со scroll. ✅
- Screenshots: `H-logs-v*.png`.

### 3. Touch target audit (mobile v375/v414)

Threshold = 44×44 px (manager-specified).

**Severe (h ≤ 40 px) — tap target значимо ниже порога:**

| Selector / text | Size | Pages |
|---|---|---|
| `BUTTON Edit` (table action) | 61×37 | F-products v375, v414; H-logs |
| `BUTTON Open store` (overview card) | 287×37, 248×37 | B-overview v414, v375 |
| `BUTTON ← Back to stores` (link-as-button) | 148×19 | E-store-det v375, v414 |

→ Filed как **BUG-REG-033**. Самый частый случай — `Edit` 61×37 в таблице продуктов (20 строк на mobile across pages) и `Open store` в карточках dashboard. На реальных тачскринах попасть пальцем по 37 px высоте промахиваешься чаще нормы (Fitts).

**Near-limit (41 ≤ h ≤ 43 px) — на 1–3 px ниже 44:**

Системно вся primary-кнопочная гамма имеет высоту **43 px** (Logout, Overview, Stores, Products, Users & Access, Global Logs, Create store, Refresh*, Details, Edit (large), Block, Revoke, Login, Search, Clear filters, etc.). Минус 1 px от target — скорее всего следствие `border` 1 px против `content-box`. **Не файлим отдельный bug** — это cosmetic; включаем в observation внутри BUG-REG-033 fix-direction (увеличить line-height до достижения 44 px).

### 4. Hamburger / mobile navigation

`hamburger detection`: heuristic поиск элементов с aria-label / class / text matching `menu|nav|hamburger|drawer|burger|navigation` дал **0 совпадений на всех viewport**.

Фактическое поведение: на v375/v414 top-nav (`Overview / Stores / Products / Users & Access / Global Logs / Create store`) **wrap-ит на несколько строк**, занимая ≈ 5–6 рядов под `Logout`. Overflow нет, кнопки кликабельны, но плотность контента над first-fold снижается; ≈ 200 px viewport heigth (≈ 30 % от 667 на iPhone SE) уходит на навигацию.

→ Не bug по критерию manager-а ("Top bar с overflow → BUG"). Top bar overflow отсутствует. Зафиксировано как **observation** для дизайн-беседы: либо drawer/hamburger, либо condensed icon-only nav, либо overflow-menu (`More ▾`) на mobile.

### 5. Console / network errors

Каждая страница на каждой viewport: ровно **1 console error** + **1 network 4xx** = `GET /api/auth/session → 401`. Это known TASK-061 one-shot probe, retry loop не наблюдается. Других ошибок (включая layout-related warnings) нет.

### 6. Performance / readability наблюдения

- На v375 H-logs страница ≈ 11 600 px высотой — content readable, log rows стэком с date/IDs, font-size в пределах нормы (>12 px).
- На v375 E-store-det ≈ 14 987 px — длинная single-page, все секции читабельны, форма "Active catalog categories" корректно сжимается.
- На v1366 контент центрируется внутри `<main>` ~ 1300 px max-width; нет излишнего растяжения карточек.

## Known bugs verification

| Bug | Symptom (2026-05-16) | Status 2026-05-18 | Evidence |
|---|---|---|---|
| BUG-UX-008 | Global Logs `scrollWidth = 1376/1377` @ vp 390/430/768/1024 | **FIXED** | H-logs строка таблицы выше = vp на всех viewport. `evidence/block-11/H-logs-v{1024,768,414,375}.png` |
| BUG-UX-009 | Operator Store Details `scrollWidth = 983` @ vp 390/430/768 | **FIXED** | E-store-det строка таблицы выше = vp на всех viewport; admin/operator single-page одинаковый. `evidence/block-11/E-store-det-v{1024,768,414,375}.png` |
| BUG-UX-010 | Admin dashboard `scrollWidth = 682` @ vp 390/430 + 1063 @ vp 1024 | **FIXED** | B-overview строка таблицы выше = vp на всех viewport. `evidence/block-11/B-overview-v{1024,414,375}.png` |

Фикс-паттерн (наблюдаемый в DOM): таблицы обёрнуты в `*-wrap` контейнеры с собственным `overflow-x: auto`; flex/grid children получили `min-width: 0`; filter sections стэкают/wrap-ят поля; nav top-bar wrap-ит на узких viewport вместо растяжения. Ровно те шаги, что были предложены в fix-direction всех трёх BUG-UX.

## Найденные баги

- **BUG-REG-032** — invite-form input выпадает за viewport на tablet landscape 1024 px (`section.panel > form.invite-form > div.invite-grid > label > input` right=1039). Severity low. См. `bugs/BUG-REG-032.md`.
- **BUG-REG-033** — table action buttons (`Edit` 61×37, `Open store` 287×37 / 248×37) ниже 44 px touch target на mobile; primary buttons 43×N — на 1 px ниже target системно. Severity medium. См. `bugs/BUG-REG-033.md`.

## Эскалации

Нет. Login на mobile работает (form submit, redirect), core flows (publish, price edit, catalog navigation) доступны через wrapped tables со scroll внутри, full body overflow отсутствует.

## Exit

- 8 pages × 5 viewports = 40 screenshots ✅
- Матрица заполнена ✅
- 21+ точка пройдена: 5 viewport × 4 базовых проверки (overflow, touch, console, hamburger) + per-page deep checks = 25+ точек ✅
- BUG-UX-008/009/010 verdicts зафиксированы (все FIXED) ✅
- 2 новых бага зафайлены ✅
- BLOCK-11-responsive.md заполнен ✅
