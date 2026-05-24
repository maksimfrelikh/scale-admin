# §7.4 Mobile Responsive 375×667 — SUMMARY

**Verdict:** ✅ PASS (code-review fallback; live browser verification deferred to Wave 8)
**Probes:** 10 code-review checkpoints
**Bugs filed:** 0
**🔴 watchpoint status:** none triggered

## Stack identified

Frontend styling = **hand-written CSS** in `frontend/src/styles.css` (~1820 lines), NOT Tailwind/styled-components. Vite SPA shell has viewport meta `width=device-width, initial-scale=1.0` (verified in §7.1 rendered HTML).

## Breakpoints

| Width threshold | Rules applied |
|-----------------|---------------|
| `max-width: 900px` | metric-grid, dashboard-section-grid, operator-store-grid, problem-scale-grid, scale-device-form, category-fields, placement-form, invite-grid, access-grant-row → `1fr`; user-card-main, store-access-header, access-item, category-card-main, placement-card → `display: grid`; category-actions, dashboard-list-actions → stretch + full-width buttons |
| `max-width: 800px` | product-search, product-form-grid, banner-upload-card → `1fr`; product-search button → full-width |
| `max-width: 720px` | dashboard-header, panel-heading, version-history-heading → `display: grid` with full-width buttons; store-card, details-grid → `1fr`; store-actions, action-row → stretch + full-width buttons; pagination → `flex-direction: column` |
| `max-width: 520px` | dashboard-shell + panel padding → `1rem` (from `2rem`); metric-card big-number → `1.65rem` (from `2rem`); dashboard-list-item, dashboard-list-actions, problem-scale-heading → grid stretch; compact-details → `1fr` |

**iPhone SE 375×667 hits 4 breakpoints simultaneously** (375 < 520 < 720 < 800 < 900) — gets all mobile rules applied.

## Per-page coverage at 375 wide

| Page / Element | 375 px behavior | Verdict |
|----------------|-----------------|---------|
| **Login card** | `width: min(480px, 100%)` → resolves to 100% = 375px, with 2rem (32px) shell-padding → effective ~343px content | ✅ |
| Login inputs | `width: 100%` + `padding: 0.85rem 1rem` → height ~44px (Apple HIG touch target) | ✅ |
| Login submit button | `padding: 0.75rem 1rem` → height ~44px | ✅ |
| **Dashboard shell** | `width: min(1040px, 100%)` + `padding: 1rem` (@<520) → ~343px content area | ✅ |
| App nav (top tabs) | `display: flex; flex-wrap: wrap` → wraps to multiple lines if many tabs | ✅ |
| Metric cards (4 → 1) | `metric-grid: repeat(4,1fr)` becomes `1fr` at <900 → single column | ✅ |
| **Store list (grid → single column)** | `details-grid: repeat(2,1fr)` becomes `1fr` at <720; `store-card` becomes grid at <720 with stacked content + stretched action buttons | ✅ |
| **Catalog tab** | `category-fields: repeat(3,1fr)` becomes `1fr` at <900; category-actions stretch with full-width buttons | ✅ |
| **Catalog tree** | `category-list` is grid with nested indent (`padding-left: 1.25rem`); depth contributes ~20px per level — manageable for shallow trees but could squeeze content at 4+ depth | ⚠️ deferred to live test |
| **Prices tab** | `price-filters: minmax(220px,1.5fr) repeat(2, minmax(180px,1fr))` (minimum ~580px combined!) becomes `1fr` at <900 → 1-column stack | ✅ |
| Prices table | `min-width: 980px` inside `overflow-x: auto` wrap → horizontal scroll on mobile | ✅ |
| **Inline price form** | `display: flex` with `input{width:8rem}` + button → ~220px min; fits 375 | ✅ |
| **Banner upload card** | `repeat(180px+240px)` (= 420px min) becomes `1fr` at <800 → single column | ✅ |
| Banner preview img | fixed `width: 180px` — fits 375 with margin | ✅ |
| Banner table | `min-width: 860px` inside overflow-x wrap → scrolls | ✅ |
| **Scale devices form** | `repeat(3,1fr) auto` becomes `1fr` at <900 → single column | ✅ |
| Scale device table | `min-width: 980px` inside overflow-x wrap → scrolls | ✅ |
| Token notice (`apiToken` 43 chars) | `overflow-wrap: anywhere` on `code` → wraps inside card | ✅ |
| **Logs tab** | `logs-filters: repeat(auto-fit, minmax(min(180px, 100%), 1fr))` — auto-fits, NEVER overflows | ✅ excellent technique |
| Logs table | `min-width: 860px` inside overflow-x wrap → scrolls | ✅ |
| **Invite/users panel** | `invite-grid: repeat(4,1fr)` becomes `1fr` at <900; access-grant-row collapses at <900 | ✅ |
| Pagination | `flex-direction: column` at <720 → label + controls stack | ✅ |

## Layout-blowout prevention techniques (audit)

Searching `styles.css` for the standard "no-blowout" pattern (`min-width: 0; max-width: 100%; overflow-wrap: anywhere`):
- Used **extensively** on `.dashboard-header > *`, `.panel-heading > *`, `.action-row`, `.store-card > *`, `.store-actions`, `.details-grid dd`, `.dashboard-overview *`, `.token-notice code`, `.banner-preview small`, `.metric-card span`, `.section-heading-row > *`, `.problem-scale-heading > *`, `.compact-details dd`, etc.
- Tables consistently wrapped in `*-table-wrap { overflow-x: auto; max-width: 100%; -webkit-overflow-scrolling: touch }` containers.

**Verdict:** the CSS author was explicitly mobile-aware — defensive `min-width: 0` pattern applied everywhere needed.

## Fixed-width elements (audit)

Searched for `width: <px>` (not `min-width`, not `max-width`):
- `.product-image-preview img { width: 72px; height: 72px }` — fits 375 with margin ✓
- `.banner-preview img { width: 180px; height: 72px }` — fits 375 with margin ✓
- `.inline-price-form input { width: 8rem }` = 128px — fits ✓
- `.role-control { min-width: 9rem }` = 144px — fits ✓
- Logs-filter `minmax(min(180px, 100%), 1fr)` — auto-clamps to 100% if smaller — never blows out ✓

**Verdict:** no fixed-px element exceeds 375 viewport width.

## Touch targets

- Inputs: `padding: 0.85rem 1rem` + font-size ~1rem → height ≈ 44px (Apple HIG minimum 44pt) ✓
- Buttons: `padding: 0.75rem 1rem` → height ≈ 44px ✓
- Mobile action buttons: full-width via `width: 100%` at <720 → easy to tap ✓
- Pagination controls: `padding: 0.5rem 0.9rem` → height ≈ 36px — slightly below 44px ⚠️ (deferred for live verification)

## Form usability at 375×667

| Form | Behavior |
|------|----------|
| Login (email, password, submit) | All full-width inputs, stacked vertically — usable ✅ |
| Accept-invite (token-based) | Same structure, token in URL, password + repeat password fields — usable ✅ |
| Reset-password | Same — usable ✅ |
| Store create/edit | Single column at <720 — usable ✅ |
| Product create/edit | `product-form-grid: repeat(2,1fr)` → 1fr at <800 — usable ✅ |
| Category create/edit | `category-fields: repeat(3,1fr)` → 1fr at <900 — usable ✅ |
| Invite user | `invite-grid: repeat(4,1fr)` → 1fr at <900 — usable ✅ |
| Banner upload | `repeat(180+240)` → 1fr at <800 — usable ✅ |
| Scale device register | `repeat(3,1fr) auto` → 1fr at <900 — usable ✅ |
| Placement create (price-list entry) | `repeat(4-col)` → 1fr at <900 — usable ✅ |

## Tables (horizontal scroll)

All data tables (`.price-table`, `.product-table`, `.version-table`, `.banner-table`, `.logs-table`, `.scale-device-table`) wrap in `*-table-wrap` containers with:
- `overflow-x: auto`
- `max-width: 100%`
- `overscroll-behavior-inline: contain` (prevents pull-to-refresh trigger)
- `-webkit-overflow-scrolling: touch` (iOS momentum scroll)

Table `min-width` ranges: 720 (version), 860 (banner, logs), 900 (product), 980 (scale-device, price). On a 375 viewport, every table scrolls horizontally — content stays legible at full size, no content cropping.

**Cosmetic backlog (NOT a bug):** no visual shadow/gradient at scroll edges — user must discover scrollability by trying. Could be improved with a `linear-gradient(to right, white, transparent)` overlay; deferred.

## Empty-state placeholders (preview, formal §7.5)

`.empty-state { padding: 1rem; border: 1px dashed; color: #5d6b85; background: #f8faff }` — exists and is referenced in `.store-details-panel` rule. Single-column at any width.

## Confirm dialogs

Frontend uses native `window.confirm(...)` for destructive ops (3 instances: category-archive, banner-delete, invite-cancel). Native dialog is OS-rendered → respects viewport, always usable. ✅

## Deferred to Wave 8 (live browser verification)

1. **Visual scroll affordance** on overflow-x tables (no shadow/gradient hint).
2. **Pagination button tap target** (36px height < 44pt HIG).
3. **Long category tree depth** (4+ nesting) visual squeeze.
4. **Modal/confirm dialog centering** on iOS / Chrome mobile.
5. **Long Russian text wrap** in metric-card-strong / badges / banner imageUrl preview.
6. **Toast/inline status visibility** on landscape narrow.
7. **Touch keyboard pushing form below fold** — input scroll-into-view behavior.

## Closure

§7.4 verdict: ✅ PASS (code-review). CSS is mobile-aware with 4 responsive breakpoints, `min-width: 0` blowout-prevention applied broadly, every form has a `1fr` fallback at narrow width, all tables in `overflow-x: auto` wrappers. No fixed-px element exceeds 375px viewport. Touch targets ≥44px on primary inputs/buttons. 7 deferred items for browser-tool-equipped Wave 8 live verification.
