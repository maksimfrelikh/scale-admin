# BUG-REG-002: Дополнительные security headers отсутствуют (X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy, Permissions-Policy)

- Severity: medium
- Area: network
- Role: unauth (применимо ко всем)
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: curl
- Found: 2026-05-17 20:46
- Related known: см. также [BUG-REG-001](BUG-REG-001.md) (HSTS)

## Шаги воспроизведения

1. Выполнить:
   ```bash
   curl -I -s https://maksimfrelikh.ru | grep -iE 'x-frame|x-content-type|content-security|referrer|permissions-policy'
   ```
2. Проверить что в ответе содержится.

## Ожидаемое

На HTML ответах (frontend) должны присутствовать как минимум:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN` (или `DENY`)
- `Referrer-Policy: no-referrer` или `strict-origin-when-cross-origin`
- `Content-Security-Policy` (хотя бы базовый, ограничивающий script-src/connect-src канонической origin)
- `Permissions-Policy` (для отключения неиспользуемых API: camera, microphone, geolocation, payment и т.д.)

## Фактическое

Все перечисленные headers отсутствуют. Команда выше возвращает пустой результат как на корневом `/`, так и на `/api/health`.

Полные headers `https://maksimfrelikh.ru/`:
```
Server: nginx/1.24.0 (Ubuntu)
Date: ...
Content-Type: text/html
Connection: keep-alive
Vary: Origin
Cache-Control: no-cache
Etag: ...
```

## Network / Console

См. evidence/block-01-4-security-headers.txt.

## Impact

- Отсутствие `X-Content-Type-Options: nosniff` → потенциальная MIME-confusion атака (если на бекенде есть upload вектор и пользователь скачивает чужой файл).
- Отсутствие `X-Frame-Options` или `Content-Security-Policy frame-ancestors` → clickjacking возможен (любой сайт может встроить админку в iframe).
- Отсутствие `Referrer-Policy` → ссылки наружу будут передавать `Referer` с полным URL текущей страницы, включая path с ID магазина/товара.
- Отсутствие CSP → нет defenece-in-depth против XSS, в случае если санитизация в React будет когда-либо обойдена.

Для админки с money/scale/publishing функциями набор baseline security headers — стандартная гигиена.

## Evidence

- evidence/block-01-4-security-headers.txt

## Hypothesis

В nginx конфиге не настроены `add_header` директивы для security headers. Альтернативно — можно вернуть их из NestJS через `helmet` middleware, но проще на nginx-уровне для всего, включая статику.
