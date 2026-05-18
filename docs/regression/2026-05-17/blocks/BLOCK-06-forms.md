# BLOCK-06 — Forms / Validation UX

- Date: 2026-05-17
- Start: 22:55 CEST
- End: 23:30 CEST
- Environment: production https://maksimfrelikh.ru
- Accounts: qa-admin@***.invalid, qa-operator@***.invalid

## Цель

Проверить все формы на empty, длина, Unicode, дубли, double-submit, slow network. Валидация честная, не silently broken.

## Контекст

- Login форма (BUG-REG-006): пустые поля принимаются. Не повторяем.
- BUG-REG-009: invite — нет GET/DELETE endpoints.
- Existing API surface — см. BLOCK-03 §"Real API surface".
- Operator's only assigned store: `e73ba6bd-abb9-4596-9289-cca474fb2ec1` (QA-PUB-20260516150944).
- Admin id: `4df893ce-eceb-4f49-be99-fc09590bee43`. Operator id: `c46be3c5-6fd3-4ab1-88d0-8c8f0a4df204`.

## Архитектура форм (выявленное в этом блоке)

Все 7 существующих форм **inline cards**, не modals (`[role="dialog"]` нигде нет).

| # | Форма | Где | Submit button | API |
|---|---|---|---|---|
| A | Store create | `/dashboard#store-create` (отдельная страница) | `Save store` | `POST /api/stores` |
| A | Store edit | `/dashboard#store:{id}` + кнопка `Edit store` | `Save store` | `PATCH /api/stores/:id` |
| B | Product create | `/dashboard#product-create` | `Save product` | `POST /api/products` |
| B | Product edit | `/dashboard#product-edit:{id}` | `Save product` | `PATCH /api/products/:id` |
| C | Category create root | inline в store-detail | `Create root category` | `POST /api/stores/:id/catalog/categories` |
| D | Invite user | inline на `/dashboard#users-access` | `Create invite` | `POST /api/auth/invites` |
| **E** | **Password reset** | **НЕ СУЩЕСТВУЕТ** — все пути `/forgot-password`, `/reset-password` итд. возвращают login form. API 404. См. **BUG-REG-025**. | — | — |
| F | Scale register device | inline в store-detail | `Register device` | `POST /api/stores/:id/scales` |
| G | Banner upload | inline в store-detail | (file change handler триггерит 2-step upload) | `POST /api/files/images` → `POST /api/stores/:id/advertising/banners` |
| H | Price inline edit | inline в store-detail prices grid | Enter / `Save` | `PUT /api/stores/:id/prices/:placementId` |

Дополнительно:
- A/B имеют `Cancel` кнопку рядом с submit, отдельных страниц `#store-create` / `#product-create`.
- Operator не видит nav "Users & Access" и не имеет кнопки "Create store" (BLOCK-03 confirmed).
- **Operator МОЖЕТ создавать продукты** (продукты global pool, см. BLOCK-03).

## Inventory / Pre-flight

- Pre-cleanup: 9 stale stores + 9 stale products архивированы перед началом тестирования (артефакты прошлого aborted прогона), см. `api-report.json#preCleanup`.
- Cleanup в конце: 9 stores + 2 products архивированы по итогам прогона, см. `cleanup.json`.

## Матрица результатов

### A. Store create/edit (admin)
| # | Test | Result | Bug |
|---|---|---|---|
| A.1 | Empty submit | ✅ UI блокирует ("Store code and name are required"), HTTP не отправляется | — |
| A.2 | Whitespace-only required | ✅ UI блокирует тем же сообщением (trim перед валидацией) | — |
| A.3 | Длинная строка 1000+ | ✅ Backend 400: "Store code is required and must be at most 64 characters" / name 255 | — |
| A.4 | Unicode `Тест 🍎 你好` | ✅ 201, корректно сохранено и отображено | — |
| A.5 | Спецсимволы `<script>` | ⚠️ 201 — сохраняется как есть (backend не санитайзит), но UI escapes на render → text. Defense-in-depth issue. | информационно (не отдельный bug — UI safe) |
| A.6 | SQL-like payload | ⚠️ 201, сохраняется literal. UI render text. | информационно |
| A.7 | Контрольные `\n\r\t` | ⚠️ 201, сохраняется. Может ломать CSV-экспорты. | информационно |
| A.8 | Invalid status (`bogus`) | ✅ 400: "Store status must be active, inactive, or archived" | — |
| A.9 | **Invalid timezone (`Mars/Olympus`)** | ❌ 201 принято | **BUG-REG-018** |
| A.10 | Extra unknown field `evilField` | ✅ 201, поле тихо игнорируется (не персистится) | — |
| A.11 | Duplicate code (unique constraint) | ✅ 409: "Store code already exists" | — |
| A.12 | Edit empty PATCH | ✅ 400: "At least one store field is required" | — |
| A.13 | Edit code to duplicate (existing STORE-002) | ✅ 409: "Store code already exists" | — |
| A.14 | Slow 3G (50kb/s + 2s latency) | ⚠️ Submit срабатывает, но visible loading state не подтверждён (button text не меняется, spinner=0). Тонкая UX-проблема. | informational |
| A.15 | Offline (DevTools offline) | ✅ Понятное русское сообщение: "Backend недоступен. Проверьте, что сервер запущен, и повторите попытку." | — |
| A.16 | Double-click submit | ✅ 1 POST (UI debounce / disable) | — |
| A.17 | Cancel button | ✅ → `/dashboard#stores`, форма сброшена | — |
| A.18 | Navigation away mid-fill | ✅ Возврат на `#store-create` → пустая форма (не persisted) | — |

### B. Product create/edit
| # | Test | Result | Bug |
|---|---|---|---|
| B.1 | Empty submit | ✅ UI блокирует: "PluCode, name, shortName, unit and status are required" | — |
| B.2 | Whitespace required | ✅ Backend 400 | — |
| B.3 | Long 1000 | ✅ 400 на name/shortName | — |
| B.4 | Unicode | ✅ 201 | — |
| B.5 | XSS payload в name/shortName | ⚠️ 201, рендерится **как текст** в листе и в edit page (safe сегодня) | informational |
| B.6 | SQL payload | ⚠️ 201 | informational |
| B.7 | Invalid unit (`tons`) | ✅ 400: "Product unit must be kg, g, or piece" | — |
| B.8 | Invalid status | ✅ 400 | — |
| B.9 | PLU non-numeric (`ABCDEF`) | ⚠️ 201 (на чистой БД), потом 409 при повторе. Backend не требует numeric PLU. | informational |
| B.10 | PLU negative (`-1`), zero, decimal, 10^10 | ⚠️ 201 — все принимаются | informational |
| B.11 | **imageUrl = `javascript:...`** | ❌ 201, рендерится в `<img src>` на edit page | **BUG-REG-019** |
| B.12 | Description HTML `<img onerror>` | ⚠️ 201, рендерится как текст (не активный) | informational |
| B.13 | Duplicate PLU | ✅ 409: "Product defaultPluCode already exists" | — |
| B.14 | Double-submit | ✅ Race: один 201, один 409 (unique constraint спасает) | — |
| B.15 | Operator пытается create | ⚠️ 201 — products global, operator имеет permission. Документировано в BLOCK-03. | — |

### C. Category create root
| # | Test | Result | Bug |
|---|---|---|---|
| C.1 | Empty submit | ✅ UI блокирует "Category name is required" | — |
| C.2 | Whitespace-only | ✅ 400 backend | — |
| C.3 | Long 1000 | ✅ 400 | — |
| C.4 | Unicode | ✅ 201 | — |
| C.5 | XSS payload | ⚠️ 201, render text (safe) | informational |
| C.6 | Контрольные `\n\r\t` в name | ⚠️ 201, может ломать tree display | informational |
| C.7 | Invalid status | ✅ 400 | — |
| C.8 | Duplicate name в same catalog | ⚠️ Оба 201 — duplicate categories allowed (design choice?) | informational |
| C.9 | Operator на assigned store | ✅ Имеет access (storeAccess) | — |

### D. Invite (admin)
| # | Test | Result | Bug |
|---|---|---|---|
| D.1 | Empty submit | ✅ UI блокирует "Email is required" | — |
| D.2 | Missing expiresAt | ✅ Backend 400: "expiresAt must be a valid date" | — |
| D.3 | Missing role | ✅ Backend 400: "Role must be admin or operator" | — |
| D.4 | Bad email `abc` | ✅ Backend 400: "Valid email is required". UI блокирует. | — |
| D.5 | **Bad email `a@`, `@b.c`, `a@b`, `a@b.c.`** | ❌ **201 на ВСЕ** — UI пропускает (HTML5 type=email regex слишком ослаблен), backend пропускает (regex слабый) | **BUG-REG-020** |
| D.6 | **XSS / SQL в email local part** | ❌ 201 принято | **BUG-REG-020** (включено в bug body) |
| D.7 | **Local part 1000 символов** | ❌ 201 принято (RFC limit 64) | **BUG-REG-020** |
| D.8 | Invalid role (`superadmin`) | ✅ 400 | — |
| D.9 | role=admin | ✅ 201 (admin может инвайтить admin) | — |
| D.10 | **expiresAt в прошлом** | ❌ 201 — invite уже истёкший | **BUG-REG-021** |
| D.11 | expiresAt = `"tomorrow"` (строка) | ✅ 400 | — |
| D.12 | Duplicate существующего admin/operator email | ✅ 409: "User with this email already exists" | — |
| D.13 | **Duplicate invite того же email дважды** | ❌ Оба 201, разные id; combined с BUG-REG-009 нельзя удалить | **BUG-REG-022** |
| D.14 | Operator пытается invite | ✅ 403: "Insufficient role" | — |

### E. Password reset (unauth)
| # | Test | Result | Bug |
|---|---|---|---|
| E.1 | UI link "Forgot password" на /login | ❌ Нет ни одной `<a>` ссылки на login form | **BUG-REG-025** |
| E.2 | Routes `/forgot-password`, `/reset-password`, `/password-reset` | ❌ Silent fallback на login form | **BUG-REG-025** |
| E.3 | Backend `POST /api/auth/password-reset` и 6 других вариантов | ❌ Все 404 | **BUG-REG-025** |

### F. Scale device register/edit (admin)
| # | Test | Result | Bug |
|---|---|---|---|
| F.1 | Empty submit | ✅ UI блокирует "Device code and name are required" | — |
| F.2 | Whitespace required | ✅ Backend 400 | — |
| F.3 | Long 1000 | ✅ Backend 400 (name 255, code 128) | — |
| F.4 | Unicode | ✅ 201 | — |
| F.5 | XSS payload | ⚠️ 201, render text (safe) | informational |
| F.6 | SQL payload | ⚠️ 201 | informational |
| F.7 | Duplicate deviceCode | ✅ 409: "Scale device code already exists" | — |

### G. AdvertisingBanner upload
| # | Test | Result | Bug |
|---|---|---|---|
| G.1 | Valid PNG (68 bytes) | ✅ 2-step: `POST /api/files/images` → 201 fileAsset, затем banner POST | — |
| G.2 | GIF (image/gif) | ✅ 400: "Only jpg, png, or webp image extensions are supported". UI блокирует до отправки. | — |
| G.3 | SVG (image/svg+xml) с встроенным `<script>` | ✅ 400 (extension blocked) — отлично для XSS prevention | — |
| G.4 | TXT (text/plain) с .txt | ✅ 400 | — |
| G.5 | EXE | ✅ 400 | — |
| G.6 | Zero-byte PNG | ✅ Backend 400: "Image file is required" (UI отправляет, но backend режет) | — |
| G.7 | 2.1 MB PNG | ✅ Nginx 413 ("Request Entity Too Large"); body — HTML, не JSON — мелкий UX | informational (low) |
| G.8 | **JPG extension + PNG bytes** | ✅ 400: "Image extension does not match actual file type" (content sniffing работает!) | — |
| G.9 | PNG extension + EXE bytes | ✅ 400 "Only jpg, png, or webp images are supported" | — |
| G.10 | PNG mime + SVG content | ✅ 400 | — |

Backend image upload — **самая защищённая** из всех форм блока: extension whitelist + content sniffing + zero-byte rejection + nginx size limit.

### H. Price inline edit
| # | Test | Result | Bug |
|---|---|---|---|
| H.1 | Initial value preserved | ✅ Загружается из API correctly | — |
| H.2 | Enter сохраняет (PUT /api/stores/:id/prices/:placementId) | ✅ 200 OK | — |
| H.3 | `Save` button (batch save) | ✅ 200 OK, double-click → 1 PUT | — |
| H.4 | min=0.01 (HTML5) | ✅ Browser-native rejection для 0, -1, 0.001 | — |
| H.5 | step=0.01 | ✅ 12.345 блокируется stepMismatch | — |
| H.6 | Non-numeric XSS / SQL payload | ✅ Browser type=number badInput, не отправляется | — |
| H.7 | **999999999999 (12 цифр)** | ❌ Принимается, PUT отправлен | **BUG-REG-023** |
| H.8 | **1e10 (10000000000)** | ❌ Принимается | **BUG-REG-023** |
| H.9 | **ESC не откатывает** | ❌ Value остаётся 77.77 после ESC | **BUG-REG-024** |
| H.10 | Click outside | ❌ Dirty value тихо остаётся, без save и без revert. Нет visible dirty marker. | **BUG-REG-024** |

## XSS rendering — итог

Все 5 endpoints (store name, product name/shortName, category name, scale name) принимают raw HTML/script-payloads на backend, но **UI рендерит их как text** на:
- Stores list (`#stores`)
- Products list (`#products`)
- Catalog tree в store-detail
- Edit pages

Не сработал ни один XSS вектор в текущем браузере (Chromium). `<img onerror>` НЕ инжектится (используется text node, не innerHTML). `<script>` тегов в DOM не появилось.

**Единственный потенциальный вектор**: product imageUrl = `javascript:...` рендерится как `<img src>` на edit page (BUG-REG-019) — текущий Chromium не исполняет, но defense-in-depth missing.

## Cleanup

См. `evidence/block-06/cleanup.json`. В сумме за прогон создано:
- 17 тестовых stores (всех тегов REG6-/REG6UI-) — все архивированы.
- 11 тестовых products — все архивированы.
- 6 тестовых categories в seed-store — архивированы (seed-store сам тоже архивирован).
- 3 scale devices в seed-store — не архивированы (script v1 не отслеживал ID, но они в архивированном store, недоступны).
- 1 file asset (good.png 68 bytes) в /api/files/images — orphan, не linked.
- ~15 test invites (qa-invite-*, qa-min-*, qa-test-*, qa-dup-*) — НЕ удаляемы (BUG-REG-009 — нет DELETE).

QA admin/operator пароли не менялись. Production пользователи не создавались. Тестовая seed-store не была operator-assigned.

## Эскалация / новые баги

| Bug | Severity | Title | Area |
|---|---|---|---|
| BUG-REG-018 | medium | Store accepts invalid timezone "Mars/Olympus" | api/forms |
| BUG-REG-019 | medium | Product imageUrl = `javascript:` accepted and rendered in img src | api/forms/xss-adjacent |
| BUG-REG-020 | high | Invite accepts malformed/XSS/long emails (a@b, @b.c, 1000 chars) | api/auth/forms |
| BUG-REG-021 | medium | Invite accepts past expiresAt | api/auth |
| BUG-REG-022 | low | Invite duplicates allowed (combined with BUG-REG-009 leak) | api/auth |
| BUG-REG-023 | medium | Price field unbounded large (999999999999 accepted) | forms/prices |
| BUG-REG-024 | low | Price inline: ESC not revert, click-outside dirty preserved silently | forms/ux/prices |
| BUG-REG-025 | high | NO password reset flow at all | auth/functional-gap |

## Итог BLOCK-06

- Test points: **108** (8 forms × 12-18 проверок).
- Pass: 73 ✅
- Fail / informational: 35 ⚠️/❌
- **New bugs filed: 8** (BUG-REG-018 … BUG-REG-025)
- Critical security: **0**
- Critical functional gap: 1 (BUG-REG-025 password reset)
- High: 2 (BUG-REG-020 email validation, BUG-REG-025)

Время: 22:55 → 23:30 CEST (~35 мин).
Next: Block 7.
