# BLOCK-01: Network / TLS / Redirects

- Started: 2026-05-17 20:44 Europe/Amsterdam
- Finished: 2026-05-17 20:50 Europe/Amsterdam
- Duration: ~6 мин
- Tester: tester (OpenClaw agent)
- Branch: docs/regression-2026-05-17
- Target: https://maksimfrelikh.ru
- Scope: проверка корректности HTTP/TLS уровня до прикладного тестирования

## Checklist

| # | Item | Status | Evidence | Bug |
|---|------|--------|----------|-----|
| 1 | Health endpoint (`/api/health`) → 200 + JSON ok | ✅ pass | evidence/block-01-1-health.txt | — |
| 2 | Canonical redirects (4 проверки) → 301 на https root | ✅ pass | evidence/block-01-2-redirects.txt | — |
| 3 | TLS expiry > +14 дней, issuer Let's Encrypt | ✅ pass | evidence/block-01-3-tls.txt | — |
| 4 | Security headers (HSTS обязательно) | ❌ fail | evidence/block-01-4-security-headers.txt | BUG-REG-001, BUG-REG-002 |
| 5 | CORS не должен быть `*` на `/api/*` | ✅ pass | evidence/block-01-5-cors.txt | — |
| 6 | Method handling (TRACE запрещён, 405 на POST→GET) | 🟡 partial | evidence/block-01-6-methods.txt | BUG-REG-004 |
| 7 | Нет Server/X-Powered-By disclosure | ❌ fail | evidence/block-01-7-server-disclosure.txt | BUG-REG-003 |
| 8 | www TLS cert SAN включает www | ✅ pass | evidence/block-01-8-www-tls.txt | — |
| 9 | Frontend bundle: 200, нет секретов в HTML | ✅ pass | evidence/block-01-9-frontend.txt | — |

## Results

### 1. Health endpoint ✅
- `GET https://maksimfrelikh.ru/api/health` → `200 OK`
- Body: `{"status":"ok","service":"scale-admin-backend","timestamp":"2026-05-17T18:45:46.755Z"}`
- Content-Type: `application/json; charset=utf-8`
- Сторонний наблюдение: response также раскрывает `X-Powered-By: Express` — учтено в BUG-REG-003.

### 2. Canonical redirects ✅
| Запрос | Статус | Location |
|---|---|---|
| `http://maksimfrelikh.ru` | `301` | `https://maksimfrelikh.ru/` |
| `http://www.maksimfrelikh.ru` | `301` | `https://maksimfrelikh.ru/` |
| `https://www.maksimfrelikh.ru` | `301` | `https://maksimfrelikh.ru/` |
| `https://maksimfrelikh.ru` | `200` | — |

Все 4 редиректа работают корректно. www→root до и после TLS, http→https. Канонизация на root host.

### 3. TLS expiry и issuer ✅
- `subject = CN = maksimfrelikh.ru`
- `issuer = C = US, O = Let's Encrypt, CN = E7`
- `notBefore = May 15 16:49:59 2026 GMT`
- `notAfter = Aug 13 16:49:58 2026 GMT`
- До истечения: ~88 дней (порог +14 дней — пройден с запасом).

### 4. Security headers ❌
- `Strict-Transport-Security` — **отсутствует** на всех ответах → **BUG-REG-001 (medium)**.
- `X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy` — все **отсутствуют** → **BUG-REG-002 (medium)**.
- Из observable security-relevant headers есть только `Cache-Control: no-cache` и `Vary: Origin`.

### 5. CORS ✅
- `Origin: https://evil.example` → ответ возвращает `Access-Control-Allow-Origin: https://maksimfrelikh.ru` (echo канонической, а не запрашиваемой) + `Access-Control-Allow-Credentials: true`. Браузер заблокирует ответ, потому что ACAO ≠ Origin.
- Preflight `OPTIONS /api/auth/login` с evil origin → `204 No Content`, тот же ACAO канонический. Methods: `GET,HEAD,PUT,PATCH,POST,DELETE`, allowed headers: `content-type`.
- Sanity с легитимной origin → корректный echo `https://maksimfrelikh.ru`.

Wildcard `*` нигде не наблюдается. Запросы с posted credentials с любой не-канонической origin будут отвергнуты браузером.

### 6. Method handling 🟡 partial
- `TRACE /` → `405 Method Not Allowed` от nginx — ✅ TRACE отключён.
  - Боковое: HTML тело страницы 405 содержит `nginx/1.24.0 (Ubuntu)` (учтено в BUG-REG-003).
- `POST/PUT/DELETE /api/health` → `404 Not Found` вместо ожидаемого `405 Method Not Allowed` → **BUG-REG-004 (low)**. Это default NestJS/Express поведение, но семантически некорректно по RFC 7231.

### 7. Server / version disclosure ❌
- `Server: nginx/1.24.0 (Ubuntu)` на всех ответах (включая 405 HTML).
- `X-Powered-By: Express` на всех `/api/*` ответах.
- → **BUG-REG-003 (low)**.

### 8. www TLS cert SAN ✅
- Subject: `CN = maksimfrelikh.ru`
- SAN: `DNS:maksimfrelikh.ru, DNS:www.maksimfrelikh.ru`
- Same issuer/dates как root cert (один сертификат покрывает обе hostname).
- Редирект `https://www.→https://root` валидируется без TLS warning.

### 9. Frontend bundle ✅
- `GET /` → `200`, `Content-Type: text/html`, body 396 байт (Vite shell).
- HTML минимальный: title `Scale Admin`, один JS chunk `/assets/index-CvhNUbOB.js`, один CSS chunk `/assets/index-MNDf7lO3.css`, `<div id="root">`.
- Grep по `token|secret|api_key|password|private_key|env=|apikey|authorization` — **нет совпадений**. В HTML секретов нет.

## Bugs filed

| ID | Severity | Title |
|---|---|---|
| BUG-REG-001 | medium | HSTS (Strict-Transport-Security) отсутствует |
| BUG-REG-002 | medium | Прочие security headers отсутствуют (XFO, XCTO, CSP, Referrer-Policy, Permissions-Policy) |
| BUG-REG-003 | low | Утечка версии nginx и framework (Server, X-Powered-By) |
| BUG-REG-004 | low | POST/PUT/DELETE на /api/health → 404 вместо 405 |

## Exit criteria

- [x] Все 9 пунктов выполнены: 6 ✅, 2 ❌, 1 🟡
- [x] Все фейлы закрыты отдельными BUG-REG-NNN
- [x] BLOCK-01-network.md заполнен
- [x] Heartbeat manager-у — отправляется отдельным сообщением

## Notes for next block

- API backend идентифицирует себя через `X-Powered-By: Express` → подтверждает что backend NestJS на Express adapter.
- Server time: `Sun, 17 May 2026 18:45:46 GMT` — корректно совпадает с реальным UTC.
- `Access-Control-Allow-Credentials: true` присутствует — значит cookies/credentials предполагаются для всех `/api/*` запросов. На Block 2 (auth) проверить, что cookie-атрибуты HttpOnly+Secure+SameSite корректны.
