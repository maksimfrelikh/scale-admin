# BLOCK-05 — Multi-tab / Cache consistency

## Цель
Убедиться, что состояние приложения консистентно между двумя вкладками одного браузера в рамках одной admin/operator сессии. Logout в одной → выход в другой. Mutation в одной → обновление в другой. RTK Query invalidation работает (или явно зафиксировано как баг).

## Контекст
- Canonical hashes из Block 4: `#stores`, `#products`, `#users-access`, `#global-logs`, `#store:{uuid}`.
- BUG-REG-013: post-login URL остаётся `/login`, обе вкладки могут показывать `/login#...`. Это ожидаемый шум.
- Block 3: revoke storeAccess мгновенно инвалидирует operator session (401).
- Block 2: session cookie `scale_admin_session` HttpOnly+Secure+SameSite=Lax; `scale_admin_csrf` JS-visible (это нужно для x-csrf-token header).

## Методика
- Один Chromium контекст (общая cookie jar и localStorage) с двумя страницами Page A и Page B — это и есть "две вкладки" в смысле SPA.
- Playwright headless. CSRF flow: GET /api/auth/csrf → token → x-csrf-token header на POST/PATCH/DELETE.
- Поллинг 30 сек = 6×5 сек, 60 сек = 12×5 сек, чистая wait без рефреша.
- Скрипты: `scripts/block-05-multitab.cjs` (round 1) и `scripts/block-05-multitab-2.cjs` (round 2 — fix для E с listeners + D на свежем store + B с прямым API session swap).
- Evidence: `evidence/block-05/`. JSON отчёты: `report.json`, `report-round2.json`.

## Канонические факты сессии (зафиксировано)

| Что | Значение |
|---|---|
| Session cookie | `scale_admin_session` — HttpOnly, Secure, SameSite=Lax |
| CSRF cookie | `scale_admin_csrf` — JS-visible (НЕ HttpOnly) |
| Login | POST /api/auth/login, требует x-csrf-token |
| Logout | POST /api/auth/logout, требует x-csrf-token |
| Server session probe | GET /api/auth/session → 200 если активна, 401 если нет |
| localStorage / sessionStorage | пустые в обеих ролях, никаких auth-related ключей |
| IndexedDB | databases() возвращает пустой массив |
| BroadcastChannel | каналы `auth`, `session`, `app`, `scale-admin`, `logout`, `rtk-query`, `cache`, `main` — подписки успешны, событий 0 |

## Чек-лист и результаты

### A. Logout broadcast
| # | Сценарий | Результат |
|---|---|---|
| A1 | 2 вкладки admin, обе на Dashboard | ✅ ok, обе вкладки видят admin Dashboard |
| A2 | Tab A logout → Tab B без действия покидает protected state ≤60 сек | ❌ fail BUG-REG-014. 60 сек поллинга: Tab B остаётся в admin UI (h1 "Добро пожаловать, QA Admin"), при этом GET /api/auth/session → 401 |
| A3 | Tab B клик по Stores → 401 → /login | ✅ ok. Клик по `#stores` → GET /api/stores 401 → UI переходит на форму Login |
| A4 | Tab B попытка create product (state-change) после logout в A | ✅ ok с точки зрения безопасности: POST /api/products → 401 `Authentication required`. Без stale CSRF, без утечки. UI грейс — переходит на Login по 401 фильтру |

### B. Multi-role session swap
| # | Сценарий | Результат |
|---|---|---|
| B1 | Tab A admin, Tab B login operator (overwrites cookie) | ✅ операция: POST /api/auth/login operator → 200, server session=operator |
| B2 | Tab A через 30 сек: какой role видит | ❌ fail BUG-REG-017. 30 сек: Tab A показывает admin UI (h1, nav Users & Access / Global Logs / Create store, admin store-detail кнопки Edit/Refresh/...). Server /api/auth/session уже отдаёт `role: operator` — клиент Tab A это игнорирует |
| B3 | Tab A клик по admin link после swap | ❌ partial. URL меняется на `#users-access`, UI рендерит admin layout. API GET /api/users → 403 — но UI 403 не обрабатывает: нет toast, нет редиректа, нет обновления роли |

### C. Stores list freshness
| # | Сценарий | Результат |
|---|---|---|
| C1 | Обе вкладки admin на #stores | ✅ начальное состояние одинаково (44 магазина, без QA-MULTITAB-001) |
| C2 | Tab A создаёт QA-MULTITAB-001 (UI fallback → API 201) | ✅ создано, id=`fa402ca3-4ff7-4c0f-b33e-e259b91adf3f`. UI кнопка "Create store" есть, но модал не нашли input — fallback на API. UI-флоу создания магазина → отдельная заметка, см. Notes. |
| C3 | Tab B без refresh, ждать 30 сек | ❌ fail BUG-REG-015. 6 поллингов × 5 сек: ни разу не появилось. Никакого индикатора stale. |
| C4 | Tab B refresh → магазин появляется | ✅ sanity: после reload QA-MULTITAB-001 виден |
| C5 | Cleanup QA-MULTITAB-001 | ✅ PATCH /api/stores/{id} status=archived. Pre `active` → patch 200 → Post `archived`. Verified GET до и после |

### D. Store Detail freshness
| # | Сценарий | Результат |
|---|---|---|
| D1 | Обе вкладки admin на #store:{uuid} | ✅ rendered. На round 1 выбранный legacy store не имел active mainCatalog (404 "Active store catalog not found"). На round 2 создан свежий store `7b3dd342-...` с auto-created active mainCatalog `9f6b96db-...` |
| D2 | Tab A создаёт категорию QA-MTAB-CAT-001 в Catalog | ✅ POST /api/stores/{sid}/catalog/categories → 201, id=`b439fa13-...`. UI кнопка добавления категории не найдена — fallback на API. UI-флоу add-category → отдельная заметка |
| D3 | Tab B без refresh: категория видна за 30 сек | ❌ fail BUG-REG-016. 6 поллингов × 5 сек: 0 раз seen |
| D4 | Tab B refresh → категория появляется | ✅ sanity: после reload QA-MTAB-CAT-001 виден |
| D5 | Cleanup — archive категории | ✅ PATCH /api/stores/{sid}/catalog/categories/{cid} status=archived. patchStatus 200, post_status `archived` |

### E. Storage / BroadcastChannel inspection
| # | Сценарий | Результат |
|---|---|---|
| E1 | localStorage обеих вкладок: auth-related ключи | ✅ проверено: оба пустые `{}` под admin |
| E2 | sessionStorage обеих вкладок | ✅ проверено: оба пустые `{}` |
| E2b | Cookie names visible в JS | ✅ только `scale_admin_csrf`; `scale_admin_session` HttpOnly (не виден JS) |
| E3 | IndexedDB | ✅ `indexedDB.databases()` → `[]` |
| E4 | `window.addEventListener('storage', …)` — event при logout в другой вкладке | ❌ 0 событий за 30 сек после logout в A |
| E5 | `new BroadcastChannel('auth'\|'session'\|'app'\|'scale-admin'\|'logout'\|'rtk-query'\|'cache'\|'main')` | ❌ 8 каналов подписаны, 0 сообщений принято за 30 сек |

Подтверждено: фронтенд **не использует** ни storage event, ни BroadcastChannel для синхронизации сессии/кэша между вкладками. localStorage/sessionStorage/IndexedDB не используются для auth-состояния. Cross-tab broadcast возможен только через cookie (через server-side и опрос /api/auth/session, чего тоже не происходит).

### F. Stale CSRF (BUG-UX-003)
| # | Сценарий | Результат |
|---|---|---|
| F1.a | Tab A logout → login заново → CSRF token меняется | ✅ верифицировано: cookie `scale_admin_csrf` обновился (`yho85n...l5t0` → `3GeyVB...qEQs`) |
| F1.b | Tab B без refresh — что видит в `document.cookie`? | ✅ читает НОВЫЙ token (browser cookie jar shared между вкладками) |
| F1.c | Tab B mutation POST /api/stores используя CSRF из cookie | ✅ 201 Created. UI-pattern "брать CSRF из cookie на момент запроса" работает корректно |
| F1.d | Tab B mutation POST /api/stores с явно СТАРЫМ CSRF (симулирует кэш в Redux/state) | ✅ 403 `{"code":"CSRF_TOKEN_INVALID","message":"CSRF token required or invalid"}` — server корректно отвергает |

Вывод: со стороны API стек CSRF-защиты работает чисто. **BUG-UX-003 в этом сценарии не воспроизводится:** реальный fetch заново читает cookie и получает свежий токен. UI-баг "stale CSRF" возможен только если приложение кэширует токен в Redux/state и не обновляет — это бы потребовало посмотреть исходник фронта; в run-time browser-тесте симптом не наблюдается.

### G. Long-living tab (5+ мин idle)
| # | Сценарий | Результат |
|---|---|---|
| G1 | Tab A на Dashboard, 5:30 мин idle, замеры каждые 30 сек | ✅ 11 снапшотов: h1 стабильно "Добро пожаловать, QA Admin", UI не меняется (ожидание) |
| G1.bg | Background API calls Tab A во время idle | **0 запросов** к /api/auth/session или иным endpoint'ам. Фронт не пингует session в idle |
| G2 | После idle: external logout → опрос Tab A 30/60/90/120 сек | ❌ confirms BUG-REG-014. Все 4 пол-минутных опроса: h1 "Добро пожаловать, QA Admin", сервер /api/auth/session → 401. UI игнорирует и не показывает logged-out |
| G3 | Tab A клик по Stores после 2 мин без действий | ✅ UI корректно переходит на Login form (h1 "Вход в систему", body содержит форму Email/Password) |

Дополнительный сигнал к BUG-REG-014: idle tab не имеет ни поллинга, ни keep-alive ping'а. Любая попытка увидеть смену состояния — только через user action.

### H. External logout (через terminal-like curl, не UI)
| # | Сценарий | Результат |
|---|---|---|
| H1 | Pre-state: обе вкладки залогинены admin | ✅ session+csrf cookies в jar |
| H2 | Внешний POST /api/auth/logout (через `ctx.request.post`, симулирует curl) | ✅ 200, session cookie expired |
| H3 | Опрос обеих вкладок 30 сек без действия | ❌ confirms BUG-REG-014. 6 опросов × 5 сек: A.h1 и B.h1 остаются "Добро пожаловать, QA Admin"; server /api/auth/session = 401 на обе |
| H4 | Tab A клик по Products после 30 сек | ✅ UI переходит на Login form (h1 "Вход в систему") |

Финальная проверка: backend-driven invalidation эффективна; client-side propagation отсутствует.

## Bugs filed in this block
- **BUG-REG-014** (high) — Logout не транслируется между вкладками. Repro BUG-UX-001.
- **BUG-REG-015** (medium) — Stores list не auto-refresh между вкладками. Repro BUG-UX-011.
- **BUG-REG-016** (medium) — Store Detail Catalog не auto-refresh между вкладками. Repro BUG-UX-012.
- **BUG-REG-017** (high) — Tab A продолжает показывать admin UI 30+ сек после смены сессии на operator в другой вкладке; UI не обрабатывает 403 на admin endpoint.

BUG-UX-003 (stale CSRF) в run-time browser-сценарии **не воспроизводится** (секция F): fetch берёт свежий token из cookie, server корректно отвергает stale token. Не репорчен как новый bug — оставлен на review реального фронт-кода.

## Mechanism detection — итоговая таблица по 4 BUG-UX

| BUG-UX | Описание (исходное) | Mechanism обнаружен | Mechanism отсутствует | Repro в Block 5 |
|---|---|---|---|---|
| **BUG-UX-001** | Logout in one tab should propagate to other tabs | ❌ нет | storage events=0; BroadcastChannel на 8 каналах=0; /api/auth/session polling в idle=0 | ✅ BUG-REG-014 |
| **BUG-UX-003** | Stale CSRF token leads to mutation 403 без graceful retry | n/a — UI fetch reads fresh CSRF from cookie на момент запроса; server корректно отвергает stale | UI не кэширует токен в наблюдаемом потоке | ⚠️ Не репродуцируется в run-time; нужна проверка исходника на наличие кэша в Redux |
| **BUG-UX-011** | Stores list не обновляется в Tab B после mutation в Tab A | ❌ нет auto-refetch | Tab B 30 сек idle = 0 запросов к /api/stores | ✅ BUG-REG-015 |
| **BUG-UX-012** | Store Detail (категории/каталог) не обновляется cross-tab | ❌ нет auto-refetch | Tab B 30 сек idle = 0 запросов к /api/stores/{sid}/catalog/categories | ✅ BUG-REG-016 |
| **BUG-UX-013** | Post-login URL остаётся `/login`, nav строит /login#... | ⚠️ косметика; не блокирует функционал | — | ✅ BUG-REG-013 (filed ранее) |

Дополнительно:
- **BUG-REG-017** (multi-role swap stale-admin UI) — новая разновидность same root cause: нет cross-tab session sync. Не было в списке BUG-UX, найдено в этом блоке.

## Evidence (полный список)

| Файл | Что |
|---|---|
| `evidence/block-05/report.json` | Полный отчёт round 1 (A,B,C,D,E,initial cleanup) |
| `evidence/block-05/report-round2.json` | Round 2: E_fixed, D_fixed, B (role swap), cleanup |
| `evidence/block-05/report-round3.json` | Round 3: F, G, H, mechanism table |
| `evidence/block-05/run*.log` | Stdout логи каждого запуска |
| `evidence/block-05/block-05-tab-A.har.json` | Sanitized Tab A network summary (HAR-equiv) |
| `evidence/block-05/block-05-tab-B.har.json` | Sanitized Tab B network summary (HAR-equiv) |
| `evidence/block-05/block-05-console-A.txt` | Console Tab A (401 ошибки, без секретов) |
| `evidence/block-05/block-05-console-B.txt` | Console Tab B (пусто) |
| `evidence/block-05/*.png` | Скриншоты каждого repro и контрольной точки |
| `scripts/block-05-multitab.cjs` | Round 1: A,B,C,D,E,initial cleanup |
| `scripts/block-05-multitab-2.cjs` | Round 2 |
| `scripts/block-05-multitab-3.cjs` | Round 3 (F,G,H) |
| `scripts/block-05-har-summary.cjs` | Генератор sanitized network summary |

Примечание: реальный Playwright HAR не сгенерирован (опция `recordHar` не сработала в текущем env); вместо него — синтез из захваченных request/response в report*.json, с маскированием токенов.

## Notes / Observations

### Общий root cause
Все 4 бага этого блока — один общий пробел: на клиенте нет механизма cross-tab синхронизации auth/cache состояния. Любой из подходов закроет все 4 одновременно:
1. **BroadcastChannel** (рекомендую — самое чистое). Один канал `scale-admin` с сообщениями `{ type: 'session-change' \| 'invalidate', tags?: [...] }`. RTK Query умеет диспатчить invalidate из BroadcastChannel.
2. **storage event на localStorage flag** (`scale_admin_session_epoch` bumped on each login/logout — другие вкладки слышат и refetch'ат /api/auth/session). Работает на всех браузерах, включая старые.
3. **Polling /api/auth/session** каждые 30-60 сек + visibility-change refetch. Грубое решение, но MVP-ок.

### Server-side всё консистентно
- Сессия мгновенно инвалидируется при logout → 401 на любой API.
- RBAC мгновенно реагирует на смену роли → 403 на admin endpoint когда session=operator.
- Никакой утечки данных или privilege escalation не обнаружено.

### UI кнопки create-store и add-category
В обеих секциях C и D Playwright не нашёл понятного модала со стандартными `input[name="name"]` для UI-флоу создания. Скрипт fallback'нул на API. Это **не** прямой баг — кнопки существуют (`button:has-text("Create store")` найдена), но модал и форма могут использовать иные локаторы / id'ы. Это снижает покрытие browser-теста, но не блокирует backend проверку.

→ Создал тестовое TODO: посмотреть DOM-структуру create-store и add-category модалов и обновить block-05 скрипты для покрытия UI mutation path.

### Legacy stores без active mainCatalog
При выборе магазина "Manager Verify Store 002" (id `adc14d18-59b7-43f1-995f-f079c2ef0b96`) POST /api/stores/{sid}/catalog/categories вернул 404 "Active store catalog not found". Это значит у legacy магазинов нет active main catalog в БД. Не блокирует Block 5, но достойно отдельного исследования (миграция или fix-up).

## Cleanup verification

| Тестовая сущность | Создана как | Действие | Verified post |
|---|---|---|---|
| Store QA-MULTITAB-001 | `fa402ca3-4ff7-4c0f-b33e-e259b91adf3f` | PATCH status=archived → 200 | postStatus `archived` ✅ |
| Store QA-MTAB-D-001 | `7b3dd342-2b72-47c1-b06a-6116342e9cd9` | PATCH status=archived → 200 | postStatus `archived` ✅ |
| Category QA-MTAB-CAT-001 | `b439fa13-40a7-46c1-9e11-2d4a41581972` | PATCH status=archived → 200 | post_status `archived` ✅ |
| Store QA-MTAB-F-001 | `9a226687-6dd3-4377-99b2-ed3182ba9de4` | PATCH status=archived → 200 (через curl) | postStatus `archived` ✅ |
| Store QA-MTAB-F-002 | — | не создан (server отверг stale CSRF 403) | n/a — sanity confirmed |

Pre/post GET на каждой сущности — verified. Нет тестовых данных в active состоянии после блока.

## Exit criteria
- [x] Все 25 пунктов плана (A1-4, B1-3, C1-5, D1-5, E1-5, F1, G1-3, H1-4) пройдены или явно зафейлены
- [x] 4 новых бага отрепорчены (BUG-REG-014..017); BUG-UX-003 reproduced=no с обоснованием
- [x] Mechanism-таблица по 4 BUG-UX заполнена
- [x] Evidence per-tab (HAR-equiv + console + screenshots) собран и sanitized
- [x] Чистка тестовых данных подтверждена evidence-log GET до и после (5 entities)
- [x] BLOCK-05-multitab.md заполнен
- [x] Heartbeat manager-у отправлен
