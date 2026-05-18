# BUG-REG-025: No password reset / forgot password flow

- Severity: high
- Area: auth / functional gap
- Role: unauth
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: Chromium / curl
- Found: 2026-05-17 23:16
- Related known: —

## Шаги воспроизведения

1. Открыть https://maksimfrelikh.ru/login в incognito.
2. Искать ссылку "Forgot password", "Reset password", "Восстановить пароль" — НЕТ ни одной.
3. Probe SPA routes:
   - `/forgot-password`, `/reset-password`, `/password-reset`, `/auth/forgot`, `/auth/reset` → все возвращают **тот же login form** (silent fallback на login).
4. Probe backend endpoints:
   - POST `/api/auth/password-reset` → 404
   - POST `/api/auth/forgot-password` → 404
   - POST `/api/auth/reset-password` → 404
   - POST `/api/auth/forgot` → 404
   - POST `/api/auth/reset` → 404
   - POST `/api/auth/password/request` → 404
   - POST `/api/users/password-reset` → 404

## Ожидаемое

Минимум один из:
- Ссылка "Forgot password?" на /login с flow:
  1. Ввести email → backend отправляет письмо с reset token (rate-limited).
  2. Открыть ссылку → форма "New password" → token валидируется → пароль обновлён.
- Документированный в `BUG-UX-013` (или эквивалент) пункт "password reset out of scope MVP, admin reset делается через DB".

## Фактическое

- Никакой UI flow восстановления пароля не существует.
- Никаких backend endpoints для reset / forgot.
- На login form (см. recon-2 и ui-report.json E.linksOnLogin) **нет ни одной `<a>` ссылки** — вообще.

## Impact

- Пользователь, забывший пароль, **не имеет способа восстановления**:
  - Self-service: невозможно.
  - Эскалация: должен писать admin-у в обход системы (Telegram/email/звонок).
  - Admin: должен через `psql` обновить hash напрямую, либо удалить UserCredential и создать invite повторно — оба варианта не задокументированы для пользователя.
- Для MVP это допустимо ТОЛЬКО если зафиксировано как known-out-of-scope. На текущий момент в `BUG-UX-001..013` (известные) — не упомянуто.

## Evidence

- `evidence/block-06/api-report.json` → `passwordReset` (все 7 эндпойнтов 404)
- `evidence/block-06/ui-report.json` → `E.forgotTextOnLogin: []`, `E.linksOnLogin: []`
- `evidence/block-06/ui-E-login-page.png`

## Hypothesis

Функционал не реализован. Минимально для MVP:
- В UI добавить статичный текст: "Если вы забыли пароль, обратитесь к администратору" — это снимет 70% жалоб.
- Среднесрочно: POST /api/auth/password-reset/request + POST /api/auth/password-reset/confirm с rate-limit и token expiry (15 минут).

## Severity rationale

`high`, потому что:
- Это функциональный gap в core auth flow, не косметика.
- Без него любой потерянный пароль — incident для admin-а вручную.
- На live проде с реальными пользователями такая ситуация неизбежна.
