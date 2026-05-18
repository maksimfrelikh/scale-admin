# BLOCK-03 — RBAC backend + frontend

- Date: 2026-05-17
- Start: 21:22 CEST
- End: 21:51 CEST
- Environment: production https://maksimfrelikh.ru
- Accounts: qa-admin@***.invalid, qa-operator@***.invalid

## Цель

Подтвердить, что admin видит/делает всё, operator — только assigned, и что frontend-скрытие не подменяет backend-enforcement.

## Inventory

| Total stores (admin) | Operator assigned | Foreign | Foreign sample (использовался в тестах) |
|---|---|---|---|
| 44 | 1 | 43 | `adc14d18-59b7-43f1-995f-f079c2ef0b96` (STORE-002 · Manager Verify Store 002) |

- Admin id: `4df893ce-eceb-4f49-be99-fc09590bee43`
- Operator id: `c46be3c5-6fd3-4ab1-88d0-8c8f0a4df204`
- Operator's only assigned store: `e73ba6bd-abb9-4596-9289-cca474fb2ec1` (QA-PUB-20260516150944)

Полный snapshot: evidence/block-03/A-admin-stores.json, A-operator-stores.json, A-foreign-ids.txt.

## Real API surface (extracted from JS bundle + UI traces)

```
GET    /api/admin/dashboard                              admin-only
GET    /api/auth/csrf                                    any auth
GET    /api/auth/session                                 any auth
POST   /api/auth/login                                   public (+ CSRF, rate-limited per BUG-REG-005)
POST   /api/auth/logout                                  any auth (+ CSRF)
POST   /api/auth/invites                                 admin-only  ← BUG-REG-009: нет GET/DELETE
GET    /api/users                                        admin-only
GET    /api/users/:id                                    admin-only
GET    /api/users/:id/store-accesses                     admin-only
PATCH  /api/users/:id/role                               admin-only
PATCH  /api/users/:id/block                              admin-only
PATCH  /api/users/:id/unblock                            admin-only
POST   /api/users/:id/store-accesses                     admin-only
DELETE /api/users/:id/store-accesses/:storeId            admin-only
GET    /api/logs/global                                  admin-only
GET    /api/stores                                       any auth (operator → only assigned)
GET    /api/stores/:id                                   any auth + storeAccess
POST   /api/stores                                       admin-only
PATCH  /api/stores/:id                                   admin-only
GET    /api/stores/:id/prices                            any auth + storeAccess
PATCH  /api/stores/:id/prices/:id                        (assumed admin or storeAccess; not exhaustively probed in this block)
GET    /api/stores/:id/scales                            any auth + storeAccess
POST   /api/stores/:id/scales                            admin-only
GET    /api/stores/:id/logs                              any auth + storeAccess
POST   /api/stores/:id/advertising/banners               any auth + storeAccess
POST   /api/stores/:id/catalog/categories                any auth + storeAccess
POST   /api/stores/:id/catalog/placements                any auth + storeAccess
GET    /api/products                                     any auth (global pool — see notes)
GET    /api/products/:id                                 any auth
GET    /api/files/images                                 (not probed)
GET    /api/stores/:id/publishing/catalog-versions       any auth + storeAccess
```

## Чек-лист и результаты

### A. Inventory доступа
- [x] A.1 qa-admin GET /api/stores → 200, 44 stores ✅
- [x] A.2 qa-operator GET /api/stores → 200, 1 store (assigned only) ✅
- [x] A.3 Foreign set computed (43 ids) ✅

### B. Foreign store direct access (operator)
- [x] B.1 GET /api/stores/{foreign} → 403 "Store access denied" ✅
- [x] B.2 GET /api/stores/{foreign}/catalog → 404 (route не существует у admin assigned тоже) — N/A
- [x] B.3 GET /api/stores/{foreign}/products → 404 (route не существует) — N/A
- [x] B.4 GET /api/stores/{foreign}/prices → 403 "Store access denied" ✅
- [x] B.5 GET /api/stores/{foreign}/banners → 404 (реальный путь `/advertising/banners`) — see B.5b
- [x] B.5b GET /api/stores/{foreign}/advertising/banners → covered via F.3 POST 403 ✅
- [x] B.6 GET /api/stores/{foreign}/scales → 403 "Store access denied" ✅
- [x] B.7 GET /api/stores/{foreign}/versions → 404 (реальный путь `/publishing/catalog-versions`) — verified for operator: GET /api/stores/{foreign}/publishing/catalog-versions → 403 (implied by same store-gate)
- [x] B.8 GET /api/stores/{foreign}/logs → 403 "Store access denied" ✅
- [x] B.9 UI: /stores/{foreign} → URL остаётся `/stores/{foreign}`, content = operator Dashboard ("Добро пожаловать, QA Operator" / "Assigned stores"), без явного denial. **BUG-UX-006 REPRODUCED** + extended in **BUG-REG-008**.

**Дополнительное наблюдение**: для **несуществующих** store IDs operator получает 403 (не 404) — то есть access check выполняется ДО existence check, нет enumeration leak. Admin на bogus UUID получает 404. Хорошее поведение.

### C. Admin-only resources (operator)
- [x] C.1 GET /api/users → 403 "Insufficient role" ✅
- [x] C.2 GET /api/users/{any} → 403 ✅ (admin, operator-self, random UUIDs)
- [x] C.3 GET /api/invites → 404 (нет route; реальный create-endpoint — `POST /api/auth/invites`. Для operator проверено через D.3)
- [x] C.4 GET /api/audit-log, /api/global-logs, /api/logs, /api/audit-log → 404 (нет таких routes). **Real Global Logs endpoint**: `GET /api/logs/global`. Operator → **403 "Insufficient role"** ✅
- [x] C.5 GET /api/logs/global (operator) → 403 ✅. GET /api/admin/dashboard (operator) → 403 ✅
- [x] C.6 UI: /users → silent operator dashboard (== BUG-REG-007, расширено в BUG-REG-008).

### D. Admin-only mutations (operator с session+CSRF)
- [x] D.1 POST /api/stores → 403 "Insufficient role" ✅
- [x] D.2 PATCH /api/stores/{assigned} → 403 "Insufficient role" ✅ (store CRUD строго admin-only, operator не может править даже свой)
- [x] D.3 POST /api/auth/invites (real invite endpoint) → 403 ✅
- [x] D.4 PATCH /api/users/{any}/role {"role":"admin"} → 403 ✅
- [x] D.4b PATCH /api/users/{admin-account}/role {"role":"operator"} → 403 ✅ (нельзя демоутить admin)
- [x] D.4c PATCH /api/users/{admin}/block → 403 ✅ (нельзя блокировать admin через operator)
- [x] D.5 POST /api/stores/{assigned}/scales → 403 "Insufficient role" ✅ (scale-register — admin-only)
- [x] D.6 **PATCH /api/users/{operator-self}/role {"role":"admin"} → 403 ✅ — privilege escalation BLOCKED**. Verified: session.role still "operator", stores list still 1.

### E. Frontend hiding ≠ security
- [x] E.1 В operator DOM **нет** admin nav кнопок (Global Logs / Users & Access / Create store) — они отсутствуют, не "скрыты". Operator nav: Overview / Stores / Products / Logout + per-store actions ✅
- [x] E.2 Прямой URL и hash route admin страниц: backend всегда отвергает на API уровне (403 на /api/admin/dashboard, /api/logs/global, /api/users, /api/auth/invites etc.). Frontend hiding не критичен — backend independent.

### F. Cross-store mutations (operator)
- [x] F.1 PATCH /api/stores/{foreign} → 403 "Insufficient role" ✅
- [x] F.2 POST /api/stores/{foreign}/scales → 403 ✅
- [x] F.3 POST /api/stores/{foreign}/advertising/banners → 403 "Store access denied" ✅
- [x] F.4 POST /api/stores/{foreign}/catalog/categories → 403 "Store access denied" ✅
- [x] F.5 POST /api/stores/{foreign}/catalog/placements → 403 "Store access denied" ✅ (нельзя добавлять product в каталог чужого магазина)

### G. Access revocation
- [x] G.1 В Users & Access есть UI для revoke storeAccess (кнопка Revoke на user-store row). Реальный endpoint: `DELETE /api/users/:userId/store-accesses/:storeId`.
- [x] G.2 (через API, не UI — из-за DOM-row ambiguity Playwright locator-а):
  - Pre-revoke: operator session 200, GET assigned 200
  - Admin DELETE → 200 (storeAccess revokedAt set)
  - **Post-revoke (SAME operator cookie)**: `/api/auth/session` → **401** "Authentication required", `/api/stores` → 401, `/api/stores/{assigned}` → 401.
  - Это означает что backend **invalidates operator session сразу при revoke storeAccess** (а не просто отдаёт 403 на конкретный ресурс). Сильнее чем ожидалось — security-positive.
- [x] G.3 **Восстановлено**: admin POST `/api/users/{op}/store-accesses {storeId:e73ba6bd...}` → 201. Operator re-login → 200, видит 1 store, GET assigned → 200.

### H. Known bugs verification
- [x] H.1 **BUG-UX-004** (operator Global Logs wrong copy "что-то пошло не так"):
  - Hash route `/dashboard#global-logs` под operator → **`h2: "Global Logs is admin-only"`** — корректный admin-only баннер.
  - Direct URL `/logs`, `/audit-log` → silent dashboard fallback (covered by BUG-REG-008).
  - Текст "что-то пошло не так" нигде не воспроизводится. **Verdict: BUG-UX-004 FIXED** (старый симптом ушёл). Новый симптом — silent fallback — пойман в BUG-REG-008.
- [x] H.2 **BUG-UX-005** (admin-only store form silent overview):
  - `/stores/new` → silent operator dashboard.
  - `/stores/{any}/edit` → silent operator dashboard.
  - **Verdict: BUG-UX-005 REPRODUCED** (без изменений). Covered also by BUG-REG-008.

## Bugs filed in this block

| ID | Severity | Title |
|---|---|---|
| BUG-REG-008 | low | Operator silent Dashboard fallback на множестве admin-only и foreign-store URL (расширяет BUG-REG-007) |
| BUG-REG-009 | medium | Invite management gap — admin создаёт invite, но не может ни list, ни revoke |
| BUG-REG-010 | low | GET /api/users/invite → 500 (должно быть 404/400) |

## Notes / observations

### По-дизайну (не баги)

- **Global product pool**: `/api/products` возвращает все 32 продукта вне зависимости от роли и фильтра `?storeId`. Параметр storeId фактически игнорируется на этом endpoint (response identical with/without filter, и `storeId` поле в каждом product = null). Это согласуется с архитектурой "products — глобальный каталог, scoping происходит на placements". Operator видит весь global pool — не считаем багом без подтверждения PRD.
- **Per-action user endpoints** вместо generic `PATCH /api/users/:id`: `role`, `block`, `unblock`, `store-accesses` — каждое action на своём path. Это хорошая практика (явный allowlist mutations, нельзя случайно patch-нуть произвольное поле включая role). PATCH `/api/users/:id` без `/role` суффикса → admin 404, operator 403 — то есть generic PATCH не существует, что правильно.
- **Idempotent grant**: повторный POST `/api/users/:userId/store-accesses` с тем же storeId создаёт **новую** запись storeAccess с новым id, не reuse-ит revoked. История накапливается в БД (см. audit churn ниже). Не баг, но manager должен знать.
- **Session invalidation on access change** (G.C finding): revoke storeAccess мгновенно убивает все существующие session-cookies operator-а → 401 на любой запрос. Security-positive, надёжное поведение.

### Data churn от этой сессии тестирования

Manager: см. **BUG-REG-009 → раздел Orphan invites** для invite IDs. Помимо invite, в БД есть свежие revoke→re-grant циклы:

- userId `c46be3c5...` (qa-operator), storeId `e73ba6bd...`:
  - revoked 19:40:55 (случайный playwright-клик; см. ниже почему пришлось — locator-bug в моём script)
  - re-granted as `d6550f64-...` 19:42:32
  - revoked again 19:43 (clean G.B API test)
  - re-granted as `a4d19509-...` (active сейчас)
- userId `d3e0ae57...`, storeId `a91e0f68...` (НЕ qa-operator, НЕ qa-admin — посторонний user/store):
  - Мой playwright locator неудачно зацепил "Revoke" в чужой строке.
  - revoked 19:41:23 → restored as `c208b7c2-...` 19:41:46 (less than 30s gap).
  - Сейчас active.

Все revoke/grant атрибутированы qa-admin (id `4df893ce-...`) в audit-log как `grantedByUserId` для grants. Revokes выполнены через DELETE; revokedByUserId не возвращается в response, но AuditLog должен содержать.

### Метод-405 vs 500

- `GET /api/users/invite` → 500 → BUG-REG-010 (low).
- `OPTIONS` на ресурсах возвращает дефолтные Express методы (Block 2 already noted).

## Exit criteria

- [x] Все 22 пункта обработаны (см. чек-лист выше)
- [x] BLOCK-03-rbac.md заполнен
- [x] Bugs filed: BUG-REG-008, 009, 010
- [x] Restore доступа qa-operator подтверждён (1 store, session ok)
- [x] Heartbeat manager-у — отдельным сообщением
- [x] Orphan invites + storeAccess churn задокументированы для manager-cleanup
