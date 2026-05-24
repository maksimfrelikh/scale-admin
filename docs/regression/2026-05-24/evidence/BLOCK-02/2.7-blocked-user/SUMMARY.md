# 2.7 Blocked user — SUMMARY

Verdict: **PASS**.

Full lifecycle: pre-block sanity → admin blocks → operator login-attempt → old-session-revoked → admin unblocks → operator re-login → access restored.

| # | Step | Status | Body |
|---|---|---|---|
| 01 | PRE-BLOCK: `/api/auth/session` with operator-jar-2 (sanity, must still work) | **200** | session active, user.status=active |
| 02 | Admin PATCH `/api/users/{OP}/block` | **200** | user.status flipped to `blocked`; response includes updated user record |
| 03 | Operator fresh login attempt (new jar) while blocked | **401** | `{"message":"Неверный email или пароль","error":"Unauthorized","statusCode":401}` |
| 04 | Old operator-jar-2 GET `/api/auth/session` AFTER block | **401** | `{"message":"Требуется авторизация","error":"Unauthorized","statusCode":401}` |
| 05 | Old operator-jar-2 GET `/api/stores/{S001}/catalog/categories` AFTER block | **401** | same as 04 |
| 06 | Admin PATCH `/api/users/{OP}/unblock` | **200** | user.status flipped to `active`, `changed:true` |
| 07 | Operator fresh login AFTER unblock | **200** | session active, role=operator, status=active |
| 08 | Operator GET `/api/stores/{S001}/catalog/categories` AFTER unblock | **200** | access to assigned store restored |

## Findings

- **2.7.a (block):** admin endpoint `PATCH /api/users/:userId/block` (no body) returns 200 and flips status to `blocked` immediately. ✓
- **2.7.b (login-while-blocked = uniform auth-fail):** the response is `Неверный email или пароль` (Wrong email or password) — **identical to a wrong-password attempt against an active user** (BUG-REG-068 in Wave 1 used this exact body for body-shape comparison). NOT a leaky "account blocked" / "пользователь заблокирован" / "user inactive". ✓
- **2.7.c (existing sessions revoked):** `users.service.ts:92-113` predicted `revokeUserSessions(user.id, 'user_blocked')` — empirically confirmed:
  - Pre-block: operator-jar-2 → 200 with session metadata (probe 01).
  - Post-block: same jar → 401 `Требуется авторизация` (probes 04, 05).
  - The revocation is **immediate and unconditional** — no race window observed between block PATCH 200 and the follow-up 401.
- **2.7.d (recovery clean):** unblock → 200, operator can fresh-login → 200, can read STORE-001 catalog → 200. **System state restored.** ✓

## Body shape comparison vs 2.1 baseline

- The 2.7.b "blocked-login" 401 body is `{"message":"Неверный email или пароль","error":"Unauthorized","statusCode":401}` (Content-Length: 80).
- The 2.1 anon-baseline 401 body is `{"message":"Требуется авторизация","error":"Unauthorized","statusCode":401}` (Content-Length: 95).
- These are **different localizations** of the 401 (one for the login endpoint, one for the auth-required path). This is intentional — `/api/auth/login` returns `Неверный email или пароль` on any auth failure (wrong pw, nonexistent user, blocked user — all uniform on the login endpoint per Wave 1 §1.2). The two messages are scoped to different endpoints; within each endpoint the response is uniform.

## Evidence

`01-preblock-session-active.txt` .. `08-operator-store001-access-restored.txt` in this directory. All redacted.
