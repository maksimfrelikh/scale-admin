# BLOCK 4 — Products master catalog

**Verdict:** PASS
**Time:** ~1 min
**Scripts:** `scripts/block-04-products.cjs`, `scripts/probe-xss-render.cjs`
**Report JSON:** `evidence/block-04-report.json`

## Scenarios

| ID | Scenario | Expected | Actual | Verdict |
|---|---|---|---|---|
| 4.1 | GET /products — default | 200 + paginated list | 200, count 50 (page size), `total` field present, statuses include active+archived | ✅ |
| 4.2 | Status filter `?status=active` | 200, all rows active | 200, 33 rows, all active | ✅ |
| 4.3 | Status filter `?status=archived` | 200, all rows archived | 200, 35 rows, all archived | ✅ |
| 4.4 | Search by partial name | 200, results match query (no SQL injection) | 200; existing seed contains a `'; DR...` named row — search escapes correctly | ✅ |
| 4.5 | Create product (valid) | 201 + id | 201 + uuid | ✅ |
| 4.6 | Create product — duplicate PLU | 409 conflict | 409 "Product defaultPluCode already exists" | ✅ |
| 4.7 | Create — empty body | 400 validation | 400 "Product defaultPluCode is required..." | ✅ |
| 4.8 | GET /products/:id | 200 + fields match | 200 | ✅ |
| 4.9 | Patch rename | 200 | 200 | ✅ |
| 4.10 | Patch invalid status `banana` | 400 | 400 "Product status must be active, inactive, or archived" | ✅ |
| 4.11 | Archive (status=archived) | 200 | 200 | ✅ |
| 4.12 | GET after archive | 200, archived | 200 | ✅ |
| 4.13 | Restore to active | 200 | 200 | ✅ |
| 4.14 | XSS in name — `<script>alert("xss")</script>...` | persisted as text, NOT executed in UI | persisted as-is; UI renders escaped (no dialog, no onerror, no raw `<script>` in DOM) | ✅ |
| 4.15 | UI /products renders | products page loads | 200, title present | ✅ |

## XSS deep-probe (4.14)

`scripts/probe-xss-render.cjs` creates a product with `<img src=x onerror=window.__xssFired=true>` in the name, navigates to /products as admin, and:
- No `dialog` event fired
- `window.__xssFired` stays false
- No raw `<img src=x onerror=...>` parsed into the DOM

React's default text-node rendering correctly neutralizes the XSS payload. **No bug.** Note as defense-in-depth opportunity: backend currently does NOT sanitize/strip HTML on product name input — UI is the only line of defense. For MVP this is acceptable; future hardening could add server-side sanitation.

## Notes

- Default page size 50 with `total` field — pagination shape consistent.
- Wave3 test product `0c2807d9-...` (PLU starting `7...`) left active. Will be left in local DB.
- The seed DB contains a product whose name starts with `'; DR...` — verified that filtering/search escapes input correctly (no SQLi).

## Stack state at end of block
Local docker, CORS=localhost, +1 active test product.

## New BUG-REG opened
None.
