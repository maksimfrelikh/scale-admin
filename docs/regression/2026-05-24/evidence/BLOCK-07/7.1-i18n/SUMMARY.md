# §7.1 Russian Localization — SUMMARY

**Verdict:** ✅ PASS (with 1 medium bug — BUG-REG-071)
**Probes:** 32 (10 anon + 19 admin + 7 operator − 4 wrong-route filtered = 32 meaningful)
**Bugs filed:** 1 medium (BUG-REG-071 — Prisma-invalid-UUID-path → 500 English)
**🔴 watchpoint status:**
  - "Any English string surfaced to user" — triggered for 3 routes (stores GET/PATCH, products GET); filed as medium per BUG-REG-069 precedent (Prisma fallthrough, not deliberate copy missing translation)

## Coverage

| Surface                     | Status | Notes |
|-----------------------------|--------|-------|
| Email invite template       | ✅ PASS | `email.service.ts:36-56` — все Russian |
| Email password-reset template | ✅ PASS | `email.service.ts:58-78` — все Russian |
| API 401 anon (no auth)      | ✅ PASS | "Требуется авторизация" |
| API 401 anon (bad creds)    | ✅ PASS | "Неверный email или пароль" (anti-enumeration, intentional same-msg for malformed email) |
| API 403 CSRF                | ✅ PASS | "Сессия формы истекла. Обновите страницу и повторите действие." |
| API 403 RBAC operator       | ✅ PASS | "Недостаточно прав" |
| API 403 store-access        | ✅ PASS | "Нет доступа к магазину" |
| API 404 known route         | ✅ PASS | "Магазин не найден" / "Пользователь не найден" |
| API 400 validation          | ✅ PASS | "Код магазина обязателен и должен быть не длиннее 64 символов" / "PLU товара обязателен..." / "Введите корректный email" / "Роль должна быть admin или operator" |
| API 409 conflict            | ✅ PASS | "Магазин с таким кодом уже существует" |
| API 500 Prisma-UUID-fallthrough | ⚠️ medium bug | "Internal server error" — **BUG-REG-071** for stores GET/PATCH, products GET |
| Frontend SPA shell (HTML)   | ✅ PASS | `<html lang="ru">` + title "Администратор весов"; viewport responsive; identical for all 10 paths |
| Frontend buttons/labels (`main.tsx`) | ✅ PASS | All visible UX strings Russian (sample: "Назад к магазинам", "Отмена", "Сбросить фильтры", "Скрыть токен", "Найти", "Выше", "Ниже") |
| Frontend confirm dialogs    | ✅ PASS | 3 `window.confirm` calls — all Russian (category-archive, banner-delete, invite-cancel) |
| Frontend loading states     | ✅ PASS | "проверяем...", "Работает (...)", "Ошибка: ..." |
| Frontend pagination labels  | ✅ PASS | "записей", "баннеров", "товаров" |
| Frontend placeholders       | ✅ PASS | "Введите пароль", "Повторите пароль", "Выпечка", "Весы у кассы", "Необязательная модель"; lone English `Europe/Moscow` is legitimate (IANA timezone identifier) |

## Side findings (NOT bugs per Wave 7 brief)

- **Framework-default `Cannot GET /api/<unknown>` English 404** — confirmed reproducible at `/api/auth/me`, `/api/scales/devices/:id`, `/api/catalog/versions/:id`, `/api/auth/invites` GET — these are all routes that **don't exist** in the controller; Express's default 404 handler returns English. Treated as defense-in-depth backlog per Wave 7 brief explicit guidance ("remaining English как defense-in-depth backlog (НЕ блокер)"). Recommended for future fix: register a global 404 catch-all that returns `{"message":"Маршрут не найден","statusCode":404}` in Russian.

## Assertion grid

| # | Probe | Expected | Observed | Verdict |
|---|-------|----------|----------|---------|
| A1 | anon `GET /api/auth/me` | 404 (unknown route) | 404 English (framework default) | side finding |
| A2 | anon `POST /api/auth/login` no CSRF | 403 Russian | 403 "Сессия формы истекла..." | ✅ |
| A4 | anon `GET /api/stores` | 401 Russian | 401 "Требуется авторизация" | ✅ |
| A5 | anon `GET /api/foobar` | 404 | 404 English (framework default) | side finding |
| A7 | anon login non-existent user | 401 Russian | 401 "Неверный email или пароль" | ✅ |
| A8 | anon login empty creds w/ CSRF | 401 Russian | 401 "Неверный email или пароль" (anti-enum) | ✅ |
| A9 | anon login bad email format | 401 Russian (anti-enum) | 401 "Неверный email или пароль" | ✅ |
| ADM-01 | admin `GET /api/auth/me` | 404 | 404 English (framework default) | side finding |
| ADM-02 | admin `GET /api/stores` | 200 | 200 with `STORE-001` payload | ✅ |
| ADM-03 | admin `GET /api/stores/<valid-UUID-unknown>` | 404 Russian | 404 "Магазин не найден" | ✅ |
| ADM-04 | admin `GET /api/stores/not-a-uuid` | 400 Russian | **500 English** | ❌ → BUG-REG-071 |
| ADM-05 | admin `POST /api/stores` no CSRF | 403 Russian | 403 "Сессия формы истекла..." | ✅ |
| ADM-06 | admin `POST /api/stores` empty body | 400 Russian | 400 "Код магазина обязателен..." | ✅ |
| ADM-07 | admin `POST /api/stores` dup code | 409 Russian | 409 "Магазин с таким кодом уже существует" | ✅ |
| ADM-08 | admin `POST /api/products` empty | 400 Russian | 400 "PLU товара обязателен..." | ✅ |
| ADM-10 | admin `GET /api/users/<unknown>` | 404 Russian | 404 "Пользователь не найден" | ✅ |
| ADM-12 | admin `POST /api/auth/invites` empty | 400 Russian | 400 "Введите корректный email" | ✅ |
| ADM-13 | admin `GET /api/products/not-uuid` | 400 Russian | **500 English** | ❌ → BUG-REG-071 |
| ADM-16 | admin `PATCH /api/stores/not-uuid` | 400 Russian | **500 English** | ❌ → BUG-REG-071 |
| ADM-19 | admin `POST /api/auth/invites` bad role | 400 Russian | 400 "Роль должна быть admin или operator" | ✅ |
| OPR-01 | operator `GET /api/users` | 403 Russian | 403 "Недостаточно прав" | ✅ |
| OPR-03 | operator `POST /api/stores` | 403 Russian | 403 "Недостаточно прав" | ✅ |
| OPR-04 | operator `GET foreign-store` | 403 Russian | 403 "Нет доступа к магазину" | ✅ |
| OPR-05 | operator `GET /api/logs/global` | 403 Russian | 403 "Недостаточно прав" | ✅ |
| OPR-06,07 | operator `POST /api/products` bad body | 400 Russian | 400 "PLU товара обязателен..." | ✅ |
| SPA-1..10 | curl `/login` `/dashboard` etc. | HTML shell `lang="ru"` Russian title | All 10 paths identical 13-line shell with `<html lang="ru">` + `<title>Администратор весов</title>` | ✅ |
| F-buttons | frontend button text | all Russian | sample of 10 buttons all Russian | ✅ |
| F-confirm | window.confirm calls | all Russian | 3/3 Russian | ✅ |
| F-loading | loading state text | all Russian | 5 patterns Russian | ✅ |

## Closure

§7.1 complete. 1 medium bug filed (BUG-REG-071) added to deferred-hotfix-batch (now 4 medium: 068 timing-leak, 069 banner-FK, 070 concurrent-publish, **071 prisma-invalid-uuid**). 0 high, 0 critical. Wave 7 §7.1 verdict: ✅ PASS — i18n broad coverage Russian; the only English leakage is framework-default fallthroughs (1 deliberate-bug filed, 1 documented as defense-in-depth backlog per brief).
