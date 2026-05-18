# BUG-REG-029: non-RUB currency из БД попадает в published `packageData` (BUG-REG-027 reaches scales)

- Severity: high
- Area: publishing / packageData / scale sync
- Role: admin (источник через API, оператор тоже способен через свой store)
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: curl
- Found: 2026-05-18 00:21 CEST
- Related: extends BUG-REG-027 (medium → reaches high once published)

## Шаги воспроизведения

1. Logged in as qa-admin. Создан clean catalog в STORE_PUB `021acd90-f270-4e64-b23c-5edb330adb2d` (2 cat, 3 placement+price, 1 banner — see BLOCK-09 setup).
2. Цена BAGEL `b465e128-...` обновлена на non-RUB через API (как в BUG-REG-027):
   ```
   PUT /api/stores/$STORE_PUB/prices/$BAGEL  body {"price":3,"currency":"USD"}
   → 200 OK, persisted currency=USD
   ```
3. POST `/api/stores/$STORE_PUB/publishing/catalog-publish` → 201, version 2 (`d2a9ae0c-40d2-4a0d-b496-ad6e268d8f71`).
4. Inspect `version.packageData.categories[].items[]` опубликованной версии.

## Ожидаемое

PRD §6.8: MVP currency = RUB only.

Опубликованный `packageData`, который уходит на весы (`scaleSync` reads `CatalogVersion.packageData`), должен содержать **только RUB**:
- либо publish reject (`CURRENCY_NOT_SUPPORTED` blocking validation),
- либо нормализация `currency=RUB` при сборке пакета.

## Фактическое

`packageData.categories[0].items[*]` содержит:
```json
{ "plu": "92001734", "shortName": "Bgl", "price": 3, "currency": "USD" }
```

В категории QA-Bread позиция Bagel опубликована с `currency: "USD"`. Pacakge checksum зафиксировал это в immutable `CatalogVersion.packageChecksum` (sha256). Версия теперь immutable (см. block-09 E.1) — corrupted snapshot нельзя поправить иначе как новой publication ПОСЛЕ исправления цены в БД.

Полный dump: `docs/regression/2026-05-17/evidence/block-09/C-publish-2.json` (см. категорию QA-Bread → items → Bgl).

## Network / Console

```
POST /api/stores/021acd90-f270-4e64-b23c-5edb330adb2d/publishing/catalog-publish
201 Created
{
  "version": {
    "id": "d2a9ae0c-40d2-4a0d-b496-ad6e268d8f71",
    "versionNumber": 2,
    "packageData": { ... "items": [{ "plu":"92001734","currency":"USD", ... }] }
  }
}
```

Validation не отлавливает: `catalog-validation.service.ts` не имеет правила про currency whitelist; `catalog-package.service.ts:222-223` копирует `currency` прямо из `StoreProductPrice.currency` без enum-валидации.

## Impact

- Scale device получит package с `currency=USD`/`ZZZ`/любая 3-letter; firmware behavior на не-RUB undefined (display, total calc, audit на чеке).
- BUG-REG-027 был medium-severity (API-only); теперь подтверждено, что dirty data доходит до конечной точки потребления → severity escalates.
- Immutable пакет хранит corrupted snapshot. Roll-forward = новая publication. Roll-back через `basedOnVersionId` указывает на pre-corruption version, но `currentVersionId` на v2 — нужен hard set вручную (нет endpoint для этого) либо новая publication (которая снова получит USD из БД, если цену не починили).

## Hypothesis

Два сценария фикса:
1. **Validation-level** — добавить blocking rule в `catalog-validation.service.ts`:
   ```ts
   if (!ALLOWED_CURRENCIES.has(price.currency)) {
     blockingErrors.push({ code: 'PRICE_CURRENCY_NOT_SUPPORTED', ... });
   }
   ```
2. **Package-build normalization** — в `catalog-package.service.ts:222`:
   ```ts
   currency: price.currency === 'RUB' ? 'RUB' : 'RUB',  // forced
   ```
   но это маскирует баг в БД. Лучше — fix at validation + fix BUG-REG-027 (whitelist на PUT prices).

Рекомендация: исправлять обе точки — (a) input gate (BUG-REG-027) и (b) publish gate (BUG-REG-029) как defence-in-depth.

## Evidence

- `docs/regression/2026-05-17/evidence/block-09/C-publish-2.json` — full publish response (включает packageData с USD)
- `docs/regression/2026-05-17/blocks/BLOCK-09-publishing.md` раздел D.4
- helpers: `docs/regression/2026-05-17/scripts/block-09-helpers.sh`
- relevant code:
  - `backend/src/publishing/catalog-package.service.ts:218-225` — currency copy без whitelist
  - `backend/src/publishing/catalog-validation.service.ts` — нет blocking rule для currency
  - `backend/src/prices/prices.service.ts:262-270` — BUG-REG-027 root cause (regex-only validation)

## Final E2E confirmation (Block-10 H.1, 2026-05-18)

Подтверждено, что corruption доходит до scale device через `/api/scales/check-update` end-to-end:

Setup (свежий QA store, чтобы не залезать в существующий контент):
- Создан store `QAB10USD004708` `8995f4b9-f851-4654-930b-e5d407cd35e8`.
- Создана category `d2c8ac60-1ff1-4de6-9dad-d6f66578a64f`, product `5593d554-...` (defaultPluCode `QAU004751`), placement.
- `PUT /stores/<usd>/prices/<prod> {"price":99.99,"currency":"USD"}` → 200 (BUG-REG-027 — write accepted).
- `POST /publishing/catalog-publish` → 201 v=1 `cdf74110-...`, `packageChecksum=297fdbd7...`, `packageData.categories[0].items[0].currency="USD"` (BUG-REG-029 — в snapshot).

Финальный test (со стороны scale API):
- Зарегистрирован device `QAB10HUSD004822` в USD-store, получен apiToken.
- `POST /api/scales/check-update` с `x-scale-device-code`+`x-scale-api-token` headers, пустой body → 201:
  ```json
  {
    "hasUpdate": true,
    "versionId": "cdf74110-489b-445b-be48-462bef91d70c",
    "versionNumber": 1,
    "packageChecksum": "297fdbd7878079d04e24eca2bb4ec4faca680e27ab7a8988caf81df12008567a",
    "packageData": { "categories": [ { "items": [ { "plu":"QAU004751","price":99.99,"currency":"USD" } ] } ] }
  }
  ```

packageChecksum совпадает с тем, что был при publish (`297fdbd7...`) — это **криптографическое доказательство**, что байты `packageData`, ушедшие на scale, идентичны тому, что было сохранено в `CatalogVersion.packageData`. Никакой sanitize-prosechody.

См. `docs/regression/2026-05-17/evidence/block-10/H1-check-update-USD-FINAL.json` и `H-publish-v1-USD.json`.

Cleanup: device blocked + token revoked, store + product archived. USD-snapshot остался в `CatalogVersion.packageData` (immutable by design — см. BLOCK-09 E.1).
