# BUG-REG-022: Invite duplicates allowed без upsert / no GET no DELETE → мусорная invite-таблица

- Severity: low
- Area: api / auth
- Role: admin
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: curl
- Found: 2026-05-17 23:12
- Related known: BUG-REG-009 (no GET/DELETE for invites)

## Шаги воспроизведения

1. Авторизоваться admin-ом.
2. POST /api/auth/invites дважды с одним и тем же email (новый, не существующего пользователя):
   ```json
   {"email":"qa-dup-2026@example.test","role":"operator","expiresAt":"2026-05-24T..."}
   ```

## Ожидаемое

Один из:
- 409 на втором запросе ("Active invite already exists for this email").
- 200/201 upsert (обновить существующий invite expiresAt, вернуть тот же id).

## Фактическое

- Оба POST вернули 201 Created с разными `invite.id`.
- В БД теперь две (или больше) записи invite для одного email.
- Из-за BUG-REG-009 admin не может через UI/API список инвайтов посмотреть или удалить дубли.
- В сочетании с BUG-REG-021 (past expiresAt) и BUG-REG-020 (bad emails) — таблица invites может расти неконтролируемо.

## Impact

- DB-bloat при долгой эксплуатации.
- При попытке зарегистрироваться по email с несколькими активными invites — поведение не определено (какой из них примется?).

## Evidence

- `evidence/block-06/api-report.json` → `duplicates.inviteEmail`
- Existing `duplicates.inviteEmail` пример: `first.status=201, second.status=201, different IDs`.

## Hypothesis

Backend не делает upsert или check-exists. Нужно либо unique constraint `(email, acceptedAt IS NULL)`, либо upsert логика, либо отдельно решить BUG-REG-009 (GET/DELETE) и оставить duplicate-allow как «фичу».
