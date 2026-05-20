# BUG-REG-048 — Cross-cutting pagination feature — uniform offset/limit/total for all paginated surfaces

**Status:** RESOLVED — Wave 5, PR #25 (297bef5 pagination envelope)
**Severity:** medium
**Area:** backend (paginated list endpoints) + frontend (page-nav component)
**Origin:** Spun out of TASK-042 closure (2026-05-20). Maksim ruled the pagination BINDING was introduced after TASK-042 acceptance — formally beyond original task scope — and authorized verify-only close of TASK-042 with this cross-cutting ticket as the canonical follow-up. See `progress.md` 2026-05-20 closure block for TASK-042.

## Scope (verbatim from Maksim dispatch 2026-05-20)

- **Current state:** TASK-042 logs endpoints — `limit` only (max 100), no `offset` / `total`. FE no page nav.
- **Other paginated surfaces likely similar gaps:** advertising banners, products list, prices list (verify in actioning discovery).
- **Proposed scope:** uniform pagination contract — `{ data, meta: { total, limit, offset } }` — for AuditLog, ScaleSyncLog, Banner, Product, Price endpoints + consistent FE pagination component (Prev/Next + "N–M of T" + page-size).
- **Acceptance:** each paginated surface returns the standardized envelope, FE shows page nav + total count + page-size selector.
- **Out of scope:** search/filter additions, sort customization — separate concerns.

## Discovery checklist (for actioning agent)

Before designing the contract, enumerate the current paginated surfaces and document each one's gap:

1. **Logs (TASK-042):**
   - `GET /api/logs/global` — `LogsService.listGlobalLogs` in `backend/src/logs/logs.service.ts` — `limit` only (DEFAULT 50, MAX 100), no offset/total, returns `{ auditLogs, scaleSyncLogs, filters }`.
   - `GET /api/stores/:storeId/logs` — `LogsService.listStoreLogs` — same shape.
2. **Advertising banners** — check `backend/src/advertising/advertising.controller.ts` + service.
3. **Products** — check `backend/src/products/products.controller.ts` + service.
4. **Prices** — check `backend/src/prices/` (or wherever store_product_prices is exposed).
5. **Audit events for store** — if separated from logs endpoints.
6. **Users list** — `GET /api/users` currently returns full list (no pagination); may or may not need same envelope depending on expected user count.

For each surface: current return shape, current cap, current FE consumer (RTK Query hook + page).

## Proposed envelope (starting point — refine in discovery)

```jsonc
// GET /api/<surface>?limit=20&offset=40&...filters
{
  "data": [ /* items */ ],
  "meta": {
    "total": 137,
    "limit": 20,
    "offset": 40
    // optionally: "filters": { ...echo of applied filters } for parity with logs surface
  }
}
```

Logs surface is a special case (two arrays in one response). Either:
- (a) Split into `GET /api/logs/audit` + `GET /api/logs/sync`, each paginated independently, FE combines client-side or shows two tables; or
- (b) Keep combined endpoint but page each array separately in `meta.audit` / `meta.sync`. Decide in discovery.

## FE pagination component requirements

- Prev / Next buttons (disabled at edges)
- "N–M of T" label
- Page-size selector (10 / 20 / 50 / 100)
- Resets to offset=0 when filters change (per RTK Query cache key)
- Reusable across logs / banners / products / prices

## Acceptance criteria

- [ ] Each in-scope paginated surface returns the standardized envelope (`{ data, meta: { total, limit, offset } }`).
- [ ] FE pagination component used on each paginated page (logs, banners, products, prices).
- [ ] Each page shows total count + page nav + page-size selector.
- [ ] No regression of existing filter behavior on any paginated surface.

## Out of scope

- Search/filter additions, sort customization — separate concerns (per Maksim).
- Server-side cursor pagination — offset-based is sufficient for current data volumes; cursor can be a follow-up if/when offset becomes a perf concern.

## Wave placement

Backlog. Wave 5 candidate (per Maksim).

## Cross-references

- [[TASK-042]] — origin (logs endpoints exposed the gap; verify-only closed against original §4.4 criteria with BINDING waiver pointing here).
