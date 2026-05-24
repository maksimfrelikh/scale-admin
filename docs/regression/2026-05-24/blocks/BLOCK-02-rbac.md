Target: https://staging.maksimfrelikh.ru. Production trogать запрещено кроме GET /api/version и /api/health.

# BLOCK-02-rbac — REGRESSION-2026-05-24 Wave 2 (RBAC matrix)

**Dispatch:** Lead (Maksim) → Manager+Tester collapsed (depth budget 1/1, single inline run — same pattern as Wave 1).
**Scope:** PRD §2.1, §2.2, §6.1, §11.4 (role gates, store scoping, blocked-user lifecycle, error-shape consistency).
**Baseline at dispatch:** staging `commit=0cf0966`, prod `commit=3538b7c`. All four liveness endpoints 200 (see `evidence/BLOCK-02/_startprobe/start-probe.txt`).
**Severity gate:** security perimeter (info-leak, cross-tenant access, session lifecycle).
**Run:** 2026-05-24 13:43 GMT+2 onwards.

---

## Verdict (final)

**Wave 2 — PASS.** 8 / 8 sub-blocks PASS. **No bugs filed.** No 🔴 escalation triggers tripped. RBAC perimeter holds — anon → uniform 401, operator-allowed → 200, operator-denied → uniform 403, cross-store → uniform 403 with NO exists/no-access distinction (the critical info-leak gate). Session lifecycle (logout, tampering, no-cookie) and blocked-user lifecycle (block→revoke→login-fail→unblock→recover) all behave correctly. Cross-cutting error-body shapes are byte-identical within each family with intentional, non-leaking differences across families.

**Cleanup:** STORE-WAVE2 archived (status=archived, filtered from active list, still retrievable by id for admin audit). Operator unblocked + verified can login + access STORE-001. Admin verified can login. No lockouts. No production writes.

**Re-probe drift:** ZERO — staging `0cf0966` (start) → `0cf0966` (end); prod `3538b7c` (start) → `3538b7c` (end); all four liveness endpoints 200 throughout.

## Sub-block grid (final)

| Sub-block | Status | Bugs | Notes |
|---|---|---|---|
| 2.1 anonymous baseline | ✅ PASS | none | 8 GETs uniform 401; 2 POSTs uniform 403 CSRF (middleware ordering — brief-prediction nuance, not a leak) |
| 2.2 operator allowed (STORE-001) | ✅ PASS | none | 9 GETs 200; 2 idempotent banner PATCHes 200. Price/placement PATCH SKIPped (empty fixtures on staging) |
| 2.3 operator denied (admin-only) | ✅ PASS | none | 9 admin-only routes → uniform 403 "Недостаточно прав". GET /api/stores returns operator's assigned list (PRD-compliant filtering) |
| 2.4 operator cross-store scoping | ✅ PASS | none | **Info-leak gate PASS**: 12 in-band probes (WAVE2 + bogus-UUID) → byte-identical 403. DELETE → Express default 404 (route doesn't exist for any role — not RBAC) |
| 2.5 admin global | ✅ PASS | none | 11 admin reads 200 (incl. WAVE2). Bogus-UUID → distinguishable 404 (admin-only signal — intended dual-axis) |
| 2.6 session lifecycle | ✅ PASS | none | Logout 200→401 on next req. Tampered cookie 401. No-cookie 401. All 401s byte-identical |
| 2.7 blocked user | ✅ PASS | none | Block 200, sessions revoked immediately, login-while-blocked → uniform "Неверный email или пароль", unblock 200, recovery 200 |
| 2.8 error consistency | ✅ PASS | none | 14 × 401 byte-identical; 9 × 403 "Недостаточно прав" byte-identical; 12 × 403 "Нет доступа к магазину" byte-identical; 3 × 404 different (cross-role, never operator-visible) |

---

## Targets & policy

- **Staging (full coverage):** `https://staging.maksimfrelikh.ru` @ `0cf0966`.
- **Prod (liveness only):** `https://maksimfrelikh.ru` @ `3538b7c`. Only `GET /api/version` and `GET /api/health`. Zero writes, zero auth, zero login.
- Test accounts (Wave 2 brief, BUG-REG-067 follow-up — Maksim seeded these by hand after Wave 1):
  - `qorxoes@gmail.com` / `12345678` (admin)
  - `unit-cusp-slam@duck.com` / `12345678` (operator, assigned to STORE-001 only)
- Lockout policy: `AUTH_FAILED_LOGIN_LOCK_MINUTES=15`, ≤4 wrong-pw per (ip,email) per 15 min. Wave 2 plans no wrong-pw probes against either account.

## Route map (verified via backend code-review pre-flight)

| Brief's path | Real route | Decorators |
|---|---|---|
| `/api/users` | `/api/users/*` | class-level `@RequireRoles('admin')` (`users.controller.ts:21`) |
| `/api/stores` | `/api/stores` | `@Get` → `admin,operator`; `@Post` → `admin` only |
| `/api/stores/{id}/catalog` | `/api/stores/:storeId/catalog/*` | class-level `admin,operator` + `@RequireStoreAccess` |
| `/api/stores/{id}/products` | `/api/products` (top-level, not store-scoped at route level) | `admin,operator` |
| `/api/stores/{id}/prices` | `/api/stores/:storeId/prices/*` | class-level `admin,operator` + `@RequireStoreAccess` |
| `/api/stores/{id}/advertising` | `/api/stores/:storeId/advertising/banners/*` | class-level `admin,operator` + `@RequireStoreAccess` |
| `/api/audit-logs` | `/api/logs/global` (admin) + `/api/stores/:storeId/logs` (admin,operator) | per-method |
| `/api/scale-devices` | `/api/stores/:storeId/scales` (GET admin,operator) + `/api/scales/:deviceId/*` (admin only) | per-method |

`:storeId` is the **internal UUID** (`stores.service.ts:307` — `prisma.store.findUnique({where:{id:storeId}})`), not the `code` field. STORE-001 must be resolved to its UUID after admin login.

## Predicted behavior (from code-review)

- **2.4 cross-store info-leak risk:** `store-access.guard.ts:35-37` returns uniform `403 'Нет доступа к магазину'` for both "operator not assigned" and "store doesn't exist" — guard fires before handler `NotFoundException`. Safe shape predicted.
- **Operator GET /api/stores:** `stores.service.listVisibleStores(user)` filters by role/assignment. Operator → 200 with filtered list (not 403). Brief flags this as "either 403 or filtered list is acceptable" — filtered list is the spec.
- **2.6.a logout:** `auth.controller.ts:142-152` always 200 with `{revoked: true|false}`. Body 200 + jar-cleared.
- **2.7.c sessions-revoked-on-block:** `users.service.ts:92-113` calls `revokeUserSessions(user.id, 'user_blocked')` immediately in the block transaction. PRD-compliant: old session → 401 on next protected GET.
- **User block/unblock routes:** `PATCH /api/users/:userId/block` (no body, sets status=blocked) and `PATCH /api/users/:userId/unblock` (no body, sets status=active).
- **Store archive:** `PATCH /api/stores/:id` with body `{"status":"archived"}` (status enum: active|inactive|archived per `stores.service.ts:342-344`).

---

## Cookie jars & artifact paths

- `admin-jar.txt` — admin session
- `operator-jar.txt` — operator session (pre-block; saved before 2.7)
- `operator-jar-postunblock.txt` — operator session after 2.7.d unblock
- `anon-jar.txt` — never populated, used for 2.1 baseline

All jars under `/tmp/block02/`; not committed to evidence.

---

## Tester run log

- 13:46 GMT+2 — start-of-block probes saved (`_startprobe/start-probe.txt`); staging+prod both at expected commits, all 4 liveness endpoints 200.
- 13:46 GMT+2 — admin login OK (`qorxoes@gmail.com`, id `f10ed250-…`, role=admin). Operator login OK (`unit-cusp-slam@duck.com`, id `da5fc991-…`, role=operator). STORE-001 UUID resolved: `e4d711db-dddd-4749-9a4c-0c2aed2f4f77`.
- 13:47 GMT+2 — **2.1 PASS**. All 8 anon GETs uniform 401 (byte-identical body, Russian "Требуется авторизация"). Both POSTs uniform 403 CSRF_TOKEN_INVALID (CSRF middleware before SessionGuard — brief-prediction deviation, not a leak). See `evidence/BLOCK-02/2.1-anon/SUMMARY.md`.
- 13:48 GMT+2 — **2.2 PASS**. 9 operator GETs → 200 (store/details/catalog/placements/products/prices/banners/scales/store-logs). 2 idempotent banner PATCHes → 200. PATCH price + placement skipped (empty fixtures on staging — operator's write-auth still proven via banner PATCH). `evidence/BLOCK-02/2.2-operator-allowed/SUMMARY.md`.
- 13:50 GMT+2 — **2.3 PASS**. All 9 admin-only endpoints → 403 uniform body `Недостаточно прав`. GET /api/stores → 200 filtered (operator sees STORE-001 only, per `listVisibleStores`). Brief's `DELETE /api/stores/{id}` probe skipped — route doesn't exist (stores are archived, not deleted). `evidence/BLOCK-02/2.3-operator-denied/SUMMARY.md`.
- 13:51 GMT+2 — Fixture: STORE-WAVE2 created (admin, id `f728a42b-49f0-4668-a78b-68cfb711b711`, code STORE-WAVE2, status active, operator not assigned). 201 Created. `evidence/BLOCK-02/_fixture/fixture-create.txt`.
- 13:52 GMT+2 — **2.4 PASS** on the critical info-leak gate. 8 in-band probes against WAVE2 (exists, no access) + 4 against synthetic non-existent UUID → all **byte-identical 403 `Нет доступа к магазину`**. StoreAccessGuard hides the existence boundary from operators. DELETE probe → Express default 404 (route doesn't exist for any role — not an RBAC leak). `evidence/BLOCK-02/2.4-cross-store/SUMMARY.md`.

### Manager rollup — checkpoint after 2.4

Through 2.1–2.4: all four sub-blocks **PASS**. No 🔴 escalation triggers tripped. Test accounts intact (admin + operator both still logged in, no lockout). Fixture STORE-WAVE2 created cleanly. No bugs filed so far. RBAC perimeter holds: anon → uniform 401, operator-allowed → 200, operator-denied → uniform 403, cross-store → uniform 403 with no exists/no-access distinction. Proceeding to 2.5 admin global.

- 13:53 GMT+2 — **2.5 PASS**. 11 admin GETs → 200; admin GET /api/stores returns BOTH STORE-001 + STORE-WAVE2. Admin GET on BOGUS UUID → 404 "Магазин не найден" (distinguishable — intended; operator never reaches this layer). `evidence/BLOCK-02/2.5-admin-global/SUMMARY.md`.
- 13:53 GMT+2 — **2.6 PASS**. (a) logout → 200 `{revoked:true}`; same jar then 401 on `/api/auth/session` and protected GET. (b) Tampered cookie (last 4 chars mutated) → 401, same body. (c) No-cookie → 401, same body. All 401 bodies in this section byte-identical to the 2.1 baseline. `evidence/BLOCK-02/2.6-session-lifecycle/SUMMARY.md`.
- 13:54 GMT+2 — **2.7 PASS**. Pre-block jar working → 200. Admin PATCH /block → 200, status→blocked. Operator fresh login attempt → 401 "Неверный email или пароль" (uniform with regular auth-fail). Old pre-block jar → 401 (sessions revoked on block, immediate, no race). Admin PATCH /unblock → 200. Operator fresh login → 200, status=active. STORE-001 access restored → 200. **Operator unblocked, state clean.** `evidence/BLOCK-02/2.7-blocked-user/SUMMARY.md`.
- 13:56 GMT+2 — **2.8 PASS**. Programmatic body comparison: 14 × 401 byte-identical; 9 × 403 "Недостаточно прав" byte-identical; 12 × 403 "Нет доступа к магазину" byte-identical. 3 × 404 distinct (cross-role + cross-layer, operator never reaches them). Brief's "403-vs-404 reveals existence" failure-mode NOT observed. `evidence/BLOCK-02/2.8-error-consistency/SUMMARY.md`.
- 13:56 GMT+2 — Fixture cleanup: PATCH /api/stores/{W2} `{"status":"archived"}` → 200 `status=archived`. Admin GET /api/stores → STORE-WAVE2 filtered out (only STORE-001 visible). Direct admin GET /api/stores/{W2} → 200 with `status=archived` (record retained for audit, properly archived not deleted). `evidence/BLOCK-02/_fixture/fixture-archive.txt` + `_fixture/post-archive-*.txt`.
- 13:57 GMT+2 — End-of-block re-probe: staging `0cf0966` (unchanged), prod `3538b7c` (unchanged), all 4 liveness endpoints 200. No drift. `evidence/BLOCK-02/_endprobe/end-probe.txt`.
- 13:57 GMT+2 — Housekeeping: admin + operator + fixture-verification sessions all logged out (200, `revoked:true`). Final account-intact verification — both accounts fresh-login → 200; both verification sessions logged out → 200. `evidence/BLOCK-02/_fixture/cleanup-*.txt`.
- 13:57 GMT+2 — Evidence secret spot-check: tightened grep for `scale_admin*session/csrf=<value>` excluding REDACTED placeholders → 0 matches. Password/csrfToken JSON grep → 0 matches. `x-csrf-token` header grep → 0 unredacted. Generic `"token"` field grep → 0 unredacted. **All evidence is clean on disk.**

### Manager rollup — Wave 2 close (final)

8 / 8 sub-blocks PASS. 0 bugs filed. 0 🔴 escalations. RBAC perimeter is GREEN.

Critical 2.4 info-leak gate verdict: SAFE. `StoreAccessGuard` (`store-access.guard.ts:35-37`) returns uniform 403 `Нет доступа к магазину` for both "store exists, operator not assigned" and "store doesn't exist at all" — byte-identical bodies, no observable distinction. Admin sees a distinguishable 404 (intended dual-axis — admin manages, operator cannot enumerate).

Session lifecycle correct: logout invalidates immediately, no race window. Sessions revoked synchronously on user-block transaction (per `users.service.ts:92-113` → `revokeUserSessions`). Login-while-blocked returns generic auth-failure body, not a leaky account-state message.

State left clean: STORE-WAVE2 archived, operator unblocked, both test accounts intact and able to login. Staging + prod liveness unchanged across the entire wave.
