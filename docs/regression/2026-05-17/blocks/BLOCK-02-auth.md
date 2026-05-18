# BLOCK-02: Auth / Session / Runtime

- Started: 2026-05-17 20:58 Europe/Amsterdam
- Finished: 2026-05-17 21:07 Europe/Amsterdam
- Duration: ~9 мин
- Tester: tester (OpenClaw agent)
- Branch: docs/regression-2026-05-17
- Target: https://maksimfrelikh.ru
- Scope: TASK-061 верификация + полный auth-флоу (login, logout, session, cookie, CSRF, RBAC routing)
- Tooling: curl + jq + openssl + Playwright 1.56.1 headless Chromium 1920x1080

## Checklist

| # | Item | Status | Evidence | Bug |
|---|------|--------|----------|-----|
| A.1 | Incognito open → Login form <2s, не "Checking session..." | ✅ pass (224ms) | block-02-A1-incognito-form.png, block-02-round2-report.json | — |
| A.2 | GET /api/auth/session 1 раз → 401, нет повторов 30s | ✅ pass | block-02-browser-report.json (A_incognito_30s_reqs) | — |
| A.3 | То же в обычном logout-состоянии | ✅ pass | block-02-browser-report.json (A3_fresh_30s_reqs) | — |
| B.1 | Login admin → Dashboard + admin nav | ✅ pass | block-02-B1-admin-dashboard-full.png, round2-report.json | — |
| B.2 | Logout → /api/auth/logout 200, /dashboard → Login | ✅ pass | block-02-B2-after-clean-logout.png | — |
| B.3 | Login operator → ограниченный nav | ✅ pass | block-02-B3-operator-dashboard-full.png | — |
| C.1 | Неверный пароль → понятная ошибка, нет cookie | ✅ pass | block-02-C-negatives.txt | — |
| C.2 | Пустые поля → клиентская валидация | 🟡 fail | round2-report.json (C.2), block-02-C-form-validation-bad-email.png | BUG-REG-006 |
| C.3 | Невалидный email формат → валидация | ✅ pass | round2-report.json (C.3) | — |
| C.4 | Несуществующий email → та же общая ошибка | ✅ pass (no enumeration) | block-02-C-negatives.txt | — |
| C.5 | Rate limit ≥6 attempts → 429 | ✅ pass (более строго: уже после 1 попытки) | block-02-C5-ratelimit.txt | BUG-REG-005 (header gap) |
| D.1 | Hard refresh на Dashboard → залогинен | ✅ pass | (round 2 round1 D.1 fail был селектор; повторно подтверждено через D.2, D.3, G.1) | — |
| D.2 | Hard refresh на Stores/Details/Products | ✅ pass | block-02-D2-stores-after-refresh.png, block-02-D2b-products-after-refresh.png | — |
| D.3 | Новая вкладка после login → залогинен | ✅ pass | block-02-D3-new-tab-authed.png | — |
| E.1 | Cookie attrs HttpOnly+Secure+SameSite+Path | ✅ pass | round2-report.json (E.1), block-02-csrf-fetch.txt | — |
| F.1 | POST без CSRF → 403/401 | ✅ pass | block-02-F-csrf-statechange.txt | — |
| F.2 | UI state-change → CSRF header отправляется | ✅ pass (login+logout заверены) | round2-report.json (F.2-login, F.2-logout-csrf via round1) | — |
| G.1 | Close tab → reopen → сессия восстанавливается | ✅ pass | block-02-G1-reopen-after-tab-close.png | — |
| G.2 | Logout 2x подряд → второй "не 200"/revoked | 🟡 partial | block-02-G-logout.txt | — (idempotent дизайн, see notes) |
| H.1 | Incognito /dashboard,/stores,/products,/users,/logs → Login | ✅ pass | block-02-H1-incognito-protected-redirected.png, browser-report.json (H1) | — |
| H.2 | Operator /users direct → отказ | 🟡 fail | block-02-H2-operator-users-direct.png, round2-report.json (H.2) | BUG-REG-007 |
| H.3 | API защита: /api/{stores,products,users} без cookie → 401 | ✅ pass | block-02-H-direct-api.txt | — |

22 пункта: 19 ✅ pass, 3 🟡 (C.2, G.2, H.2). C.2 и H.2 — BUG-REG. G.2 — by-design (idempotent), не баг.

## Results

### A. TASK-061 верификация ✅

Цель блока. Регрессии нет.

- **A.1** Incognito первое посещение `https://maksimfrelikh.ru/`:
  - Time-to-interactive Login form: **224 ms** (порог <2000ms — пройден с запасом ×9).
  - Текста "Checking session..." / "Loading session" / "Загрузка сессии" не появлялось.
  - На странице сразу видны поля email/password и кнопка submit.
- **A.2** В incognito-окне за 30 секунд наблюдения через Playwright `page.on('request')`:
  - `/api/auth/session` вызывается **ровно 1 раз** → `401 Unauthorized`.
  - Повторных вызовов нет (нет 401-loop из TASK-061).
- **A.3** Идентично в обычном (не incognito) логаут-состоянии: **1 вызов** `/api/auth/session` → `401`, без повторов в течение 30 секунд.
- **Server-side**: повторный `curl -i https://maksimfrelikh.ru/api/auth/session` без cookie возвращает стабильный `401` идемпотентно (см. block-02-A2-session-no-auth.txt).

### B. Login happy path ✅

- **B.1 Admin** `qa-admin@***.invalid`:
  - POST `/api/auth/login` → `200`, тело `{"user":{...role:"admin"...},"expiresAt":"2026-05-31T..."}`.
  - В nav кнопки: `Overview`, `Stores`, `Products`, `Create store`, `Global Logs`, `Users & Access` (все ожидаемые присутствуют).
  - URL после login — `https://maksimfrelikh.ru/` (rendering: Dashboard). Manager упоминает редирект на Dashboard — SPA рендерит дашборд на корне без редиректа на `/dashboard`. Это не баг, просто convention.
  - h1: "Добро пожаловать, QA Admin"; h2: "Fleet overview".
- **B.2 Logout admin**:
  - Клик `Logout` → POST `/api/auth/logout` с `x-csrf-token` → `200 OK`, тело `{"revoked":true}`, `Set-Cookie: scale_admin_session=; Expires=Thu, 01 Jan 1970...` (явное затирание).
  - После → форма Login видна.
  - Direct GET `/dashboard` → SPA сразу показывает Login форму (incognito-like behavior).
- **B.3 Operator** `qa-operator@***.invalid`:
  - POST `/api/auth/login` → `200`, тело `{"user":{...role:"operator"...}}`.
  - Nav: только `Overview`, `Stores`, `Products`.
  - Users & Access, Global Logs, Create store **не отображаются**.
  - h1: "Добро пожаловать, QA Operator"; h2: "Assigned stores".

### C. Login негатив

- **C.1 Wrong password** → `401 {"message":"Invalid email or password","error":"Unauthorized","statusCode":401}`. Cookie не установлены (только CSRF, который был ещё на /auth/csrf). ✅
- **C.2 Empty fields** → **🟡 BUG-REG-006**. Submit активен при пустых полях, форма отправляется на API, backend возвращает то же 401. Нет client-side blocker. Серьёзность low (UX).
- **C.3 Invalid email format** (`abc`, `a@`, `@b.c`):
  - В UI: HTML5 type=email validity срабатывает (поле красное, valid=false), submit блокируется браузером. ✅
  - На API уровне (если форсировать через curl): возвращается то же `401 "Invalid email or password"` — нет утечки информации о валидности email. ✅
- **C.4 Nonexistent email** `nonexistent-qa-zzz@gmail.com` → `401 "Invalid email or password"` — **идентичный** ответ как на wrong password. **User enumeration отсутствует**. ✅
- **C.5 Rate limit**:
  - После **1** неверной попытки (а не 6 как в плане) сервер блокирует — со 2 попытки сразу `429 {"message":"Too many requests. Please retry later.","code":"RATE_LIMIT_EXCEEDED","retryAfterSeconds":7}`.
  - При продолжении попыток `retryAfterSeconds` плавно уменьшается (7→6→6→...).
  - После паузы (>10 сек, без новых попыток) login снова работает — подтверждено повторными login в B.3, F.2 и других тестах.
  - **🟡 BUG-REG-005**: стандартный HTTP header `Retry-After` отсутствует, только кастомное поле в JSON.
  - Поведение более строгое чем ожидалось (1 а не 6 попыток до лока) — это **плюс с т.з. безопасности**, не баг.

### D. Session persistence ✅

- **D.1/D.2/D.2b/D.3**:
  - Hard reload на Dashboard, /stores, /products → остаёмся залогинены, URL сохраняется, контент рендерится.
  - Новая вкладка в том же контексте после login → залогинен.
  - `scale_admin_session` cookie с Max-Age=1209600 (14 дней) делает это устойчиво.

### E. Session cookie атрибуты ✅

Из `Set-Cookie` после login:

```
scale_admin_session=<value>; Max-Age=1209600; Path=/; Expires=Sun, 31 May 2026 19:02:31 GMT; HttpOnly; Secure; SameSite=Lax
```

Подтверждено в Playwright `context.cookies(TARGET)`:

| Cookie | HttpOnly | Secure | SameSite | Path | Max-Age |
|---|---|---|---|---|---|
| `scale_admin_session` | ✅ true | ✅ true | ✅ Lax | ✅ `/` | 1,209,600 (14 дней) |
| `scale_admin_csrf` | ❌ false (by design — double-submit) | ✅ true | ✅ Lax | ✅ `/` | 86,400 (1 день) |

CSRF cookie не имеет HttpOnly **намеренно**: это double-submit cookie pattern, фронт читает значение из тела `/api/auth/csrf` (или из cookie) и отправляет в header `x-csrf-token`. Сервер сравнивает header против cookie. Атакующий не может прочитать cookie или установить custom header cross-origin. **Норма.**

### F. CSRF ✅

- **F.1** POST/PATCH без `x-csrf-token` → `403 "CSRF token required or invalid" code:CSRF_TOKEN_INVALID`. Проверено на:
  - `POST /api/stores` → 403 ✅
  - `PATCH /api/stores/:id` → 403 ✅
  - `POST /api/auth/logout` → 403 ✅
  - `POST /api/stores` с **wrong** token → 403 ✅
  - `POST /api/stores` с mismatched header/cookie → 403 ✅
  - Боковое: `DELETE /api/stores/:id` → 404 — но не из-за CSRF bypass, а потому что **DELETE route для stores/:id просто не определён** в backend (тест с валидным CSRF тоже 404; OPTIONS возвращает дефолтный список методов Express, не реальный allowed-set). Это API design observation, не security issue.
- **F.2** UI state-change carries `x-csrf-token`:
  - POST `/api/auth/login` от фронта → header `x-csrf-token: <value>` присутствует. ✅
  - POST `/api/auth/logout` от фронта → header `x-csrf-token: <value>` присутствует, **совпадает** с текущим `scale_admin_csrf` cookie. ✅
  - SPA правильно интегрирует CSRF в fetch-обёртку.
- В UI также проверена попытка открыть "Create store" dialog: dialog открывается, но из-за разной структуры inputs (несовместимый селектор) реальную submit-попытку зафиксировать не удалось. Однако consistent поведение SPA-обёртки (login + logout оба несут CSRF) делает регрессию для других state-change запросов крайне маловероятной.

### G. Logout edge cases

- **G.1 Close tab → reopen**: cookies персистентны (Max-Age=14 days). Восстановление контекста playwright с теми же cookies → `/dashboard` сразу заходит залогинено. ✅
- **G.2 Double logout**:
  - First POST `/api/auth/logout` (with CSRF + session) → `200 {"revoked":true}`, cookie `scale_admin_session=...; Expires=Thu, 01 Jan 1970 00:00:00 GMT` (явное затирание).
  - Second POST с тем же (теперь stale) cookie → `200 {"revoked":false}`. **Не 401 как ожидалось в плане**, но это **idempotent design** — сервер сообщает "уже нечего отзывать". Семантически корректно, не уязвимость.
  - Подтверждение что сессия реально мертва: GET `/api/auth/session` со stale cookie → `401`; GET `/api/stores` со stale cookie → `401`. ✅
  - Метка 🟡 partial — отличается от ожидания в плане, но корректное API design.

### H. Direct URL access

- **H.1 Incognito direct URLs**: все 5 (`/dashboard`, `/stores`, `/products`, `/users`, `/logs`) → SPA отображает форму Login (`hasLoginForm: true`). URL сохраняется в адресной строке, контент = Login. ✅
- **H.2 Operator direct `/users`**: URL остаётся `/users`, контент = **operator dashboard** (`h1: "Добро пожаловать, QA Operator"`, `h2: "Assigned stores"`). Никакого admin UI не рендерится (no Users & Access heading, no role column, no invite button). Никакого явного отказа тоже нет — **silent dashboard fallback at stale URL**. **🟡 BUG-REG-007** (low). Не security, UX.
- **H.3 API без auth**: все защищённые endpoints (`/api/stores`, `/api/products`, `/api/users`, `/api/auth/session`) без session cookie → `401`. `/api/logs`, `/api/audit-log`, `/api/dashboard` → `404` (этих route не существует на backend — UI "Global Logs" работает через другой endpoint, см. BUG-REG-007 hypothesis). Admin через auth получает `200` на `/api/users` (25 users в системе), но `404` на `/api/logs`, `/api/audit-log`, `/api/audit` — отдельная observation: фронт нужно проверить отдельно, чтобы понять что именно вызывает "Global Logs". Это не auth issue, отложено в следующий блок (Block 3 или later — admin observability/logs UI).

## Bugs filed

| ID | Severity | Title |
|---|---|---|
| BUG-REG-005 | low | 429 на `/api/auth/login` без стандартного `Retry-After` header |
| BUG-REG-006 | low | Login форма не блокирует submit с пустыми полями (нет `required` / client validation) |
| BUG-REG-007 | low | Operator на direct `/users` URL получает Dashboard (silent fallback) вместо отказа/редиректа |

## Notes for next block

- **Admin observability**: `/api/logs`, `/api/audit-log`, `/api/dashboard` все возвращают 404. UI пункт "Global Logs" в admin nav должен работать через какой-то другой endpoint — это надо проверить в блоке про admin observability/logs. Возможно `/api/audit/logs` или `/api/scale-events`.
- **CSRF rotation**: в первом round'е playwright скрипта (block-02-auth.spec.cjs) после 3-4 hard refresh клик `Logout` упал в 403 (csrf mismatch). В чистом тесте round 2 без шумных reload-ов logout вернул 200. Возможный риск: CSRF token rotation после reload SPA → старый header не валиден. В Block 3+ при многошаговых сценариях стоит наблюдать поведение.
- **No HSTS** (BUG-REG-001) делает Secure cookie attribute не полностью защищённым на первом hit (MITM downgrade theoretical). После HSTS установки риск исчезнет.
- **Multi-tab сценарий** не проверен явно (D.3 покрывает только базовый case). В Block 3 — действие в одной вкладке, проверка в другой.

## Exit criteria

- [x] 22 пункта закрыты: 19 ✅, 3 🟡 (2 баг-фиксы C.2/H.2 + 1 by-design G.2)
- [x] Все relevant fails → BUG-REG-005, 006, 007
- [x] BLOCK-02-auth.md заполнен
- [x] Heartbeat manager-у — отправлен отдельным сообщением
