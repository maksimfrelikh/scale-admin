# RBAC Frontend UX / Runtime Regression — 2026-05-16

## Scope
Focused production RBAC/frontend regression for admin vs operator behavior only.

Production target: `https://maksimfrelikh.ru`
Browser: Playwright Chromium headless
Evidence: `docs/evidence/rbac-regression-2026-05-16.json`

Sensitive values are intentionally omitted/redacted.

## Overall result
FAIL for tested RBAC/frontend runtime scope.

Backend RBAC blocked forbidden foreign-store access with `403`, and major admin-only navigation was hidden for operators. However, the frontend still has route/message/runtime-state defects that can create confusing or stale RBAC UI states.

## Coverage completed

### Admin baseline
Status: PASS

Verified as admin:
- admin dashboard loads;
- admin navigation includes `Create store`, `Global Logs`, and `Users & Access`;
- `Users & Access` page is visible;
- `Global Logs` page is visible.

### Operator visible navigation
Status: PASS

Verified as operator:
- operator dashboard loads;
- operator sees `Overview`, `Stores`, and `Products` navigation;
- admin-only nav entries `Create store`, `Global Logs`, and `Users & Access` are not visible;
- operator navigation note says assigned stores only.

### Direct admin-only routes/components
Status: FAIL

Checks:
- `/#users-access` as operator: blocked with access-denied page. PASS.
- `/#global-logs` as operator: blocked, but wrong access-denied copy. FAIL — `BUG-UX-004`.
- `/#store-create` as operator: forbidden hash remains but operator overview renders. FAIL — `BUG-UX-005`.
- `/#store-edit:<assigned-store-id>` as operator: forbidden hash remains but operator overview renders. FAIL — `BUG-UX-005`.

### Operator assigned-store behavior
Status: PASS with caveat

Verified:
- operator account had one assigned store visible through UI/API;
- assigned store details loaded successfully;
- catalog, advertising, prices and store logs sections were visible within the assigned store;
- `Edit store` was not visible to operator;
- publishing controls were not visible to operator.

Caveat:
- operator product master create/edit UI is visible and reachable. This was not filed as a bug because prior project evidence indicates product CRUD is intentionally allowed for operators.

### Operator inability to access foreign stores
Status: FAIL due frontend stale state

Verified:
- a foreign admin-visible store existed outside the operator assignment;
- direct foreign-store route returned backend `403` responses;
- after navigating from an assigned store to the foreign store without refresh, the SPA showed forbidden errors but left stale assigned-store details and controls visible under the foreign-store URL. FAIL — `BUG-UX-006`.

Refresh behavior:
- hard refresh on the forbidden foreign-store route cleared stale store content and left only forbidden errors.

### Route switching, recovery, refresh, back/forward
Status: PARTIAL PASS

Verified:
- clicking `Stores` after a foreign-store 403 recovered to the assigned-store list;
- browser back returned to the forbidden foreign-store route;
- browser forward returned to the assigned-store list;
- refresh on forbidden foreign-store route cleared stale content.

Defect:
- stale assigned-store details remain visible before refresh after a same-session forbidden foreign-store navigation. See `BUG-UX-006`.

### Hidden vs disabled actions
Status: PARTIAL PASS

Verified:
- admin-only top-level navigation is hidden for operators;
- operator store details do not show `Edit store`;
- publishing action controls are not visible for operator;
- assigned-store catalog/prices/forms controls are visible where expected.

Defects:
- forbidden store form hashes do not render an access-denied state. See `BUG-UX-005`.
- stale controls remain visible after a foreign-store 403 until refresh. See `BUG-UX-006`.

### Access-denied messaging correctness
Status: FAIL

- `/#users-access`: correct route-specific message.
- `/#global-logs`: incorrect `Users & Access is admin-only` message. See `BUG-UX-004`.

### Console/runtime/network observations
Status: REVIEWED

- Expected `403 Forbidden` browser console resource errors appeared during forbidden-route checks.
- Expected pre-login/session `401 Unauthorized` resource errors appeared during login/session transitions.
- No Playwright page crashes were captured.
- Relevant network observations are included in evidence JSON and bug reports.

## Confirmed bugs

| Bug | Severity | Summary |
| --- | --- | --- |
| `BUG-UX-004` | Low | Operator Global Logs route shows Users & Access access-denied copy |
| `BUG-UX-005` | Medium | Operator direct admin-only store form routes silently render overview while forbidden hash remains |
| `BUG-UX-006` | High | Operator foreign-store 403 can leave stale assigned-store details and controls visible |

## Not tested by design
- Scale API behavior.
- Deep catalog publishing flows.
- Destructive product/store mutations.
- Backend RBAC beyond what was required to reproduce/frontend-verify route behavior.

## Final assessment
RBAC/frontend scope is not production-passable as tested. Backend enforcement appears to deny foreign-store access, but frontend runtime handling needs fixes for stale forbidden-route state and route-specific access-denied messaging before this scope should be accepted.
