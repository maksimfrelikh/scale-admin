# BUG-REG-071 — Path-parameter `:id` not in UUID format returns HTTP 500 with English `Internal server error`

**Severity:** medium (UX/error-handling + i18n surface, no security exploit, matches BUG-REG-069 precedent)
**Status:** open
**Discovered:** 2026-05-24, Wave 7 §7.1 (REGRESSION-2026-05-24)
**Env:** staging (commit `0cf0966`); also expected on prod commit `3538b7c` (same code path)
**Reporter:** Lead (single-inline)

## Summary

Routes whose handler passes a path-parameter `:id` directly into `prisma.findUnique({where:{id:<value>}})` without a UUID-format guard fail with **HTTP 500 `{"statusCode":500,"message":"Internal server error"}`** when the parameter is syntactically non-UUID. Should be **400** (validation) or **404** (not found) with a Russian, structured payload. The English `Internal server error` falls through from NestJS's default exception filter and breaches the Wave 7 i18n watchpoint (0% English leakage user-facing).

## Confirmed-affected routes

| Route                               | Method | Probe (admin auth)                                                                  | Observed                                            |
|-------------------------------------|--------|-------------------------------------------------------------------------------------|-----------------------------------------------------|
| `/api/stores/:storeId`              | GET    | `/api/stores/not-a-uuid`                                                            | `500 {"statusCode":500,"message":"Internal server error"}` |
| `/api/stores/:storeId`              | PATCH  | body `{"name":"X"}` + `x-csrf-token`                                                | `500 {"statusCode":500,"message":"Internal server error"}` |
| `/api/products/:id`                 | GET    | `/api/products/not-uuid`                                                            | `500 {"statusCode":500,"message":"Internal server error"}` |

Routes that handle bad-UUID correctly (return 404 with Russian message) — for contrast:
- `/api/users/:userId` GET — returns `404 "Пользователь не найден"` (treats invalid-UUID lookup as not-found).
- `/api/auth/invites/:id` DELETE — returns `404 "Cannot DELETE ..."` (route mismatch, framework default — different issue).

## Repro (staging)

```bash
JAR=/tmp/admin.jar
curl -sS -c $JAR https://staging.maksimfrelikh.ru/api/auth/csrf >/dev/null
CSRF=$(grep csrf $JAR | tail -1 | awk '{print $7}')
curl -sS -b $JAR -c $JAR -X POST -H "Content-Type: application/json" -H "x-csrf-token: $CSRF" \
  -d '{"email":"qorxoes@gmail.com","password":"12345678"}' \
  https://staging.maksimfrelikh.ru/api/auth/login >/dev/null

# Repros A — GET stores/:storeId
curl -sS -b $JAR https://staging.maksimfrelikh.ru/api/stores/not-a-uuid
# {"statusCode":500,"message":"Internal server error"}

# Repros B — PATCH stores/:storeId
curl -sS -b $JAR -X PATCH -H "Content-Type: application/json" -H "x-csrf-token: $CSRF" \
  -d '{"name":"X"}' https://staging.maksimfrelikh.ru/api/stores/not-uuid
# {"statusCode":500,"message":"Internal server error"}

# Repros C — GET products/:id
curl -sS -b $JAR https://staging.maksimfrelikh.ru/api/products/not-uuid
# {"statusCode":500,"message":"Internal server error"}
```

## Code path

`backend/src/stores/stores.service.ts:302-313 findStoreById()` — only guards on falsy `storeId`, then passes raw value into `prisma.store.findUnique({where:{id:storeId}})`. Prisma raises a non-Prisma-known error (column type mismatch / value parsing) which is not caught — bubbles to Nest's default `HttpExceptionFilter` → `500 Internal server error`.

Analogous path in `backend/src/products/products.service.ts` (`findProduct`).

`backend/src/stores/stores.controller.ts:61 @Get(':storeId')` + `:storeId` patched via @Patch — no `ParseUUIDPipe` applied at controller level.

## Impact

- **i18n:** English `Internal server error` is surfaced to the API consumer (and to the frontend's generic toast for un-mapped errors). Breaches §7.1 watchpoint.
- **UX:** Operator/Admin tools cannot distinguish a server fault from a typo'd URL or stale link. Browser address-bar typos produce a "Server error" toast.
- **No security exploit:** auth/RBAC guards run BEFORE the controller body, so unauthorized callers still get 401/403; this only manifests for authenticated users with route access. No information leak (same generic error for any bad-UUID).
- **No data integrity issue:** read-only failure path; PATCH would also fail before any write due to the same lookup.

## Suggested fix

Two layers, pick one:

**Option 1 — Controller-level pipe (preferred, broad coverage)**

```typescript
// stores.controller.ts
import { ParseUUIDPipe } from '@nestjs/common';

@Get(':storeId')
getStore(@Param('storeId', new ParseUUIDPipe({ version: '4' })) storeId: string) { ... }
```

`ParseUUIDPipe` throws `BadRequestException` with default message; override the factory to return a Russian message:

```typescript
new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('Некорректный идентификатор'),
})
```

**Option 2 — Service-level guard** (matches `findStoreById` pattern, but per-service)

```typescript
private async findStoreById(storeId: string): Promise<StoreRecord> {
  if (!storeId || !isUUID(storeId, 4)) {
    throw new NotFoundException('Магазин не найден'); // treat as not-found, like users route
  }
  ...
}
```

Audit all `:id` / `:storeId` / `:userId` / `:productId` / `:catalogVersionId` / `:bannerId` route params and apply consistent treatment.

## Evidence

`docs/regression/2026-05-24/evidence/BLOCK-07/7.1-i18n/admin/04.json`, `13.json`, `16.json` (HTTP 500 bodies), with `probes.txt` log.

## Why medium not high

- No security exploit, no data integrity issue, no PII leak.
- Same root cause as BUG-REG-069 (Prisma error fallthrough) which is rated medium.
- Wave 7 watchpoint "Any English string surfaced to user" is calibrated for **deliberate copy** missing translation (e.g., a placeholder text or button label hard-coded in English). Framework-default fall-through is qualitatively different — fix is to *prevent the fall-through* (UUID-pipe), not "translate Internal server error".
- Same precedent: BUG-REG-069 (banner FK 500), also a Prisma error fallthrough, also rated medium.

## Out of scope / not bugs

- `GET /api/stores/<valid-format-but-unknown-UUID>` → 404 "Магазин не найден" (working as designed).
- Wrong-route framework-default `Cannot GET /api/<unknown>` (e.g., `/api/auth/me`, `/api/scales/devices/:id`) — Express 404 fallthrough, defense-in-depth backlog (per Wave 7 brief, NOT blocker, documented separately).

## Wave 7 §7.6 addendum — frontend translation map defense-in-depth

While auditing the frontend error pipeline (`shared/api/backendApi.ts:51,266,279`), discovered that the `backendMessageTranslations` map does NOT have an entry for `'Internal server error'`. The fall-through path at `normalizeError` line 341 (`message: translatedMessage ?? \`Сервер вернул HTTP ${error.status}\``) would therefore surface the English `Internal server error` string to the user toast unchanged.

**Defense-in-depth recommendation** (in addition to the primary backend fix above): add to `backendMessageTranslations`:

```typescript
'Internal server error': 'Внутренняя ошибка сервера. Попробуйте позже.',
```

This ensures that even if a future unhandled exception slips through to NestJS's default filter (or if backend deploy lags fix rollout), the frontend layer translates. Not a new bug — appended here as a fix recommendation companion to the primary `ParseUUIDPipe` fix.
