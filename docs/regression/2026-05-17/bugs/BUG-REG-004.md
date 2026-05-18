# BUG-REG-004: POST/PUT/DELETE на GET-only `/api/health` возвращают 404 вместо 405

- Severity: low
- Area: api
- Role: unauth (применимо ко всем)
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: curl
- Found: 2026-05-17 20:46
- Related known: —

## Шаги воспроизведения

```bash
curl -i -s -X POST   https://maksimfrelikh.ru/api/health
curl -i -s -X PUT    https://maksimfrelikh.ru/api/health
curl -i -s -X DELETE https://maksimfrelikh.ru/api/health
```

## Ожидаемое

По RFC 7231: если ресурс существует, но метод не поддерживается, сервер обязан вернуть `405 Method Not Allowed` с заголовком `Allow:` содержащим список поддерживаемых методов.

## Фактическое

Все три запроса возвращают `404 Not Found` с телом вида:
```json
{"message":"Cannot POST /api/health","error":"Not Found","statusCode":404}
{"message":"Cannot PUT /api/health","error":"Not Found","statusCode":404}
{"message":"Cannot DELETE /api/health","error":"Not Found","statusCode":404}
```

При том, что `GET /api/health` → `200 OK`. Заголовка `Allow:` нет ни в одном из ответов.

## Network / Console

См. evidence/block-01-6-methods.txt.

## Impact

- Семантическая некорректность: API-клиент, попадающий не на тот метод, не понимает что endpoint существует. Это не критично для текущего health endpoint, но плохая практика в целом — особенно для endpoints где `GET ≠ POST` (например `/api/auth/login`, `/api/auth/logout`).
- Diagnostic friction: при отладке клиентского кода `404` будет наталкивать на "endpoint не существует", вместо "метод не тот".
- Влияет на инструменты типа OPTIONS/swagger discovery, которые ожидают корректный `Allow:`.

## Evidence

- evidence/block-01-6-methods.txt

## Hypothesis

Это default-поведение NestJS / Express router: на несовпадение по методу возвращается 404, а не 405. Для исправления — либо middleware/guard, либо переопределить `NotFoundExceptionFilter`, либо использовать `@All()` маршрут как fallback на ресурсах, явно отвечающий 405.

В TODO/MVP не критично; backlog item для hardening.
