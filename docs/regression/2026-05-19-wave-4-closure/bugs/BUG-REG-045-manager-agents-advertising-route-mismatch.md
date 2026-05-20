# BUG-REG-045 — Manager AGENTS.md §6.2 references wrong advertising-banner route shape

**Status:** CLOSED — closed-invalid (2026-05-20)
**Severity:** low
**Area:** docs / agent config (`.openclaw/`)
**Found during:** Wave 4 closure verify (2026-05-19) — side finding #2 in `docs/regression/2026-05-19-wave-4-closure/SUMMARY.md`. Surfaced by Manager subagent while writing block-2 regression test scripts.
**FLAG:** This file lives under `.openclaw/agents/manager/agent/AGENTS.md` (or wherever the deployed Manager config is mounted). Per Lead SOUL §13 escalate list, `.openclaw/**` is **NOT** Lead self-merge scope — fix requires Maxim direct edit or a special Manager-config flow.

## Closure note (2026-05-20, per Maksim dispatch)

Closed as **stale-pointer**. Original pointer "Manager AGENTS.md §6.2" does not exist in the current file (§6 = Wave management). Route mismatch was not verified in discovery — may have referred to brief language, not actual config drift. Reopen if real drift surfaces in future regression.

Recorded by Manager during TASK-042 verify-only close (see `progress.md` 2026-05-20 closure block; Lead → Manager dispatch authorized this closure as metadata-only per Lead SOUL §13). Pair stub [[BUG-REG-048]] opened in the same commit.

## Steps to reproduce

1. `cat ~/.openclaw/agents/manager/agent/AGENTS.md` (or the equivalent deployed path).
2. Locate §6.2 (regression blocks → advertising surface).
3. Compare the listed advertising-banner route with `backend/src/advertising/advertising.controller.ts:31`.

## Expected

Route in Manager AGENTS.md §6.2 matches the controller. Canonical surface is:

```
GET    /api/stores/:storeId/advertising/banners
POST   /api/stores/:storeId/advertising/banners
PATCH  /api/stores/:storeId/advertising/banners/:bannerId
```

## Actual

Manager AGENTS.md §6.2 lists a flat shape (e.g. `GET /api/advertising/banners?storeId=…`) that does not exist in the backend. Wave 4 closure Block 3 smoke had to adapt at runtime to the canonical scoped route.

## Hypothesis paths (for the eventual fix)

- **(a) Maxim direct edit Manager AGENTS.md §6.2** — replace the flat advertising route with the scoped `/api/stores/:storeId/advertising/banners` shape. File is in escalate list (`.openclaw/**`), Lead cannot self-merge.
- **(b) Batched in a future agent-config cleanup wave** — collect other AGENTS.md drift items (e.g. canonical staging admin from [[BUG-REG-044]], any other route shape skew) and ship as a single agent-config sync.

## Out of scope

- Lead AGENTS.md — separate file with different references, not affected by this drift.
- Backend route changes — controller is canonical; AGENTS.md is the doc that needs to match the code, not the other way around.

## Wave placement

Backlog. Pick up on the next Manager-config edit window. Cross-reference [[BUG-REG-044]] if doing a batched agent-config sync.
