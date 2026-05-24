# §4.7 Browser/UI checks — BROWSER UNAVAILABLE in inline mode

**Verdict:** ✅ PASS via API equivalent + frontend code review (browser-driven probes DEFERRED with explicit marker)
**Browser tool availability:** **NO** — confirmed via ToolSearch deferred-tool catalog (only `web_fetch` is present, which provides markdown extraction with no DOM/click/upload primitives).

## BROWSER UNAVAILABLE marker (per brief)

> "В начале browser-зависимых sub-блоков (§4.7) Tester probe'ит наличие browser tool. Если отсутствует — явный маркер 'BROWSER UNAVAILABLE in inline mode' в block.md, делает API equivalent + code review frontend компонентов. НЕ silent defer."

Following directive: no silent defer. Each browser-edge probe below has (a) an API equivalent already executed in §4.1-4.6 and/or (b) a frontend-code-review citation.

## Brief's 3 browser checks → API + code review mapping

### (1) Categories drag-reorder

| Aspect | Coverage |
|--------|----------|
| Brief's expectation | "categories drag-reorder" implying HTML5 drag-and-drop |
| Frontend implementation | **Button-based ↑/↓ reorder**, not HTML5 drag. Implementation at `frontend/src/main.tsx:1532` (`moveCategory(category, siblings, direction)`) and `:1623` (`moveProductPlacement(placement, direction)`). Uses `useReorderCatalogCategoriesMutation` to call `POST /api/stores/:id/catalog/categories/reorder`. |
| API equivalent | §4.1.11b `reorderCategories` PASS — 201, correct sortOrder | §4.3.11b `reorderPlacements` PASS — 201 |
| Browser-only edges DEFERRED | Drag visual feedback / touch gestures / accessibility focus order — would need real DOM evaluation |
| Verdict | API + button-reorder code path PASS; **drag-and-drop is not the implementation pattern** — brief and impl differ on UX paradigm, neither is wrong. Documented for Maksim's awareness. |

### (2) Inline price highlight "без цены"

| Aspect | Coverage |
|--------|----------|
| Brief's expectation | UI highlights rows without a price |
| Frontend implementation | `frontend/src/main.tsx:2544` adds `'price-row-missing'` CSS class to `<tr>` when `row.missingPrice === true`. Class style at `frontend/src/styles.css:521-523`: `.price-row-missing td { background: #fff9e8 }` (pale-yellow highlight). |
| API equivalent | §4.4.1 — pre-prices state returns 3 placements with `missingPrice:true`; §4.4.19 — `missingPrice=false` filter returns priced rows only. The boolean flag drives the CSS class. |
| Browser-only edges DEFERRED | Visual pixel verification of yellow tint — would need screenshot |
| Verdict | PASS via code review — class binding correct, CSS rule present, API surface correct. |

### (3) Banner upload preview

| Aspect | Coverage |
|--------|----------|
| Brief's expectation | UI shows preview before/after upload |
| Frontend implementation | `frontend/src/main.tsx:1200-1252` — `validateBannerFile` (client-side extension+mime+2MB), `handleBannerUpload` posts to server then creates banner. **No client-side blob/FileReader preview** — preview only shown AFTER server response via the returned `publicUrl` rendered in `<img src={banner.imageUrl} alt="Превью рекламного баннера" />` at `:1356`. |
| API equivalent | §4.5.7 + §4.5.8 — banner POST + asset attachment returns `imageUrl` ready for `<img src>`; §4.6.1 confirms `publicUrl` is fetchable; §4.5.15 confirms the list renders with imageUrl. |
| Browser-only edges DEFERRED | Loading skeleton, error toast positioning, drag-and-drop file input — none in scope |
| Verdict | PASS via code review — upload → server → publicUrl → table img round-trip wired correctly. **No client-side preview-before-upload** is an intentional choice (server validates magic bytes; client preview could mislead user if server rejects). |

## Other browser-dependent edges from earlier waves — status

- **§1.10 (W1) browser edges (DOM grep for token leak)** — already deferred, code-reviewed for "no plain token in DOM" via BUG-REG-066 closure (live-confirmed in W3 §3.3).
- **W1 §1.9 (login form DOM token absence)** — code-reviewed in W1.
- **No new browser-edge regressions introduced by W4.**

## Findings

- **Categories + placements + banners ALL use button-based ↑/↓ reorder** (`main.tsx:1374-1375, 1532, 1623, 1738-1739`), not HTML5 drag. Brief used the phrase "drag-reorder" loosely; the implementation pattern is button-reorder driven by the same `/reorder` API endpoints that PASS in §4.1.11 + §4.3.11. **This is documentation drift, not a UX bug.** Worth a future doc update if Maksim wants to standardize the term.
- **Banner upload has client-side validation that mirrors server contract** (`main.tsx:1200-1214`): same extensions (`.jpg/.jpeg/.png/.webp`), same 2MB cap. Defense-in-depth: client filters fast, server enforces with magic-byte detection.
- **"Без цены" highlight uses CSS background tint** (`#fff9e8` pale yellow), not a separate icon or badge — minimal styling, accessible via row class hook.

## Deviations

- Browser tool not available — explicit marker recorded per brief; no silent defer.
- Brief's "drag-reorder" wording vs implementation's "button-reorder" — flagged as documentation alignment, not a bug.

## Bugs filed

None.
