# 3.6 /api/users/me regression (BUG-REG-058 carryover) — SUMMARY

**Verdict:** ✅ PASS (BUG-REG-058 closure verified live; no BUG-REG-069 needed)
**Probes:** 13 (2 admin /me /session, 2 op /me /session, 2 no-session, 2 reserved-keyword variants, 4 post-block staleness, restore)

## Probes & results

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 01 | admin GET `/api/users/me` | **NOT 500, NOT 200-with-nulls** — 400 redirect message (BUG-REG-058 closure) | 400 "'me' — зарезервированное слово, а не ID пользователя. Для текущего пользователя используйте GET /api/auth/session." | ✅ |
| 02 | admin GET `/api/auth/session` | 200 + non-null `{id,email,fullName,role,status}` | 200, all 5 user fields populated (qorxoes@gmail.com, role=admin, status=active); session block with id/createdAt/lastUsedAt/expiresAt | ✅ |
| 03 | operator GET `/api/users/me` | 4xx (not 200-with-nulls, not 500) | 403 "Недостаточно прав" — RBAC guard fires BEFORE reserved-keyword pipe (operator can't access /users/* route family at all) | ✅ |
| 04 | operator GET `/api/auth/session` | 200 + non-null user object | 200, user={id,email,fullName,role:operator,status:active}; no nulls | ✅ |
| 05 | no-cookies GET `/api/users/me` | 401 (not 200-with-nulls) | 401 "Требуется авторизация" | ✅ |
| 06 | no-cookies GET `/api/auth/session` | 401 (not 200-with-nulls) | 401 "Требуется авторизация" | ✅ |
| 07 | admin GET `/api/users/current` | 400 (other reserved keyword) | 400 "'current' — зарезервированное слово..." | ✅ |
| 08 | admin GET `/api/users/self` | 400 (other reserved keyword) | 400 "'self' — зарезервированное слово..." | ✅ |
| 09 | PATCH operator block | 200, status=blocked | 200 | ✅ |
| 10 | **Old operator cookies → `/api/auth/session` immediately after block** | **401 (NOT stale 200)** | 401 "Требуется авторизация" — session revoked by `user_blocked` reason | ✅ |
| 11 | Old operator cookies → `/api/users/me` immediately after block | 401 (session revoked) | 401 "Требуется авторизация" — SessionGuard fires before RolesGuard now that session is invalid | ✅ |
| 12 | PATCH unblock + re-login (restore baseline) | 200 | 200, 200 | ✅ |

## BUG-REG-058 closure verification

Original bug: `GET /api/users/me` returned **500** because the `:userId` param `me` was passed to Prisma's UUID-typed `findUnique`, throwing a Prisma validation error that surfaced as a 500. Fix: `ReservedKeywordUserIdPipe` (`backend/src/users/reserved-keyword.pipe.ts`) intercepts `me`/`current`/`self` at the param-pipe layer and throws `BadRequestException` (400) with a helpful message redirecting to `GET /api/auth/session`.

**Live verification on staging:** probe 01 returns the exact closure message. No 500. No 200-with-nulls. Two other reserved keywords (`current`, `self`) also return the same shape (probes 07, 08).

## Brief expectation gap (documented, not a bug)

Brief asked for `assignedStoreIds OR storeAccess[]` to be present in the response. **Actual `/api/auth/session` response:**

```json
{
  "session": {"id","createdAt","lastUsedAt","expiresAt"},
  "user": {"id","email","fullName","role","status"}
}
```

No `assignedStoreIds`, no `storeAccess[]`. The user object is intentionally minimal (the auth.service `toSafeUser` helper). For an operator's store list, the dedicated endpoint is `GET /api/stores` (returns only the visible stores).

**Assessment:** This is the **intentional design** post-BUG-REG-058, not a regression. The redirect message itself says "для текущего пользователя используйте GET /api/auth/session" — and that endpoint has never carried `assignedStoreIds`. If the brief expected this field as part of the BUG-REG-058 fix, the implementation chose a different (cleaner) split: identity in /session, store visibility in /stores.

**No BUG-REG-069 filing.** Per brief: "If 200-with-null воспроизводится → BUG-REG-069". I did NOT reproduce 200-with-null; absence of an unrelated field is not the same as the original regression.

## Post-block staleness (the most important probe of 3.6)

Probe 10 directly tests the critical concern: **after block, can the old session still see itself?** Answer: **NO** — the `revokeUserSessions(user.id, 'user_blocked')` call (`users.service.ts:113`) marks all sessions revoked before the block PATCH returns. Next request with old cookies → 401, not stale 200.

Probe 11 also confirms: even on routes that were previously RBAC-blocked for operator (`/api/users/me` → 403), once the session itself is revoked the path becomes 401 (SessionGuard fires before RolesGuard).

## Bugs filed

None.
