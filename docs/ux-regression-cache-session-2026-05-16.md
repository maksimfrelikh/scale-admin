# UX/runtime regression — cache consistency, long-session and multi-tab behavior — 2026-05-16

## Scope
Focused production frontend UX/runtime regression for long-session, cache consistency, and multi-tab behavior only.

Production target: `https://maksimfrelikh.ru`

## Constraints / hygiene
- Working directory verified with `pwd`: `/home/clawd/projects/scale-admin`.
- All report/evidence/bug files were written under `/home/clawd/projects/scale-admin/docs/`.
- QA credentials, passwords, tokens, CSRF values, and cookies are not included in this report or evidence.
- No application source code, env files, database schema, nginx config, or Docker config was modified.

## Test method
- Browser automation: Chromium via isolated temporary Playwright runner outside the repository.
- Accounts used: QA admin and QA operator, referenced only by role.
- Main entity used for mutation/cross-tab checks: QA store `QA-CACHE-327800`.
- Mutations were performed from an authenticated browser tab using same-origin authenticated API calls so other already-open SPA tabs could be evaluated for cache/session consistency.
- Evidence file: `docs/evidence/cache-session-regression-2026-05-16.json`.

## Coverage performed
| Check | Result | Notes |
| --- | --- | --- |
| Production frontend/health reachable | PASS | Frontend and `/api/health` returned HTTP 200 before browser run. |
| Multiple tabs with same admin session | PASS | Admin dashboard, Stores and Products routes opened in separate tabs. |
| Baseline refresh consistency after store creation | PASS | Second tab saw created QA store after hard refresh. |
| Store list after mutation in another tab, no refresh | FAIL | Old store name remained visible. See BUG-UX-011. |
| Store list after route switch away/back | FAIL | Stale RTK data persisted after returning to `/#stores`. See BUG-UX-011. |
| Browser back/forward after mutation | FAIL | Stale store list persisted through history navigation. See BUG-UX-011. |
| Hard refresh recovery for store list | PASS | Hard refresh recovered current store name. |
| Store detail after mutation in another tab | FAIL | Detail page kept old store name, including after reopening route. See BUG-UX-012. |
| Hard refresh recovery for store detail | PASS | Hard refresh recovered current store detail. |
| Long-lived open Stores tab after background edit | FAIL | After ~65 seconds idle, tab still showed stale pre-edit data. See BUG-UX-011. |
| Logout/session invalidation from another tab | PASS | Background logout/session invalidation returned HTTP 200. |
| Other tab immediately after logout/session invalidation | FAIL | Protected dashboard/Stores UI remained visible. See BUG-UX-013. |
| Protected interaction after auth loss | FAIL | Protected Refresh produced HTTP 401, but SPA stayed on protected route. See BUG-UX-013. |
| Hard refresh after auth loss | PASS | Hard refresh recovered to login screen. |
| Operator spot-check after logout/session invalidation | FAIL | Operator tab also retained protected UI after background logout/session invalidation. See BUG-UX-013. |

## Confirmed bugs
1. `docs/bugs/BUG-UX-011.md` — Store list remains stale in another open tab after store edit and route/history navigation. Severity: Medium.
2. `docs/bugs/BUG-UX-012.md` — Store detail page remains stale in another open tab after store edit. Severity: Medium.
3. `docs/bugs/BUG-UX-013.md` — Other open tabs keep protected dashboard UI after logout/session invalidation and do not redirect on 401. Severity: High.

## Network/runtime observations
- Cache consistency failures were not accompanied by automatic `/api/stores` or `/api/stores/:id` revalidation in the stale tabs before hard refresh.
- After logout/session invalidation, a stale protected tab received HTTP 401 from a protected request but remained on the protected route.
- Console errors were limited to expected failed protected resources during unauthenticated/session-invalidated states; no infinite loading loop was observed.

## PASS/FAIL assessment
FAIL for the requested long-session/cache/multi-tab scope.

Reason: the SPA allows stale entity data to persist across tabs after mutations, and protected UI remains visible/interactable in other tabs after logout/session invalidation until hard refresh.

## Notes / not expanded
- Publishing/validation cache consistency was not expanded beyond the store route context because the focused cache/session issues were already reproducible without publishing mutations.
- No infinite retry loop was observed during this run.
- QA test store data was created and edited as part of safe production UAT evidence collection.
