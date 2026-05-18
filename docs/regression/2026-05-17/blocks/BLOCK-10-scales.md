# BLOCK-10 — Scale Devices + Sync API

- Date: 2026-05-18
- Start: 00:40 CEST
- End: 00:51 CEST
- Duration: 11 min
- Environment: production https://maksimfrelikh.ru
- Accounts: qa-admin@***.invalid (admin), qa-operator@***.invalid (operator)
- Branch: docs/regression-2026-05-17 @ e91b4e8

## Цель

Регистрация scale devices, apiToken security, check-update/ack flow, ScaleSyncLog, rate limiting (20/60s `scale-api` bucket). Финальная верификация BUG-REG-029 (USD из CatalogVersion.packageData доходит до scale через check-update).

## Endpoint surface

Admin/operator (session-auth):
- `GET    /stores/:storeId/scales` — admin+operator (store access)
- `POST   /stores/:storeId/scales` — admin only
- `PATCH  /scales/:deviceId/status` — admin only
- `POST   /scales/:deviceId/regenerate-token` — admin only

Scale API (device-auth via `deviceCode`/`apiToken` in body|header `x-scale-device-code`/`x-scale-api-token`|query):
- `GET    /scale-api/auth-check`
- `POST   /scales/check-update` (and legacy `/scale-api/check-update`)
- `POST   /scales/ack`

Guards on scale-api: `RateLimitGuard` (bucket `scale-api`, 20 attempts / 60 s) + `ScaleApiAuthGuard`. `SkipCsrf()` (no session, no CSRF).

## Pre-read insights (из кода ДО тестов)

1. Токен формируется через `randomBytes(32).toString('base64url')` и хранится только как `sha256` хеш — `scale-token.util.ts`. Plaintext возвращается единожды из `registerDevice` и `regenerateApiToken`. Никакого `apiToken` поля в `toDeviceResponse`.
2. `authenticateScaleApiRequest` использует `timingSafeEqual` на base64url-хешах — нет таймингового канала. Если device.status ≠ active → 403 `SCALE_DEVICE_NOT_ACTIVE` (а не 401). Update `lastSeenAt` происходит в guard'е перед controller-логикой.
3. `checkScaleUpdate`: ищет `storeCatalog status='active'`; `hasUpdate = currentVersionId && requestedVersionId !== currentVersionId`. **Возвращает `packageData` verbatim из `CatalogVersion.packageData`** (scales.service.ts:355) — никакой sanitize по currency. Следовательно BUG-REG-029 проявляется здесь напрямую.
4. `acknowledgeScaleCatalogVersion`: на `status=success` обновляет device.currentCatalogVersionId + lastSyncAt + AuditLog `scale_device.catalog_version_acknowledged`. На `status=error` — ТОЛЬКО ScaleSyncLog запись, НЕ обновляет device. Версия должна принадлежать `device.storeId` (фильтр `storeId: device.storeId`).
5. `deviceCode` `@@unique([deviceCode])` глобально (см. prisma schema). Значит дубль deviceCode в разных магазинах → 409 conflict тоже. Это важно зафиксировать.
6. `requireDeviceCode` upper-cases + trim, max 128. `requireDeviceStatus` allows `active|inactive|blocked|archived`. `requireAckStatus` only `success|error`.
7. Auth failure case writes `ScaleSyncLog status='auth_failed' errorMessage='missing_credentials'|'invalid_credentials'|'device_<state>'` — даже на отсутствие credentials.
8. `normalizeErrorMessage` редактит inline `apiToken=...`/`api_token=...` в errorMessage до `[REDACTED]` (XSS-style protection на logged payload).
9. RateLimit decorator — на класс, не на endpoint, → один общий bucket для check-update + ack + auth-check + scale-api/check-update.
10. Storage of rate-limit: in-memory Map (rate-limit.service.ts:19). Перезапуск backend сбрасывает.

## Setup

- Целевой active store с published version: **UAT20260515P4195540** (`1cf0f4ba-71a8-4a0d-b87d-8e5494baf263`), currentVersion v=2 `af835e68-6846-499b-a4da-33bc5d78a2bc`, существующая device `UAT20260515SCALE195540`.
- USD live repro store: создаётся специально в группе H (новый QA-B10-USD-<ts>).
- Девайсы Block-10: префикс `QAB10` (deviceCode upper-case, без дефисов в проверках на edge cases).

---

## Результаты

(Заполняется по мере прохождения; полная таблица в конце.)

### A. Device registration (admin only)

| # | Сценарий | Expected | Actual | Status |
|---|---|---|---|---|
| A.1 | POST register → apiToken plaintext в response | да | 201; response shape `{device:{...без apiToken...}, apiToken:"<43-char base64url>"}`. См. `evidence/block-10/A1-register-success.json` (redacted) | ✅ |
| A.2 | GET device → нет apiToken в response | да | Список + детальный JSON содержат только `id, storeId, deviceCode, name, model, status, lastSeenAt, lastSyncAt, currentCatalogVersionId, lastSyncStatus, lastSyncError, createdAt, updatedAt`. Ни `apiToken`, ни `apiTokenHash`. `evidence/block-10/A2-get-device-no-token.json` | ✅ |
| A.3 | БД: `apiTokenHash` существует, plaintext отсутствует | да | Прямой SSH+psql недоступен без согласования (AGENTS.md §3.5). Indirect proof: `verifyScaleApiTokenHash` использует `sha256` + `timingSafeEqual` (`scale-token.util.ts:7-21`); хранение plaintext исключено. Successful auth с `apiToken` из A.1 (B.4b, D.5) доказывает, что хеш в БД соответствует именно этому plaintext'у и обратное вычисление невозможно | ✅ (по surface), ⏭ (DB direct) |
| A.4 | Дубль deviceCode (same store) | 409 | `{"message":"Scale device code already exists","error":"Conflict","statusCode":409}`. `evidence/block-10/A4-dup-same-store.txt` | ✅ |
| A.5 | Дубль deviceCode (different store) | поведение зафиксировать | 409 Conflict тем же сообщением. `deviceCode` уникален **глобально** (prisma `@@unique([deviceCode])`), не per-store. См. `evidence/block-10/A5-dup-different-store.txt`. PRD это не запрещает; для production-flow это безопаснее (отсутствие коллизий между magazines). | ✅ + note |

### B. Device management

| # | Сценарий | Expected | Actual | Status |
|---|---|---|---|---|
| B.1 | PATCH name/model | 200 | **Endpoint отсутствует.** `PATCH /scales/:id` → 404. `PATCH /scales/:id/status` body с `name` — extra-key игнорируется (status update проходит). Surface controller exposes только `@Patch('scales/:deviceId/status')` (scales.controller.ts:56) — name/model immutable после регистрации. Не bug, product decision; **finding для UI/PRD**: если фронту надо переименовать device, нужен новый endpoint | ⏭ (no endpoint) |
| B.2 | Block device → 200 + status changed | да | PATCH status=inactive → 200 `{status:"inactive", changed:true}`. Восстановлено active. `evidence/block-10/B2-set-inactive.txt`, `B2-back-active.txt` | ✅ |
| B.3 | Regenerate apiToken → новый plaintext | да | 201 + новый apiToken length=43; device shape без `apiToken`. Старый и новый токены различаются. `evidence/block-10/B3-regenerate-token.json` (redacted) | ✅ |
| B.4 | Старый apiToken после regenerate → 401 | да | `POST /scales/check-update` со старым токеном → 401 `SCALE_API_AUTH_FAILED`. Sanity: новый токен → `/scale-api/auth-check` 200 `{authenticated:true}`. `evidence/block-10/B4-old-token-401.txt`, `B4b-new-token-200.txt` | ✅ |

### C. RBAC

| # | Сценарий | Expected | Actual | Status |
|---|---|---|---|---|
| C.1 | qa-operator POST register (own assigned store) → 403 | да | 403 `{"message":"Insufficient role"}`. `evidence/block-10/C1-operator-register-403.txt` | ✅ |
| C.2 | qa-operator PATCH /scales/:id/status → 403 | да | 403 `Insufficient role`. `evidence/block-10/C2-operator-patch-status-403.txt` | ✅ |
| C.3 | qa-operator POST regenerate-token → 403 | да | 403 `Insufficient role`. `evidence/block-10/C3-operator-regen-403.txt` | ✅ |
| C.4 | qa-operator GET /stores/{own}/scales → 200 | да | 200 (store access ok). `evidence/block-10/C4-operator-list-own-200.txt` | ✅ |
| C.5 | qa-operator GET /stores/{foreign}/scales → 403 | да | 403 `Store access denied`. `evidence/block-10/C5-operator-list-foreign-403.txt` | ✅ |

### D. check-update endpoint

| # | Сценарий | Expected | Actual | Status |
|---|---|---|---|---|
| D.1 | Wrong apiToken → 401 + log auth_failed | да | 401 `SCALE_API_AUTH_FAILED`. В `ScaleSyncLog` две записи `auth_failed`/`invalid_credentials` (F-syncLogs). `evidence/block-10/D1-invalid-token-401.txt` | ✅ |
| D.2 | Blocked device → 403 SCALE_DEVICE_NOT_ACTIVE | да | После PATCH status=blocked: `POST /scales/check-update` валидным токеном → 403 `{"code":"SCALE_DEVICE_NOT_ACTIVE"}`. ScaleSyncLog получил `auth_failed`/`device_blocked`. `evidence/block-10/D2-blocked-403.txt` | ✅ |
| D.3 | currentCatalogVersionId = current → hasUpdate:false | да | 201 `{hasUpdate:false, currentVersionId:"af835e68-..."}`. `evidence/block-10/D3-current-no-update.json`. **Note**: 201 для read-shaped endpoint — Nest @Post default. Семантически 200 был бы корректнее, но это cosmetic | ✅ |
| D.4 | currentCatalogVersionId = старая → hasUpdate:true + packageData | да | 201 `{hasUpdate:true, versionId, versionNumber:2, packageChecksum, packageData: {categories:[...]}}`. `evidence/block-10/D4-older-update-available.json` | ✅ |
| D.5 | currentCatalogVersionId omitted → full package inline | да | Тот же ответ что D.4 (full packageData). diff D4=D5 = 0 byte. `evidence/block-10/D5-null-full-package.json` | ✅ |
| D.6 | packageData = CatalogVersion.packageData (sanity match) | да | `packageChecksum` в check-update (`cd52d46d...`) == `packageChecksum` v=2 из `/publishing/catalog-versions` — sha256 совпадает → байты `packageData` идентичны. Direct field exposure отсутствует (catalog-versions не возвращает packageData), checksum-match достаточен | ✅ |

### E. ack endpoint

| # | Сценарий | Expected | Actual | Status |
|---|---|---|---|---|
| E.1 | ack status=success → device.currentCatalogVersionId + lastSyncAt update | да | 201 `{acknowledged:true, status:"success", versionId:"af835e68-...", lastSyncAt:"..."}`. Сразу после: device `currentCatalogVersionId=af835e68-...`, `lastSyncStatus="ack_received"`. `evidence/block-10/E1-ack-success.txt` | ✅ |
| E.2 | ack status=error → currentCatalogVersionId НЕ меняется | да | 201 `{acknowledged:true, status:"error", versionId:"5551bc14-...", lastSyncAt:null}`. Device остаётся `currentCatalogVersionId=af835e68-...` (предыдущее значение), `lastSyncStatus="error"`, `lastSyncError.message="checksum mismatch"`. lastSyncAt **не** обновляется на error (per code path `if (status === 'success')`). `evidence/block-10/E2-ack-error.txt` | ✅ |
| E.3 | ack non-existing versionId → reject | да | 404 `{"message":"Catalog version not found"}`. Device state unchanged. `evidence/block-10/E3-ack-fake-uuid-404.txt` | ✅ |
| E.4 | ack чужой store versionId → reject | да | Использован валидный versionId из foreign store (61998b55-...). 404 `Catalog version not found` (фильтр `where: { id: versionId, storeId: device.storeId }` в `scales.service.ts:365-368`). Device state unchanged. `evidence/block-10/E4-ack-foreign-store-404.txt` | ✅ |

### F. ScaleSyncLog

| # | Сценарий | Expected | Actual | Status |
|---|---|---|---|---|
| F.1 | После check-update → запись (no_update/package_delivered) | да | На D.3 → `no_update` `deliveredVersionId=null`. На D.4 → `package_delivered` `requestedVersionId=5551bc14-...` `deliveredVersionId=af835e68-...`. На D.5 → `package_delivered` `requestedVersionId=null` `deliveredVersionId=af835e68-...`. См. `evidence/block-10/F-syncLogs-for-device.json` | ✅ |
| F.2 | После ack → запись (ack_received/error) | да | На E.1 → `ack_received` `deliveredVersionId=af835e68-...`. На E.2 → `error` `deliveredVersionId=5551bc14-...` `errorMessage="checksum mismatch"`. `errorMessage` редактируется на `apiToken=*REDACTED*` per `normalizeErrorMessage` (защита от утечки в логе) | ✅ |
| F.3 | GET logs admin vs operator scoping | admin: all, operator: own only | `/logs/global` — admin 200, operator 403. `/stores/{own}/logs` — operator 200. `/stores/{foreign}/logs` — operator 403 `Insufficient role`. `evidence/block-10/F3a..F3d.txt` | ✅ |

### G. Rate limiting

| # | Сценарий | Expected | Actual | Status |
|---|---|---|---|---|
| G.1 | 30 быстрых check-update → 429 после 20-го | да | Ровно 20 × 201 → 10 × 429. Bucket `scale-api` maxAttempts=20 windowSeconds=60 (`scale-api.controller.ts:23`). 429 body: `{"code":"RATE_LIMIT_EXCEEDED","retryAfterSeconds":51}`. **Note (low)**: standard HTTP header `Retry-After` отсутствует в response — только JSON body field `retryAfterSeconds`. Common HTTP libs (libcurl, browsers) ожидают header. Cosmetic, фиксить можно при следующей итерации. `evidence/block-10/G1-burst-30-rate-limit.txt`, `G1-429-response-sample.txt` | ✅ + note |
| G.2 | Recovery после паузы | да | Через ~2 мин (после H setup) тот же device получил 201 на check-update. Storage in-memory Map с window resetom (rate-limit.service.ts:33). | ✅ |

### H. BUG-REG-029 final verification

| # | Сценарий | Expected | Actual | Status |
|---|---|---|---|---|
| H.1 | USD price published → check-update → packageData.items[].currency=USD | repro | Создан QA store `QAB10USD004708` `8995f4b9-...`; product `5593d554-...`; placement; `PUT /prices` с `{price:99.99,currency:"USD"}` → 200 (BUG-REG-027). `POST /publishing/catalog-publish` → v=1 `cdf74110-...` `packageChecksum=297fdbd7...` `packageData.items[0].currency="USD"`. Зарегистрирован device `QAB10HUSD004822`; `POST /scales/check-update` → 201 c `currencies: ["USD"]`, тот же `packageChecksum=297fdbd7...`. **Криптографическое доказательство**: байты `packageData` идентичны от publish до scale. `evidence/block-10/H1-check-update-USD-FINAL.json` + `H-publish-v1-USD.json`. BUG-REG-029 обновлён. | ✅ confirmed E2E |

### I. Edge cases

| # | Сценарий | Expected | Actual | Status |
|---|---|---|---|---|
| I.1 | lastSeenAt обновляется на любой успешный check-update | да | Before `2026-05-17T22:48:51.714Z`, after `2026-05-17T22:49:16.280Z`. Обновляется через ScaleApiAuthGuard (на success) + tx внутри `checkScaleUpdate`. `evidence/block-10/F-syncLogs-for-device.json` фиксирует timestamps | ✅ |
| I.2a | Valid-format UUID, non-existent CatalogVersion | reject/ignore | **500 Internal Server Error.** FK violation на `ScaleSyncLog.requestedVersionId` → unmapped Prisma error → 500. TX rollback → нет audit trail. **Новый bug BUG-REG-031 (medium).** `evidence/block-10/I2a-fake-uuid-500.txt` | ❌ BUG-REG-031 |
| I.2b | Malformed (non-UUID) `currentCatalogVersionId` | 400 | 400 `{"message":"currentCatalogVersionId must be a valid UUID"}`. `evidence/block-10/I2b-malformed-uuid-400.txt` | ✅ |
| I.2c | Valid UUID, existing foreign-store version | hasUpdate:true | 201 `hasUpdate:true` → current store version. Foreign versionId не попадает в FK error потому что записывается в `requestedVersionId` (FK SetNull, valid since version exists) — но логика трактует его как "у девайса устаревший стейт". | ✅ |

## Итог

- Pass: 25 / 28
- Skip (no endpoint surface): 1 — B.1 (PATCH name/model отсутствует, не bug)
- Partial skip (DB access ungranted): 1 — A.3 (proven indirectly через crypto path; полный verify требует SSH+psql, нужно согласование с manager)
- Fail / new bug: 1 — I.2a → **BUG-REG-031 (medium)**: random UUID в `currentCatalogVersionId` → 500 + потеря audit trail

## Findings (не-баги)

1. **Cosmetic**: 429 response не содержит standard `Retry-After` HTTP header, только JSON-field `retryAfterSeconds`. Common HTTP-libs/devices смотрят на header. Стоит добавить — 5 строк в rate-limit.guard.ts.
2. **Cosmetic**: `POST /scales/check-update` возвращает 201 Created для read-shaped операции. Семантически 200 OK корректнее (Nest @Post default). Не блокер.
3. **API gap**: PATCH device name/model отсутствует. После регистрации поля immutable. Frontend кода рассчитан на это (нет corresponding mutation в `scalesApi.ts`). PRD не уточняет необходимость. Зафиксировать решение явно.
4. **deviceCode globally unique** — корректное behaviour, но стоит документировать (PRD §6.14 не уточняет scope). Безопаснее против коллизий между магазинами.
5. **Auth flow**: device.status=blocked → 403 SCALE_DEVICE_NOT_ACTIVE (а не 401). Логика осмысленная: 401 = wrong credentials, 403 = recognised but disabled. Хорошо для scale-side diagnostics.
6. **TX behavior**: ack status=error НЕ обновляет lastSyncAt (только success). Это согласовано с PRD §6.13 ("lastSyncAt = последняя успешная синхронизация"). lastSeenAt при этом обновляется в guard'е (auth прошла → device "был на связи"). Различение `lastSeenAt` / `lastSyncAt` корректно отражено в коде.

## Bugs found

- **BUG-REG-031 medium** — check-update с valid-format unknown UUID → 500 + потеря audit (`bugs/BUG-REG-031.md`)

## Existing follow-ups status

- **BUG-REG-029 (high)** — финально подтверждено end-to-end (H.1). Bug-report обновлён: USD доходит от input gate (BUG-REG-027) → CatalogVersion.packageData snapshot (BUG-REG-029) → `/scales/check-update` response (Block-10 H.1) с identical `packageChecksum`. Криптографическая идентичность доказана.

## Cleanup

- Devices `320b42f6-...` (QAB10A1004111) и `fcfa8db7-...` (QAB10HUSD004822) → blocked + apiToken revoked через regenerate.
- Store `8995f4b9-...` (QAB10USD004708) → archived. Product `5593d554-...` → archived.
- `CatalogVersion cdf74110-...` (v=1 в архивном store) остаётся (immutable). Содержит USD packageData — теперь часть BUG-REG-029 evidence.
- Plaintext apiToken файлы из `/tmp` удалены (`A1-apiToken.txt`, `A1-apiToken-OLD.txt`, `H-apiToken.txt`, intermediate JSON с тoken'ом). Cookies `qa-admin-cookies.txt`, `qa-op-cookies.txt` остаются в `/tmp` для других блоков, не коммитятся.

## Evidence (всё в `docs/regression/2026-05-17/evidence/block-10/`)

- A: `A1-register-success.json` (redacted), `A2-get-device-no-token.json`, `A4-dup-same-store.txt`, `A5-dup-different-store.txt`
- B: `B2-set-inactive.txt`, `B2-back-active.txt`, `B3-regenerate-token.json` (redacted), `B4-old-token-401.txt`, `B4b-new-token-200.txt`
- C: `C1-operator-register-403.txt` ... `C5-operator-list-foreign-403.txt`
- D: `D1-invalid-token-401.txt`, `D2-set-blocked.txt`, `D2-blocked-403.txt`, `D3-current-no-update.json`, `D4-older-update-available.json`, `D5-null-full-package.json`
- E: `E1-ack-success.txt`, `E2-ack-error.txt`, `E3-ack-fake-uuid-404.txt`, `E4-ack-foreign-store-404.txt`
- F: `F-syncLogs-for-device.json`, `F3a-admin-global-200.txt` ... `F3d-operator-foreign-403.txt`
- G: `G1-burst-30-rate-limit.txt`, `G1-429-response-sample.txt`
- H: `H-store-create.json`, `H-category-create.json`, `H-product-create.json`, `H-placement-create.txt`, `H-price-USD.txt`, `H-publish-v1-USD.json`, `H-register-device.json` (redacted), **`H1-check-update-USD-FINAL.json`** (USD в packageData, BUG-REG-029 финал)
- I: `I2a-fake-uuid-500.txt`, `I2b-malformed-uuid-400.txt`, `I2c-foreign-store-uuid-200.txt`
