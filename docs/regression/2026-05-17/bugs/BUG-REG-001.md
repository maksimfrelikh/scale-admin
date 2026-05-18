# BUG-REG-001: HSTS (Strict-Transport-Security) header отсутствует на всех ответах

- Severity: medium
- Area: network
- Role: unauth (применимо ко всем)
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: curl
- Found: 2026-05-17 20:46
- Related known: —

## Шаги воспроизведения

1. Из shell выполнить:
   ```bash
   curl -I -s https://maksimfrelikh.ru | grep -i 'strict-transport'
   curl -I -s https://maksimfrelikh.ru/api/health | grep -i 'strict-transport'
   ```
2. Посмотреть на ответ headers.

## Ожидаемое

На HTTPS ответах присутствует `Strict-Transport-Security` header с разумным `max-age` (минимум 6 месяцев, рекомендуется `max-age=31536000; includeSubDomains`).

## Фактическое

Header `Strict-Transport-Security` отсутствует и на frontend (`/`), и на API (`/api/health`). Поиск по полному набору response headers даёт пустой результат.

Полные headers с https://maksimfrelikh.ru:
```
HTTP/1.1 200 OK
Server: nginx/1.24.0 (Ubuntu)
Date: Sun, 17 May 2026 18:45:54 GMT
Content-Type: text/html
Connection: keep-alive
Vary: Origin
Cache-Control: no-cache
Etag: W/"18c-Bb69P9LJ7adIZlHFWZAjLtkpgjg"
```

Никакого `Strict-Transport-Security` нет.

## Network / Console

См. evidence/block-01-4-security-headers.txt — секция "Filtered security headers" пуста.

## Impact

301 редиректы с http/www работают, поэтому "по умолчанию" пользователь попадает на https. Но при первом визите остаётся окно для MITM-downgrade (TLS-stripping в условиях недоверенной сети). HSTS — стандартный defense-in-depth для production HTTPS приложений с auth.

## Evidence

- evidence/block-01-4-security-headers.txt

## Hypothesis

В nginx конфиге `/etc/nginx/sites-enabled/maksimfrelikh.ru` (или его аналоге) не добавлен `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;` в server-блоке `listen 443`. Возможно, ranее использовался только редирект без явного HSTS.
