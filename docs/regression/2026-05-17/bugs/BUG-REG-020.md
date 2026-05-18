# BUG-REG-020: Invite endpoint принимает невалидные email (`a@`, `@b.c`, `a@b`, `a@b.c.`)

- Severity: high
- Area: api / auth / forms
- Role: admin
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: curl / Playwright
- Found: 2026-05-17 23:10
- Related known: BUG-REG-009 (invite не имеет GET/DELETE)

## Шаги воспроизведения

1. Авторизоваться admin-ом.
2. POST /api/auth/invites:
   ```json
   {"email":"a@b","role":"operator","expiresAt":"2026-05-24T20:00:00Z"}
   ```
3. То же для `a@`, `@b.c`, `a@b.c.`.
4. Через UI: `/dashboard#users-access` → ввести `a@b` в Email → **Create invite**.

## Ожидаемое

- 400 с сообщением: "Valid email is required" или эквивалент.
- UI inline error на поле Email.

## Фактическое

| email | API status | UI поведение |
|---|---|---|
| `abc` | 400 | UI блокирует (HTML5 type=email) |
| `a@` | **201 Created** | UI отправляет POST (HTML5 type=email пропускает) |
| `@b.c` | **201 Created** | UI отправляет POST |
| `a@b` | **201 Created** | UI отправляет POST |
| `a@b.c.` (trailing dot) | **201 Created** | UI отправляет POST |
| `qa+<script>alert(1)</script>@example.test` | **201** | — |
| `qa+'; DROP TABLE users;--@example.test` | **201** | — |
| `qa-{1000 chars}@example.test` | **201** | — |

Sample API response для `a@b`:
```json
{"invite":{"id":"a611d18f-d5f2-41c1-b975-422b666cafe3","email":"a@b","role":"operator","expiresAt":"..."}}
```

## Impact

- Полная регистрация по принятому invite: invitee пытается войти по email `a@b` — потенциально успешно (если регистрация принимает тот же email).
- Combined с BUG-REG-009 (no DELETE for invites) — мусорные invite-записи нельзя удалить.
- Email с XSS-payload в local part: будет отображаться где-то в админке. UI на текущей версии экранирует `<script>` как text (см. BLOCK-06 ui-report.json), но defense-in-depth отсутствует — backend должен валидировать на стадии создания.
- 1000-символьная local part: RFC 5321 ограничивает local part 64 символами, total 254. DB-bloat и потенциальный DoS.

## Network / Console

```
POST /api/auth/invites {"email":"a@b","role":"operator","expiresAt":"2026-05-24T19:22:00.000Z"}
  → 201 Created
```

## Evidence

- `evidence/block-06/api-report.json` → `D.cases[bad_email_*]`, `D.cases[xss_email_local]`, `D.cases[sql_email]`, `D.cases[long_local_1000]`
- `evidence/block-06/ui-report.json` → `D.bad_email_a_at_b`

## Hypothesis

Backend email-валидатор использует упрощённый regex (`.+@.+`). Заменить на RFC 5322 совместимый pattern, проверять, что local part ≤ 64, total ≤ 254, обязательное наличие dot в domain part.
