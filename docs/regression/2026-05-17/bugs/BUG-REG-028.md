# BUG-REG-028: `PUT /prices/{productId}` отдаёт 500 Internal Server Error для price < 0.005 (округление до 0.00 + 400 теряется в стеке)

- Severity: low
- Area: api / prices / validation / error-handling
- Role: admin
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: curl
- Found: 2026-05-18 00:04 CEST
- Related known: BUG-REG-023 (отсутствует верхний лимит); общая неполнота валидации цены

## Шаги воспроизведения

1. Авторизоваться как qa-admin (CSRF token).
2. Послать `PUT /api/stores/{storeId}/prices/{productId}` с body `{"price":0.001,"currency":"RUB"}`.
3. То же с 0.004.
4. То же с 0.005 (boundary).

## Ожидаемое

API должен валидировать `price > 0` ДО передачи в БД и возвращать `400 Bad Request` с понятным сообщением.

## Фактическое

```
submitted=0.001 → HTTP 500 → {"statusCode":500,"message":"Internal server error"}
submitted=0.004 → HTTP 500 → {"statusCode":500,"message":"Internal server error"}
submitted=0.005 → HTTP 200, stored "0.01" (rounded up)
submitted=0.009 → HTTP 200, stored "0.01"
submitted=0.01  → HTTP 200, stored "0.01"

submitted=-10    → HTTP 400 {"message":"Price must be greater than 0"}
submitted=0      → HTTP 400 {"message":"Price must be greater than 0"}
```

Между `0.001..0.0049` — backend получает Number → передаёт в Prisma → пишет `numeric(precision=N, scale=2)` → итог округляется до `0.00` → DB CHECK constraint (или Prisma validation) кидает unhandled error → catch перехватывает как 500 вместо preventive 400.

## Network / Console

```
curl -i -b cookies -H "x-csrf-token: $T" -H "Content-Type: application/json" \
  -X PUT https://maksimfrelikh.ru/api/stores/5d83.../prices/8594.... \
  -d '{"price":0.001,"currency":"RUB"}'
HTTP/1.1 500 Internal Server Error
{"statusCode":500,"message":"Internal server error"}
```

Server logs не запрошены (нет access без manager approval), но симптом классический: `numeric(*, 2)` rounding → 0.00 → CHECK violation.

## Impact

- Low в production: UI имеет `step="0.01"`, поэтому через UI submilliprice не пройдёт.
- Через API/прямой curl/automation → нечитаемый 500 вместо понятного 400.
- В дашборде / Sentry / логах будет шум "Internal server error" от пользовательских ошибок ввода — затрудняет triage реальных проблем.

## Hypothesis

`backend/src/prices/prices.service.ts` принимает price → передаёт в Prisma `Decimal`/`numeric(N,2)` → округление до 0.00 происходит на DB-level → CHECK constraint срабатывает (или PrismaClientKnownRequestError с числовой ошибкой) → NestJS глобал exception filter без mapping → 500.

Фикс: после `parsePrice(input.price)` округлить к 2 знакам (`Math.round(p*100)/100`) и проверить `roundedPrice >= 0.01` → BadRequest "Price must be at least 0.01" если не проходит.

## Evidence

- block-08 раздел F.3 в `docs/regression/2026-05-17/blocks/BLOCK-08-prices.md`
- relevant code: `backend/src/prices/prices.service.ts` (parsing/validation pipeline)

## Related observations (not separate bugs)

- API округляет `1.001 → 1`, `99.499 → 99.5`, `12.345 → 12.35`. Это нормальное поведение `numeric(N,2)`, но не возвращает warning. UI `step="0.01"` блокирует это через клиент. Informational.
- `price=0.005` rounds **up** to `0.01` (не банкерское). Принимается.
