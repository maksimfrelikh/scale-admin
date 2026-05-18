# BUG-REG-027: API `PUT /api/stores/{storeId}/prices/{productId}` принимает любую 3-letter currency (USD, EUR, ZZZ) без предупреждения

- Severity: medium
- Area: api / prices / validation
- Role: admin + operator (storeAccess)
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: curl
- Found: 2026-05-18 00:02 CEST
- Related known: PRD §6.8 ("currency можно хранить как поле, для MVP использовать RUB")

## Шаги воспроизведения

1. Авторизоваться как qa-admin, получить CSRF token.
2. Создать store + placement product (через стандартный API).
3. Послать `PUT /api/stores/{storeId}/prices/{productId}` с body `{"price":10,"currency":"USD"}`.
4. Послать тот же endpoint с `{"price":10,"currency":"ZZZ"}`.
5. Послать с `{"price":10,"currency":"AAA"}`.

## Ожидаемое

Для MVP currency = `RUB` (PRD §6.8). API должно:
- Принимать `RUB` (или пустое → default RUB).
- Отклонять любое другое значение с `400 Bad Request` ("Currency must be RUB" или эквивалент).
- Frontend в `pricesApi.ts` уже хардкодит `'RUB'` если currency не указана — это означает что non-RUB через UI не пройдёт. API-level дыра.

## Фактическое

```
PUT /api/stores/.../prices/<productId>
body: {"price":10,"currency":"USD"}
→ 200 OK, {"price":{"price":"10","currency":"USD",...}}

PUT ... body: {"price":10,"currency":"ZZZ"}
→ 200 OK, {"price":{"price":"10","currency":"ZZZ",...}}

PUT ... body: {"price":10,"currency":"AAA"}
→ 200 OK (любая 3-buchstabe строка проходит)
```

После `currency=USD`/`ZZZ` запись `StoreProductPrice` сохраняется с этим значением; следующие GET возвращают её как `currentPrice.currency: "USD"` / `"ZZZ"`. Frontend RTK слой подставит этот `currency` назад в follow-up UI-инициированные PUT (`row.currentPrice?.currency ?? 'RUB'` в `frontend/src/main.tsx:1967`) → следующие UI-edits будут навечно сохранять non-RUB.

## Network / Console

```
curl -i -b cookies -H "x-csrf-token: $T" -H "Content-Type: application/json" \
  -X PUT https://maksimfrelikh.ru/api/stores/5d83.../prices/8594.... \
  -d '{"price":10,"currency":"USD"}'
HTTP/1.1 200 OK
{"price":{"id":"2037182a-...","storeId":"5d83...","productId":"8594...",
  "price":"10","currency":"USD","status":"active",...}}
```

## Impact

- Bypass scope MVP: PRD ограничивает MVP до `RUB`, API позволяет любое 3-letter.
- Persistent corruption: после API-инициированного non-RUB PUT, UI-инициированные обновления сохраняют тот же currency (frontend читает `row.currentPrice.currency`).
- Scale device sync публикует price в package с currency полем; если устройство ожидает RUB и получает USD/ZZZ — поведение device firmware undefined.
- AuditLog не содержит diff → факт смены currency не виден без специального запроса.

## Hypothesis

`backend/src/prices/prices.service.ts:262` — `requireCurrency` валидирует только regex `^[A-Z]{3}$`, не enum `['RUB']`. Чтобы соответствовать PRD MVP — заменить на whitelist (`if (normalized !== 'RUB')` → BadRequest), либо вынести список разрешённых валют в config.

## Evidence

- block-08 раздел F.4-F.5 в `docs/regression/2026-05-17/blocks/BLOCK-08-prices.md`
- helpers: `docs/regression/2026-05-17/scripts/block-08-helpers.sh`
- relevant code:
  - `backend/src/prices/prices.service.ts:262-270` — `requireCurrency` regex-only
  - `frontend/src/main.tsx:1967` — UI fallback `currency ?? 'RUB'` сохраняет существующее non-RUB
  - PRD §6.8 line 500: "currency можно хранить как поле, для MVP использовать RUB"

## Related

- BUG-REG-023 (medium) — нет верхнего лимита price; backend price validation в целом неполная
- BUG-REG-024 (low) — ESC/click-outside в inline edit; UX gap
