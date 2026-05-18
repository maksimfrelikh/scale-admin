# BUG-REG-005: 429 на `/api/auth/login` не отдаёт стандартный `Retry-After` header

- Severity: low
- Area: api
- Role: unauth (применимо ко всем)
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: curl
- Found: 2026-05-17 21:03
- Related known: —

## Шаги воспроизведения

1. Получить CSRF: `curl -s -c /tmp/c -H "Origin: https://maksimfrelikh.ru" https://maksimfrelikh.ru/api/auth/csrf`
2. Сделать 2 подряд POST /api/auth/login с неверным паролем с тем же cookie и CSRF token.
3. Посмотреть headers второго ответа.

```bash
BODY=$(curl -s -c /tmp/c -H "Origin: https://maksimfrelikh.ru" https://maksimfrelikh.ru/api/auth/csrf)
CSRF=$(echo "$BODY" | jq -r .csrfToken)
curl -s -o /dev/null -b /tmp/c -H "Content-Type: application/json" -H "Origin: https://maksimfrelikh.ru" -H "x-csrf-token: $CSRF" -X POST https://maksimfrelikh.ru/api/auth/login -d '{"email":"qa-admin@***.invalid","password":"x"}'
curl -i -s -b /tmp/c -H "Content-Type: application/json" -H "Origin: https://maksimfrelikh.ru" -H "x-csrf-token: $CSRF" -X POST https://maksimfrelikh.ru/api/auth/login -d '{"email":"qa-admin@***.invalid","password":"x"}'
```

## Ожидаемое

429 ответ должен включать стандартный `Retry-After` HTTP header (RFC 6585 §4, RFC 7231 §7.1.3). Значение — секунды (или HTTP-date).

```
HTTP/1.1 429 Too Many Requests
Retry-After: 7
...
```

## Фактическое

Стандартный `Retry-After` header отсутствует. Информация о паузе передаётся только в JSON теле как кастомное поле `retryAfterSeconds`:

```
HTTP/1.1 429 Too Many Requests
Server: nginx/1.24.0 (Ubuntu)
Date: Sun, 17 May 2026 19:03:25 GMT
Content-Type: application/json; charset=utf-8
Content-Length: 148
Connection: keep-alive
X-Powered-By: Express
Access-Control-Allow-Origin: https://maksimfrelikh.ru
Vary: Origin
Access-Control-Allow-Credentials: true
ETag: W/"94-jyDLQWqKs7OrQpck/YoPf3Hacag"

{"message":"Too many requests. Please retry later.","error":"Too Many Requests","code":"RATE_LIMIT_EXCEEDED","retryAfterSeconds":6,"statusCode":429}
```

## Impact

- HTTP-aware промежуточные прокси/CDN/SDK не могут автоматически уважать rate limit
- Стандартные HTTP-клиенты (curl --retry, urllib, requests с auto-retry) не сделают пауз
- Кастомный фронт SCA admin сам читает `retryAfterSeconds` из тела — для него работает
- Не уязвимость, но отклонение от HTTP спецификации

## Network / Console

См. Шаги выше. На стороне сервера за `Retry-After` отвечает обычно перехватчик rate-limit модуля (NestJS Throttler).

## Evidence

- evidence/block-02-C5-ratelimit.txt — полный лог 9 попыток с показом отсутствия `Retry-After` header

## Hypothesis (опционально)

Кастомный rate-limit guard NestJS-приложения сериализует rate-limit информацию в JSON ответ, но не выставляет стандартный response header. Достаточно добавить `Reflect.set` или `response.setHeader('Retry-After', secs)` рядом с формированием тела.
