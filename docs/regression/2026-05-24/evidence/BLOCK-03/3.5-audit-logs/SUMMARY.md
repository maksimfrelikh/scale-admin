# 3.5 AuditLog read — SUMMARY

**Verdict:** ✅ PASS
**Probes:** 11 (1 admin happy, 1 operator-on-global-403, 5 filters, 1 pagination, 1 operator-store-200, 1 operator-no-access-403, 1 actor-shape inspection)

## Naming note (brief vs actual routes)

Brief referred to `/api/audit-logs`; actual endpoints are:

- **GET `/api/logs/global`** — admin only (`@RequireRoles('admin')`)
- **GET `/api/stores/:storeId/logs`** — admin + operator (with `@RequireStoreAccess('storeId','params')`)

Response shape:
```json
{
  "auditLogs": { "data": [...], "meta": {"total","limit","offset"} },
  "scaleSyncLogs": { "data": [...], "meta": {...} },
  "filters": { "storeId","entityType","action","status","dateFrom","dateTo","limit","offset" }
}
```

## Probes & results

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 01 | GET /api/logs/global (admin) | 200 + paginated | 200, total=233, limit=50, returned 50 | ✅ |
| 02 | GET /api/logs/global (operator) | 403 global block | 403 "Недостаточно прав" | ✅ |
| 03 | filter action=user.role_changed | 200, only role-change entries | 200, total=2 (matches W3 role flips at 12:15:10) | ✅ |
| 04 | filter entityType=ScaleDevice | 200, only ScaleDevice entries | 200, total=8 (W3 + 2 prior W2 archives) | ✅ |
| 05 | filter storeId=STORE-WAVE3-01 | 200, only that store's entries | 200, total=13 (4 scale + 2 store-access + 1 placement + 1 category + 5 store-updates incl. create) | ✅ |
| 06 | filter dateFrom (URL-encoded `+00:00` issue) | filtered | initial attempt total=233 (filter silently ignored due to space-vs-`+`) — see deviation | ⚠ |
| 06b | filter dateFrom with Zulu `Z` form | filtered | 200, total=41 (filter applied; oldest returned 11:53:14 ≥ dateFrom 11:51:50) | ✅ |
| 07 | pagination limit=5 offset=10 | 5 rows from offset 10 | 200, meta `{total:233, limit:5, offset:10}`, 5 rows returned (verified ordering) | ✅ |
| 08 | operator GET /api/stores/STORE-001/logs (has access) | 200, store-scoped subset | 200, total=24 (STORE-001's history incl. operator's own access grant + banner ops) | ✅ |
| 09 | operator GET /api/stores/STORE-WAVE3-01/logs (no access) | **403 byte-identical to W2 §2.4** | 403 "Нет доступа к магазину" — byte-identical to W2 in-band probes | ✅ |
| 10 | inspect actor field structure | actor object with `{id,email,fullName}` | confirmed; admin probe row shows `actor:{id:f10ed250…,email:qorxoes@gmail.com,fullName:qorxoes}` | ✅ |

## W3 actions verified in audit log (against /api/logs/global global feed)

| Action | Expected count | Actual in log | Source sub-block |
|--------|----------------|---------------|------------------|
| store.created | 2 | 2 (STORE-WAVE3-01, STORE-WAVE3-02) | 3.1 |
| store.updated | 5+ | 5 (name+tz+2 status transitions+revert) | 3.1 |
| store.archived | 1 | 1 (STORE-WAVE3-02 → archived) | 3.1 |
| product.created | 2 | 2 (P1, P2) | 3.2 |
| product.updated | 1 | 1 (P1 rename with active placement → warning) | 3.2 |
| product.archived | 1 | 1 (P2 → archived) | 3.2 |
| category.created | 1 | 1 (CAT in STORE-WAVE3-01) | 3.2 |
| placement.created | 1 | 1 (P1↔CAT) | 3.2 |
| user_invite.created | 2 | 2 (future + past expiresAt) | 3.3 |
| user.invite.cancelled | 1 | 1 (cancel past-expiry invite) | 3.3 |
| user.role_changed | 2 | 2 (operator→admin→operator) | 3.3 |
| user.blocked | 1 | 1 (operator blocked) | 3.3 |
| user.unblocked | 1 | 1 (operator unblocked) | 3.3 |
| user_store_access.granted | 1 | 1 (STORE-WAVE3-01 to operator) | 3.3 |
| user_store_access.revoked | 1 | 1 (STORE-WAVE3-01 revoked) | 3.3 |
| auth.login_failed | 1 | 1 (login attempt while blocked) | 3.3 |
| auth.login_succeeded | 5+ | 5 (admin + operator initial + 4 re-logins) | 3.3+3.4 |
| scale_device.created | 1 | 1 (SCALE-WAVE3-01) | 3.4 |
| scale_device.api_token_regenerated | 1 | 1 | 3.4 |
| scale_device.status_changed | 2 | 2 (active→blocked + blocked→active) | 3.4 |

**Total W3-originated entries:** 32+ confirmed in audit log. All actor.id resolves to `qorxoes@gmail.com` (admin) for admin-driven actions.

## CRITICAL secret-grep gate — ✅ CLEAN

Patterns scanned across ALL `evidence/BLOCK-03/3.5-audit-logs/` files:

| Pattern | Matches |
|---------|---------|
| password | 0 |
| apiToken | 0 |
| sessionToken | 0 |
| tokenHash | 0 |
| resetToken | 0 |
| inviteToken | 0 |
| apiTokenHash | 0 |

**Why this is naturally clean:** the public list endpoint (`logs.service.ts:133-144`) explicitly **does not select** `beforeData` / `afterData` / `metadata` Prisma columns. Only `{id, action, entityType, entityId, storeId, createdAt, actor:{id,email,fullName}, store:{id,code,name}}` is returned.

Defense in depth verified at write time too: `audit-log.service.ts:18-19` defines `SECRET_KEY_PATTERN = /(^|_)(password|sessiontoken|...|apitoken|...|tokenhash|...)/i` and `redactJsonField()` (line 70-78) walks the JSON and replaces any matching key's value with `[REDACTED]` BEFORE the row is inserted. So even if a future change ever surfaces beforeData/afterData via the API, the DB row would already be redacted.

## Deviation: dateFrom URL-encoding silent failure (probe 06)

When `dateFrom` is sent as `2026-05-24T11:51:01.764759+00:00` over a query string without URL-encoding the `+`, it arrives at the server as `2026-05-24T11:51:01.764759 00:00` (space). The server then tries `new Date(...)` on a malformed string — get `Invalid Date`, the filter is **silently dropped** without 400, and the unfiltered result set is returned.

- Severity: low (no security impact; just observability degraded for users who hand-craft the URL)
- Workaround: use Zulu format `...Z` (probe 06b, works fine)
- Fix recommendation: reject malformed `dateFrom`/`dateTo` with 400 instead of silently dropping the filter.

**Not filed as a bug for W3** — flagged here for Maksim's awareness. Low priority; doesn't gate Wave 3 closure.

## Bugs filed

None.
