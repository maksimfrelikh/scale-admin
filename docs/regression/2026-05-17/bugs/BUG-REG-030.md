# BUG-REG-030: double-publish race — проигравшая транзакция возвращает 500 вместо 409 Conflict

- Severity: low
- Area: publishing / error mapping
- Role: admin + operator
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: curl
- Found: 2026-05-18 00:23 CEST
- Related: none

## Шаги воспроизведения

1. Authenticate as qa-admin, prepare clean catalog (`STORE_PUB`).
2. Fire 2 concurrent `POST /api/stores/$STORE_PUB/publishing/catalog-publish` через background subshells (`docs/regression/2026-05-17/scripts/block-09-race.sh`).
3. Wait for both.

## Ожидаемое

- Целостность данных: создаётся ровно одна `CatalogVersion`, `versionNumber` уникален. ✅ (defended by `@@unique([catalogId, versionNumber])` + Serializable isolation)
- HTTP: победитель → 201; проигравший → **409 Conflict** с осмысленным message ("Catalog publish in progress" / "Version number conflict").

## Фактическое

Победитель → 201 Created с новой версией.
Проигравший → **500 Internal Server Error** с body:
```
{"statusCode":500,"message":"Internal server error"}
```

Воспроизведено дважды:
- run 1 (`F1-race.log` первая половина): one 201 (versionNumber=5), one 500
- run 2 (`F1-race.log` вторая половина): one 201 (versionNumber=6), one 500

Никаких дублирующих `versionNumber` в БД — invariant удерживается (post-race versions list: 1,2,3,4,5,6 строго возрастают). Проблема только в error-mapping.

## Network / Console

```
POST /api/stores/.../publishing/catalog-publish   (race winner)
→ 201 Created
{"version":{"id":"<uuid>","versionNumber":6,...}}

POST /api/stores/.../publishing/catalog-publish   (race loser)
→ 500 Internal Server Error
{"statusCode":500,"message":"Internal server error"}
```

## Impact

- Кликер UI, дважды быстро нажавший Publish, увидит generic 500 вместо понятного "уже опубликована другая версия".
- Operator-логика обработки: 500 обычно retry-able; здесь retry создаст новую версию (что не то, что нужно по семантике).
- Data integrity не страдает — это чисто UX.

## Hypothesis

В `catalog-publishing.service.ts:105-171` транзакция с `Prisma.TransactionIsolationLevel.Serializable`. Один из:
- `P2002` (unique violation на `@@unique([catalogId, versionNumber])`) — pre-emptive если obvious
- `P2034` (serialization failure / TransactionConflict)

Оба сейчас бросают как unknown error → Nest exception filter → 500. Фикс: обернуть `prisma.$transaction` try/catch и при `code in ('P2002','P2034')` бросать `ConflictException` (409) с явным message.

Альтернатива: использовать advisory lock на `catalogId` чтобы сериализовать вход в публикацию ещё до tx.

## Evidence

- `docs/regression/2026-05-17/evidence/block-09/F1-race.log` — full output of both race runs
- `docs/regression/2026-05-17/scripts/block-09-race.sh` — repro script
- relevant code:
  - `backend/src/publishing/catalog-publishing.service.ts:105-171` — transaction без обработки конфликтов
  - `backend/prisma/schema.prisma:414` — `@@unique([catalogId, versionNumber])`
