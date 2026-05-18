# BUG-REG-031: check-update с unknown (но валидным форматом) `currentCatalogVersionId` → 500 + теряется ScaleSyncLog

- Severity: medium
- Area: scale-sync / check-update / error-handling
- Role: scale device (любой active device)
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: curl
- Found: 2026-05-18 00:49 CEST
- Related: BLOCK-10 I.2a

## Шаги воспроизведения

1. Зарегистрированы scale device `QAB10A1004111` (`320b42f6-1404-46b3-9bb4-dd8b0b40cee1`) в store `1cf0f4ba-71a8-4a0d-b87d-8e5494baf263` (UAT20260515P4195540), status=active, apiToken действительный.
2. Стор имеет 2 published CatalogVersion (v=1 `5551bc14`, v=2 `af835e68` — current).
3. POST `/api/scales/check-update` с заголовками auth и body:
   ```json
   {"currentCatalogVersionId":"ffffffff-ffff-4fff-8fff-ffffffffffff"}
   ```
4. UUID валиден по формату, но НЕТ соответствующей `CatalogVersion.id` в БД.

## Ожидаемое

PRD §6.13 и manager block-10 I.2: при неизвестном `currentCatalogVersionId` сервер должен либо:
- вернуть `hasUpdate:true` с актуальным `packageData` (трактовать как "у тебя устаревший стейт"), либо
- вернуть 400 / 404 с осмысленным сообщением,

и в любом случае создать соответствующую запись в `ScaleSyncLog` (audit trail).

## Фактическое

```
POST /api/scales/check-update
HTTP/1.1 500 Internal Server Error
Content-Type: application/json; charset=utf-8

{"statusCode":500,"message":"Internal server error"}
```

После запроса:
- `lastSeenAt` устройства не обновился (была обновлёна в guard до controller-уровня, но затем... нет, проверено: TX в сервисе откатывается, lastSeenAt по результатам POST не виден).
- В `ScaleSyncLog` для этого `scaleDeviceId` **нет ни одной записи** про этот call (`SELECT ... WHERE requestedVersionId='ffffffff-...'` пусто; запись `auth_failed` тоже отсутствует — call прошёл auth и упал ниже).

## Причина (гипотеза, не патч)

`backend/prisma/schema.prisma` (ScaleSyncLog):
```prisma
requestedVersion CatalogVersion? @relation("ScaleSyncLogRequestedVersion", fields: [requestedVersionId], references: [id], onDelete: SetNull)
```

В `backend/src/scales/scales.service.ts:319-336` (`checkScaleUpdate`) внутри `$transaction` создаётся `scaleSyncLog` с `requestedVersionId: requestedVersionId` без проверки существования. Postgres FK ловит → P2003 → Prisma бросает unmapped error → Nest 500. Транзакция откатывается, поэтому `lastSeenAt` update и audit запись пропадают вместе.

## Network / Console

```
POST /api/scales/check-update HTTP/1.1
x-scale-device-code: QAB10A1004111
x-scale-api-token: ***REDACTED***
Content-Type: application/json

{"currentCatalogVersionId":"ffffffff-ffff-4fff-8fff-ffffffffffff"}

← HTTP/1.1 500 Internal Server Error
Content-Length: 52
{"statusCode":500,"message":"Internal server error"}
```

Контрольные сценарии (тот же device, в той же сессии):
- `currentCatalogVersionId` = валидный uuid существующей чужого-стора версии (`61998b55-903c-4b34-98e2-96b0503a223c`) → 201 `hasUpdate:true` (этот стор current af835e68). ✅
- `currentCatalogVersionId` = malformed `"not-a-uuid"` → 400 `currentCatalogVersionId must be a valid UUID`. ✅
- `currentCatalogVersionId` опущен → 201 полный package. ✅

Проблема воспроизводится только при формально-валидном UUID, отсутствующем в `CatalogVersion`.

## Impact

- Реалистичный сценарий: scale device после reflash/recovery держит локально UUID, который никогда не существовал на сервере (corrupted cache, инициализация с заводским значением, ручной seed). Каждый check-update → 500. Устройство в цикле, sync не возобновляется.
- Также: при будущей реализации удаления старых CatalogVersion (cleanup) — все девайсы с закэшированной ссылкой пойдут в 500.
- ScaleSyncLog не пишется → observability теряет именно те события, которые надо мониторить (broken sync).
- 500 без структурного `code` — клиент не может отличить временную проблему от "пересохрани контекст". Простейший workaround на стороне scale: послать пустой `currentCatalogVersionId` — но это и есть тот сценарий, в котором сервер должен сам справиться.

## Evidence

- `evidence/block-10/I2a-fake-uuid-500.txt` — raw response
- `evidence/block-10/I2c-foreign-store-uuid-200.txt` — сравнительный контроль
- `evidence/block-10/I2b-malformed-uuid-400.txt` — сравнительный контроль
- `evidence/block-10/F-syncLogs-for-device.json` — лог trail для устройства (записи 500-call нет)
