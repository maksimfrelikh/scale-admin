# BUG-REG-021: Invite принимает expiresAt в прошлом — invite создаётся уже истёкшим

- Severity: medium
- Area: api / auth
- Role: admin
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: curl
- Found: 2026-05-17 23:11
- Related known: BUG-REG-020, BUG-REG-009

## Шаги воспроизведения

1. Авторизоваться admin-ом, получить CSRF.
2. POST /api/auth/invites:
   ```json
   {"email":"qa-past@example.test","role":"operator","expiresAt":"2026-05-16T00:00:00Z"}
   ```
   (вчерашняя дата)

## Ожидаемое

- 400 с сообщением: "expiresAt must be in the future" / "Invite expiration cannot be in the past".
- UI inline error на datetime-local поле (или min={now}).

## Фактическое

- 201 Created. Запись invite создана с expiresAt в прошлом.
- Получатель не сможет принять invite — он уже истёк. Operator/admin теряет время, разбираясь почему invite не работает.
- BUG-REG-009: нет DELETE для invites — invitor не может удалить мусорный invite.

## Impact

- Operational: admin создаёт invite, отправляет email, invitee пытается принять — ошибка "expired", invitor не понимает причину.
- Возможны "вечно истёкшие" учётные записи в БД.

## Evidence

- `evidence/block-06/api-report.json` → `D.cases[expires_past]`

## Hypothesis

Серверная валидация expiresAt: только формат даты, без сравнения с `now()`. Достаточно `if (new Date(expiresAt) <= new Date()) throw new BadRequest(...)` на endpoint.

UI: datetime-local input без атрибута `min={now.toISOString()}` — можно ввести любую прошлую дату.
