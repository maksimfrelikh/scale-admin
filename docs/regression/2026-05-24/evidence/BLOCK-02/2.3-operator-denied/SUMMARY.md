# 2.3 Operator denied (admin-only endpoints) — SUMMARY

Verdict: **PASS**.

10 probes against admin-only routes from the operator session. All 9 admin-only endpoints return uniform 403; the one non-admin endpoint (GET /api/stores — operator-allowed at route level) returns a filtered list.

| # | Method | Path | Expected | Status | Body |
|---|---|---|---|---|---|
| 01 | GET | `/api/users` | 403 | **403** | `{"message":"Недостаточно прав","error":"Forbidden","statusCode":403}` |
| 02 | POST | `/api/auth/invites` | 403 | **403** | same as 01 |
| 03 | GET | `/api/stores` | 200 filtered OR 403 | **200** | only STORE-001 (operator's assignment) |
| 04 | POST | `/api/stores` | 403 | **403** | same as 01 |
| 05 | PATCH | `/api/stores/{S001}` (admin-level store edit) | 403 | **403** | same as 01 |
| 06 | PATCH | `/api/users/{OP}/role` | 403 | **403** | same as 01 |
| 07 | PATCH | `/api/users/{OP}/block` (self-block attempt!) | 403 | **403** | same as 01 |
| 08 | DELETE | `/api/users/{OP}` | 403 | **403** | same as 01 |
| 09 | POST | `/api/stores/{S001}/scales` | 403 | **403** | same as 01 |
| 10 | GET | `/api/logs/global` | 403 | **403** | same as 01 |

## Findings

- **All 9 admin-only endpoints → 403** with byte-identical body `{"message":"Недостаточно прав","error":"Forbidden","statusCode":403}`. RolesGuard fires before the controller logic, so operator never reaches a handler that could leak resource state. ✓
- **GET /api/stores → 200 with filtered list:** operator sees only STORE-001 (their single assignment). This matches `stores.service.ts listVisibleStores(user)` filtering behavior. Brief explicitly allows either 403 or filtered list — staging implements **filtered list**. PRD §6.1-compliant.
- **No CSRF issues:** all PATCH/POST/DELETE probes passed a fresh CSRF token (`x-csrf-token` header from `GET /api/auth/csrf` with operator jar). They were rejected by **RolesGuard** with 403 `Недостаточно прав` (insufficient rights), NOT by CSRF middleware. Confirms operator session+CSRF are valid; only role gate blocks.
- **Self-block attempt (#07) → 403:** operator cannot block themselves. Even though they're acting on their own user record, the `@RequireRoles('admin')` class-level decorator on `UsersController` blocks the call before any self-reference logic could kick in.

## Brief alignment note

Brief listed `DELETE /api/stores/{S001} → 403`. There is **no DELETE route on `/api/stores/:id`** in the codebase (see `stores.controller.ts` — only GET, POST, PATCH defined; `grep -n '@Delete'` confirms zero matches). Stores are archived via `PATCH /api/stores/:id {"status":"archived"}`, not deleted. The DELETE probe was therefore not run — it would return a 404 from Express's default router (route-not-found), which is observably distinct from a 403 and would muddy the uniform-403 grid. Documented as a route-map note, not a bug.

## Evidence

`01-get-users.txt` .. `10-get-logs-global.txt` in this directory. All redacted.
