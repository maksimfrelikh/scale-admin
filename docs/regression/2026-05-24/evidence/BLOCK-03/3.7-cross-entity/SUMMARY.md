# 3.7 Cross-entity consistency — SUMMARY

**Verdict:** ✅ PASS
**Probes:** 19 (1 setup grant, 1 baseline view, 1 archive+cascade, 1 operator vision, 2 admin archived-store probes, 1 negative write, 1 product activePlacementCount, 1 product no-DELETE, 4 operator direct/catalog/scale-api on archived store, 6 verification + audit cross-check)

## Probes & key findings

### Store archive cascade

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 01 | Setup: grant STORE-WAVE3-01 to operator | 201 granted | 201, granted=true | ✅ |
| 02 | Re-login operator | 200 | 200 | ✅ |
| 03 | Operator pre-archive GET /api/stores | sees both | count=2 (STORE-001 + STORE-WAVE3-01) | ✅ |
| 04 | Admin PATCH STORE-WAVE3-01 → archived | 200 + cascade payload populated | 200, cascade.correlationId=78bc042f-…; categories=1, placements=1, scaleDevices=1, storeCatalogs=0, prices=0, banners=0 | ✅ |
| 05 | Re-login operator (session may be revoked by access change) | 200 | 200 | ✅ |
| 06 | Operator GET /api/stores (post-archive) | only STORE-001 | count=1 (STORE-001) — **archive filter respected** | ✅ |

### Cascade impact verification

| # | Probe | Result | Status |
|---|-------|--------|--------|
| 07 | GET /api/stores?status=archived (admin) | filter silently ignored; list still returns active-only (same low-pri pattern as W3.5.f dateFrom) | ⚠ |
| 08 | GET /api/stores/:id/scales on archived store (admin) | 404 "Магазин не найден" — `scales.service.listStoreDevices` treats archived as not-found | ⚠ documented |
| 09 | GET /api/stores/:id/catalog/categories on archived store (admin) | 200, **category.status=archived** (cascade-archived) | ✅ |
| 10 | GET /api/stores/:id/catalog/placements on archived store (admin) | 200, **placement.status=archived** (cascade-archived) | ✅ |
| 11 | POST active placement to archived-store catalog | **400 "Архивную или неактивную категорию нельзя использовать в активном размещении"** | ✅ |
| 12 | GET /api/products/:p1 after cascade | activePlacementCount=**0** (was 1 before archive); unavailableForNewActivePlacements=false (P1 still active globally, can be re-placed in OTHER stores) | ✅ |
| 13 | DELETE /api/products/:p1 | 404 Express default "Cannot DELETE /api/products/..." — **no @Delete decorator exists in `products.controller.ts`** | ✅ (consistent with W2 §2.3 finding: hard-delete not exposed; archival only) |

### Scale device fate post-archive

| # | Probe | Result | Status |
|---|-------|--------|--------|
| (cascade) | Scale device cascade-archived | audit shows `scale_device.archived` at 12:26:31.517 (matches archive PATCH timestamp) | ✅ |
| 17 | Admin PATCH scale device → inactive | 200; admin can still manage scale devices on archived stores via direct device id (just not via store-scoped list) | ✅ |
| 18 | scale-api auth-check with cascade-archived device | 403 SCALE_DEVICE_NOT_ACTIVE — device-side sync correctly blocked | ✅ |
| 19 | Audit cross-check filter entityType=ScaleDevice | shows full sequence: created → status_changed×2 (3.4 block/unblock) → api_token_regenerated → status_changed (3.4 → block→active) → **archived (cascade 12:26:31.517)** → status_changed (probe 17 inactive) | ✅ |

### Operator direct access to archived store

| # | Probe | Result | Verdict |
|---|-------|--------|---------|
| 14 | Operator GET /api/stores/:archived-id direct | 200 + full store data — store-access guard checks **access record** (still active), NOT store archive status | ⚠ documented — see "Architectural observation" |
| 15 | Operator GET /api/stores/:archived-id/catalog/categories | 200 + categories list with status=archived (operator can READ cascade-archived dependents too) | ⚠ documented |
| 16 | Admin GET /users/:op-id/store-accesses | 3 rows: 1 STORE-WAVE3-01 revokedAt=2026-05-24T12:16:04 (from 3.3.m); 1 STORE-WAVE3-01 revokedAt=null (from 3.7.a re-grant); 1 STORE-001 revokedAt=null | ✅ |

## Architectural observation (NOT a bug, documented)

**Finding:** Archiving a store does **not** cascade-revoke active UserStoreAccess records pointing at that store. The operator's session can still hit `GET /api/stores/:archived-id` directly via UUID and receive 200, because `StoreAccessGuard` (`backend/src/auth/store-access.guard.ts`) checks the *access record* rather than the *store's archive status*. The list view (`GET /api/stores`) correctly filters out archived stores so they don't appear in the normal navigation.

**Operator capability matrix on a cascade-archived store:**
- ✅ List view: hidden (archive filter)
- ✅ Read store metadata: allowed (200) — direct UUID
- ✅ Read catalog categories/placements: allowed (200) — all show status=archived
- ❌ Write categories/placements: blocked (400 "archived/inactive category cannot be used in active placement")
- ❌ Operator scale-api sync: blocked (403 SCALE_DEVICE_NOT_ACTIVE — cascade-archived device)

**Brief satisfaction:** Brief says "Archive store → operators в /api/stores больше не видят (status filter respected)" — ✅ satisfied (list filter). Brief does **not** mandate direct-UUID 403. So this is documented behavior, not a regression.

If Maksim wants direct-UUID access to archived stores to also be blocked for non-admins, that's a future scope-tightening (potential BUG-REG-069), but **not filed here** — out of W3 brief scope.

## Soft-delete user (code-review only — no live probe)

Live probe of `DELETE /api/users/:userId` skipped because:
- Creating a fresh throwaway user requires invite-accept, which requires the plain token. Staging is `nodeEnv=production` per BUG-REG-066 closure → plain token NOT in API response.
- Soft-deleting the existing operator `unit-cusp-slam@duck.com` would break downstream sub-blocks and isn't recoverable via current API surface (`users.service.softDeleteUser` only writes `deletedAt`; there is no `restoreUser` endpoint).
- Same skip pattern as W1 §1.6 "live DB peek SKIP — staging Postgres internal-only".

**Code review of `users.service.ts:340-373`:**
1. Sets `user.deletedAt = now`.
2. Writes audit log `user.soft_deleted` with `beforeData/afterData = {deletedAt}`.
3. Calls `authService.revokeUserSessions(user.id, 'user_deleted')` — **revokes sessions**.
4. Does **NOT** explicitly write `revokedAt` on `UserStoreAccess` rows.

**Implication:** UserStoreAccess records remain technically active but unreachable because:
- The user's sessions are revoked (line 370) → they can't authenticate anyway.
- The user `deletedAt` is set → list endpoints filter them out (`{deletedAt: null}` predicate at line 37/402).
- Any future "undelete" would unintentionally restore the historic accesses (no API exists for this, so not exploitable today).

**Verdict on brief question "Soft-delete user → активные UserStoreAccess auto-revoke?":** No automatic `revokedAt` write on UserStoreAccess rows; access becomes unreachable via session-revoke + deletedAt-filter instead. **Acceptable design.**

## Bugs filed

None for 3.7.

## Cleanup state at end of 3.7

- STORE-WAVE3-01: status=archived (final)
- Category in STORE-WAVE3-01: status=archived (cascade)
- Placement (P1↔CAT): status=archived (cascade)
- SCALE-WAVE3-01: status=inactive (cascade archived first, then probe 17 PATCH'd to inactive — equivalent for cleanup purposes; will be left as-is)
- UserStoreAccess id=4627fd1c (operator → STORE-WAVE3-01): still active row, but operator session re-login required to use; not revoked. Will be revoked in 3.8 cleanup.
