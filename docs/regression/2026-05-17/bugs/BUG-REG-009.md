# BUG-REG-009: invite management gap — admin создаёт invite, но не может ни list, ни revoke

- Severity: medium
- Area: rbac, api, auth
- Role: admin
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: curl + Chrome headless
- Found: 2026-05-17 21:35

## Шаги воспроизведения

1. Залогиниться под `qa-admin@***.invalid`.
2. Открыть `dashboard#users-access` → нажать `Create invite`, заполнить email + role + expiresAt.
3. Submit. Получить `HTTP 201` от `POST /api/auth/invites` с `invite.id`.
4. Попытаться найти созданный invite:
   - В UI Users & Access: pending invites не отображаются (ни таблицей, ни секцией).
   - `GET /api/auth/invites` → **404 Not Found** ("Cannot GET /api/auth/invites")
   - `GET /api/invites`, `/api/invitations`, `/api/admin/invitations` → 404
5. Попытаться отменить:
   - `DELETE /api/auth/invites/{id}`, `/api/invites/{id}`, `/api/auth/invites/{id}/revoke` → 404 для всех
   - `PATCH/PUT` тех же путей → 404

## Ожидаемое

Если admin может создавать invite, должна существовать:
1. Возможность увидеть список pending/expired invites (минимум — endpoint и/или UI).
2. Возможность отозвать ошибочный invite (DELETE / status:revoked) до того как он будет accepted.

Идеально — UI секция в Users & Access "Pending invites" с кнопкой Cancel/Revoke на каждой строке.

## Фактическое

- `POST /api/auth/invites` работает (201, возвращает `{invite: {id, email, role, expiresAt, acceptedAt, createdAt}}`).
- Никакого GET/DELETE/PATCH для invites не существует на API.
- В Users & Access UI нет ни секции pending invites, ни row-actions для них.
- Единственный путь "сбросить" неправильный invite — дождаться expiresAt или ручное вмешательство в БД.

## Network / Console

```
POST /api/auth/invites HTTP/1.1
content-type: application/json
x-csrf-token: <…>
{"email":"<…>","role":"operator","expiresAt":"<…>"}
→ 201 Created
{"invite":{"id":"<uuid>","email":"<…>","role":"operator","expiresAt":"<…>","acceptedAt":null,"createdAt":"<…>"}}

GET /api/auth/invites → 404 "Cannot GET /api/auth/invites"
DELETE /api/auth/invites/{id} → 404
PATCH /api/auth/invites/{id} → 404
```

Сторонний наблюдение: `GET /api/users/invite` возвращает **500** (а не 404 / 405) — отдельный baseline issue, не блокер.

## Impact

1. **Operational**: ошибочный invite (typo в email, не тот человек) нельзя отозвать. Если приглашение ушло на чужой реальный адрес — третья сторона может его claim до expiry.
2. **Security (medium)**: invite с ролью `admin` нельзя отменить — выдача admin-роли через ошибку становится практически безвозвратной.
3. **Auditability**: admin не знает, сколько pending invites сейчас в системе и кому. Не может своевременно reconcile.
4. **Operational risk**: при тестировании Block 3 случайно создано 2 orphan invite-записи на `.invalid` TLD (см. ниже) — нет UI/API чтобы их прибрать. Они expirят 2026-05-24, но в БД до тех пор будут висеть.

## Evidence

- evidence/block-03/admin-invite-trace.json — POST /api/auth/invites trace (201)
- evidence/block-03/admin-invite-flow.json
- evidence/block-03/admin-users-access-full.txt — full UI snapshot без секции "Pending invites"
- evidence/block-03/admin-users-access-html.html — UI HTML

## Orphan invites созданные при тестировании (нужна чистка manager-ом)

| Invite ID | Email | Role | expiresAt |
|---|---|---|---|
| `5e697fa6-bf09-4264-b5fd-92a9e4bba52e` | qa-block3-rbac-1779046499156@example.invalid | operator | 2026-05-24T17:34:00Z |
| `3b5c78b5-95c7-4e98-a5dd-a8d21c11cd78` | qa-block3-rbac-checktoken@example.invalid | operator | 2026-05-24T17:34:00Z |

Email — `.invalid` TLD (RFC 2606), почта на них не доставляется. Token из API response недоступен (response не содержит token поле). Риск низкий, но manager должен прибрать вручную в БД.

## Hypothesis

Backend имеет только `POST /api/auth/invites` handler, без `Get`/`Delete` декораторов. Frontend `Users & Access` рендерит инвайт-форму, но не запрашивает список pending invites (соответствующего endpoint просто нет). Минимальный фикс: добавить `GET /api/auth/invites?status=pending` + `DELETE /api/auth/invites/:id` с RBAC `admin` + UI секция в Users & Access.
