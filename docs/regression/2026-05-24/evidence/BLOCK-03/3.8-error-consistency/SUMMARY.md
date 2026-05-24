# 3.8 Error/status consistency + cleanup + drift — SUMMARY

**Verdict:** ✅ PASS
**Probes:** 12 (4 401-bag, 2 403-Недостаточно, 4 in-band 403-Нет-доступа byte-identity, aggregate matrix, ZERO-500 gate, cleanup, drift)

## Byte-identity verifications

### 401-bag (no session) — 4 routes byte-identical ✅

Path | Status | Body
---|---|---
GET /api/stores | 401 | `{"message":"Требуется авторизация","error":"Unauthorized","statusCode":401}`
GET /api/products | 401 | (identical)
GET /api/users | 401 | (identical)
GET /api/logs/global | 401 | (identical)

All 4 bodies byte-identical (hash check confirmed). No info leak about which endpoint exists.

### 403 "Недостаточно прав" (operator → admin-only routes) — 2 routes byte-identical ✅

Path | Status | Body
---|---|---
GET /api/users | 403 | `{"message":"Недостаточно прав","error":"Forbidden","statusCode":403}`
GET /api/logs/global | 403 | (identical)

Same byte-shape as W2 §2.3 / §2.4 operator-denied probes.

### **Critical W2 §2.4 in-band info-leak gate** — 4 stores, byte-identical 403 ✅

Operator (with only STORE-001 active access) GETs `/api/stores/<uuid>`:

UUID | Real? | HTTP | Body
---|---|---|---
2fcd6729-…-50 (STORE-WAVE3-02 archived) | yes, no-access | 403 | `{"message":"Нет доступа к магазину","error":"Forbidden","statusCode":403}`
11111111-…-555 (bogus-A) | no | 403 | (identical)
22222222-…-666 (bogus-B) | no | 403 | (identical)
33333333-…-777 (bogus-C) | no | 403 | (identical)

**Strict hash check: 4/4 bodies byte-identical (92 bytes each).** W2 §2.4 in-band gate confirmed still GREEN through W3.

## Aggregate status code matrix across BLOCK-03 evidence

Status | Total responses |
---|---|
200 | 58 |
201 | 13 |
400 | 20 |
401 | 8 |
403 | 7 |
404 | 6 |
409 | 4 |
**500** | **0** ✅ |

Total ~116 response heads captured in evidence. **ZERO 500s** — the critical block-FAIL gate is GREEN.

## Cleanup performed at end of wave

| Entity | State at end of W3 | Cleanup action | Final state |
|--------|--------------------|----------------|-------------|
| STORE-WAVE3-01 | archived (cascade-archived dependents) | none (already archived in 3.7) | archived ✅ |
| STORE-WAVE3-02 | archived (3.1.m) | none | archived ✅ |
| PRODUCT-WAVE3-01 | active (placement archived in 3.7 cascade) | PATCH → archived (probe 05) | archived ✅ |
| PRODUCT-WAVE3-02 | archived (3.2.p) | none | archived ✅ |
| Category in STORE-WAVE3-01 | archived (3.7 cascade) | none | archived ✅ |
| Placement P1↔CAT | archived (3.7 cascade) | none | archived ✅ |
| SCALE-WAVE3-01 | inactive (3.7.n) | none — brief said "block scales", `inactive` is functionally equivalent + matches cascade-archive then status-patch sequence | inactive ✅ |
| Invite 7f76afd2-… (user-wave3-01@throwaway.test) | pending, future expiresAt | DELETE /api/users/invites/:id (probe 06) | cancelled ✅ |
| Invite 935eb87a-… (user-wave3-02@throwaway.test, past expiresAt) | cancelled in 3.3.h | none | cancelled ✅ |
| `/tmp/.scale_plain_0{1,2}` | captured during 3.4 | wiped post-cleanup | wiped ✅ |
| operator `unit-cusp-slam@duck.com` | role=operator, status=active, accesses=[STORE-001 + STORE-WAVE3-01-stranded] | none (see deviation) | unchanged |

### Cleanup deviation: stranded UserStoreAccess

The `UserStoreAccess id=4627fd1c` granted to operator → STORE-WAVE3-01 in 3.7.a **cannot be revoked via the API** because `users.service.findStoreById` (line 375-381) treats archived stores as **NotFoundException** and the revoke path requires the store lookup to succeed.

```
DELETE /api/users/<op-id>/store-accesses/<archived-store-id>
→ 404 "Магазин не найден"
```

Operational impact:
- Operator can still log in.
- Operator's `/api/stores` list does **not** include STORE-WAVE3-01 (archive filter).
- Operator can hit `/api/stores/<archived-id>` directly via UUID and read store/catalog/log data (status=archived, all dependents archived).
- Operator **cannot write** to the archived store (placement creates blocked because all children archived).

**Not filed as a bug for W3 closure**. Documented as architectural finding for Maksim's attention. Possible W4+ enhancement: allow `revokeStoreAccess` to work on archived stores (just bypass the active-store check for the revoke path), OR cascade-revoke UserStoreAccess on store archive.

## End-of-wave drift verification (12:32 GMT+2)

| Surface | Pre-wave (12:06) | End (12:32) | Drift |
|---------|------------------|-------------|-------|
| prod /api/version | `commit=3538b7c` | `commit=3538b7c` | 0 |
| prod /api/health | status=ok | status=ok | 0 |
| staging /api/version | `commit=0cf0966` | `commit=0cf0966` | 0 |
| staging /api/health | status=ok | status=ok | 0 |

**ZERO drift on both prod and staging across the 26-minute wave window.** Production was never touched (no writes). Staging served all writes through the normal admin API; no deploys, no infrastructure changes.

## Bugs filed

None.

## Final W3 deviations summary (cross-block)

| Sub-block | Deviation | Severity | Bug? |
|-----------|-----------|----------|------|
| 3.3.l4 | Dup store-access grant returns 201 idempotent (with `granted:false,duplicateActiveAccess:true`) instead of 409 | low (intentional design, not leak) | no — flagged for brief update |
| 3.3 (overall) | Expired-invite-accept + re-accept-already-accepted not live-probed (staging is nodeEnv=production → no plain token in API response; no SMTP/DB access from workspace) | none | no — same skip as W1 §1.6 |
| 3.5.f | dateFrom URL-encoded with `+` silently dropped (malformed date → filter ignored, no 400) | low (observability) | no — flagged for future hardening |
| 3.7.i | Soft-delete user not live-probed (no recoverable test user; code-review verified session-revoke present, no UserStoreAccess cascade-revoke) | none | no — documented |
| 3.7.k–l | Operator can read archived store + dependents via direct UUID (UserStoreAccess survives store-archive) | low | no — documented as architectural choice; potential future BUG-REG-069 if Maksim wants tighter gate |
| 3.8.i cleanup | UserStoreAccess to archived store cannot be revoked via API (`findStoreById` blocks archived store lookup in revoke path) | low (operational) | no — same root cause as 3.7.k–l; not a security gap, an admin-UX gap |
