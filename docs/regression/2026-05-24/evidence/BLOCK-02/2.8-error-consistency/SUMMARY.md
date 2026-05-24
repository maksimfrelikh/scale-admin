# 2.8 Error consistency — cross-cutting SUMMARY

Verdict: **PASS**. No information disclosure variant observed across the matrix.

Three error families tabulated. Within each family, body is byte-identical across all probes. Different families have different bodies BY DESIGN — different layers, different information (role vs scope vs existence), and no probe can let a given role distinguish between two states it isn't supposed to see.

## Family A — 401 auth-required (Session/route guard)

14 probes from §2.1 (8), §2.6 (4), §2.7 (2). **All 14 → byte-identical body:**
```
{"message":"Требуется авторизация","error":"Unauthorized","statusCode":401}
```
Content-Length: 95.

Sources: anon GET on every protected endpoint, post-logout GET on same jar, tampered-cookie GET, no-cookie GET, old-jar GET after user-block. All return the same generic 401.

The login endpoint's auth-failure 401 lives in a different family (`Неверный email или пароль`, Content-Length: 80) — that's `/api/auth/login`'s response and is appropriately uniform within ITS endpoint (wrong-pw, nonexistent user, blocked user all collapse to the same body — Wave 1 §1.2 + Wave 2 §2.7.b). Cross-endpoint 401 differentiation is expected behavior, not an info leak.

## Family B — 403 admin-only (RolesGuard family)

9 probes from §2.3. **All 9 → byte-identical body:**
```
{"message":"Недостаточно прав","error":"Forbidden","statusCode":403}
```

Sources: operator hitting `/api/users`, `/api/auth/invites`, `POST /api/stores`, `PATCH /api/stores/:id`, `PATCH /api/users/:id/role`, `PATCH /api/users/:id/block`, `DELETE /api/users/:id`, `POST /api/stores/:id/scales`, `GET /api/logs/global`. RolesGuard fires before any handler; operator gets identical body regardless of resource state.

## Family C — 403 cross-store (StoreAccessGuard family)

12 probes from §2.4. **All 12 → byte-identical body:**
```
{"message":"Нет доступа к магазину","error":"Forbidden","statusCode":403}
```

This is the critical info-leak gate. **8 probes against STORE-WAVE2 (exists, no access) + 4 probes against a bogus UUID (doesn't exist) → same body, same status, same content-length.** Operator cannot distinguish exists-vs-no-access via the response.

## Cross-family analysis (why Family B and Family C have different messages)

The two 403 messages are intentionally different because they come from different guards at different abstraction layers:
- **Family B "Недостаточно прав"** = your *role* lacks this endpoint. A property of the **user**, not the **resource**.
- **Family C "Нет доступа к магазину"** = your *role is correct, but this scope is not yours*. A property of the **resource-to-user link**, not the resource alone.

An operator who probes both endpoint classes learns "this is an admin-only endpoint" vs "this is a store-scoped endpoint where I'm not assigned" — but neither tells them whether a target store **exists**. The existence boundary is fully hidden by Family C's uniformity (probes 2.4-01..08 vs 2.4-10..13). The role-vs-scope boundary is the operator's own knowledge of their role, not a resource secret.

**Guard ordering** (verified in code review: `SessionGuard` → `RolesGuard` → `StoreAccessGuard`) means that for an endpoint that is BOTH admin-only AND store-scoped (e.g. `POST /api/stores/:storeId/scales`), operator gets Family B's message first ("Недостаточно прав") — confirmed in §2.3 probe 09. They never see the Family C message for admin-only endpoints, which means they cannot use response-message-class to enumerate stores via admin-only routes either.

## Family D — 404 (route-not-found vs resource-not-found)

3 probes returned 404 in the matrix:
- §2.4 probe 09 (operator DELETE on WAVE2): `{"message":"Cannot DELETE /api/stores/{W2}","error":"Not Found","statusCode":404}` — **Express default 404**, fires when the route is undefined (no `@Delete` handler exists on `stores.controller.ts`). Any caller, any role, any URL hitting an undefined verb→route combination gets this response. Not RBAC-layer.
- §2.5 probe 12 (admin GET bogus store): `{"message":"Магазин не найден","error":"Not Found","statusCode":404}` — Nest `NotFoundException` from `stores.service.getStore`, only reachable AFTER `StoreAccessGuard` admits the caller. Admin reaches it; operator does not.
- §2.5 probe 13 (admin GET bogus catalog): `{"message":"Активный каталог магазина не найден","error":"Not Found","statusCode":404}` — Nest `NotFoundException` from `catalog.service`, same layer as above.

These three bodies are distinct, but **the operator never sees Family D for any in-scope probe** because StoreAccessGuard pre-empts with Family C before the handler that would throw 404 runs. Admin sees Family D specifically because admin has access — and admin is *supposed* to know "does this store exist?" to manage the system. This is the intended dual-axis design.

**Brief's specific concern** (verbatim from §2.8): *"e.g., 403 says 'no access to STORE-WAVE2' while 404 says 'store not found' = file bug + escalate"* — this concern was about an OPERATOR seeing both a 403 (for exists) and a 404 (for doesn't-exist), revealing existence. Empirical result: operator gets 403 in BOTH cases (probes 2.4-01..08 vs 2.4-10..13). The brief's failure-mode is **not present**.

## Verdict

- Within each family, bodies are byte-identical. ✓
- Across families, the differences encode role vs scope vs existence at the correct architectural layers without exposing any state across role boundaries.
- The critical operator-side existence boundary is fully hidden behind Family C's uniformity.

No bugs filed. No information disclosure observed.

## Evidence

- `401-comparison.txt` — full tabulation of all 14 401 bodies.
- `403-comparison.txt` — full tabulation of 21 403 bodies split into Family B (9) + Family C (12).
- `404-comparison.txt` — full tabulation of 3 404 bodies with provenance.
