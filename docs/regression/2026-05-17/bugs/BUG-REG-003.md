# BUG-REG-003: Утечка версии nginx и framework (Server, X-Powered-By)

- Severity: low
- Area: network
- Role: unauth (применимо ко всем)
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: curl
- Found: 2026-05-17 20:46
- Related known: —

## Шаги воспроизведения

1. ```bash
   curl -I -s https://maksimfrelikh.ru | grep -iE 'server|x-powered-by'
   curl -I -s https://maksimfrelikh.ru/api/health | grep -iE 'server|x-powered-by'
   ```

## Ожидаемое

- `Server` либо отсутствует, либо содержит только generic значение без версии (`Server: nginx`).
- `X-Powered-By` отсутствует полностью.

## Фактическое

Везде, включая страницы ошибок (405 на TRACE возвращает HTML с `nginx/1.24.0 (Ubuntu)` в теле):

- `Server: nginx/1.24.0 (Ubuntu)` — раскрывается мажорная.минорная.патч версия + дистрибутив.
- `X-Powered-By: Express` — на всех ответах backend (`/api/*`).

## Network / Console

См. evidence/block-01-7-server-disclosure.txt.

```
--- root ---
Server: nginx/1.24.0 (Ubuntu)

--- /api/health ---
Server: nginx/1.24.0 (Ubuntu)
X-Powered-By: Express

--- /api/auth/login ---
Server: nginx/1.24.0 (Ubuntu)
X-Powered-By: Express
```

## Impact

Информационная утечка низкого уровня. Облегчает targeted recon: при известной версии nginx/Express атакующий может искать публичные CVE именно под эти версии вместо fuzzing-а. Сам по себе вектор не критичен, но входит в стандартную checklist hardening-а.

## Evidence

- evidence/block-01-7-server-disclosure.txt
- evidence/block-01-6-methods.txt (HTML 405 страница раскрывает версию nginx в body)

## Hypothesis

- nginx: не установлены `server_tokens off;` в http {} блоке.
- Express/NestJS: не вызван `app.disable('x-powered-by')` или helmet с `hidePoweredBy`.
