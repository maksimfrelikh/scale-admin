# BUG-REG-010: GET /api/users/invite возвращает 500 вместо 404/405

- Severity: low
- Area: api, error-states
- Role: admin (and possibly anonymous)
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: curl
- Found: 2026-05-17 21:35

## Шаги воспроизведения

```
curl -i -b /tmp/qa-admin-cookies.txt https://maksimfrelikh.ru/api/users/invite
```

## Ожидаемое

`/api/users/invite` не существует как валидный путь. Backend должен вернуть:
- `404 Not Found` если route не зарегистрирован, или
- `400 Bad Request` если `invite` интерпретируется как `:id` параметр и фейлит валидацию UUID.

## Фактическое

```
HTTP/1.1 500 Internal Server Error
{"statusCode":500,"message":"Internal server error"}
```

POST на тот же путь даёт корректный 404:
```
POST /api/users/invite → 404 "Cannot POST /api/users/invite"
```

То есть проблема только на `GET /api/users/invite`. Скорее всего route `GET /api/users/:id` пытается распарсить `invite` как UUID и валидатор выкидывает unhandled exception, превращаясь в generic 500. Сами 500 — не информативны и могут засорять observability/alerting.

## Network / Console

```
> GET /api/users/invite HTTP/1.1
> Cookie: scale_admin_session=...

< HTTP/1.1 500 Internal Server Error
< {"statusCode":500,"message":"Internal server error"}
```

## Impact

- Косметика API-quality: 500 → 400/404 это нормальный паттерн обработки невалидных параметров пути.
- Косвенно: каждый такой 500 в production logs ест внимание dev/oncall. При массовом сканировании путей (атакующий или просто misconfigured клиент) — генерит шум.

## Evidence

- Inline curl выше воспроизводит. Сохранено в evidence/block-03/C-admin-only-as-operator.txt не записано — see block-03 inline notes.

## Hypothesis

`UsersController.findOne(@Param('id', ParseUUIDPipe))` — без `try/catch` и без 400-mapping для не-UUID параметра. Фикс: добавить explicit error filter / `BadRequestException` для невалидных UUID, либо использовать decorator `@Param('id', new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException() }))`.
