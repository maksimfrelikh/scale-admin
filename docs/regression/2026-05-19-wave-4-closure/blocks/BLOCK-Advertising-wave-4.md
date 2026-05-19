# BLOCK Advertising: PASS

Wave 4 closure regression — Advertising banner imageUrl validation (BUG-REG-040).

**Re-dispatch run** after staging wrapper redeploy on 2026-05-19 ~22:50 GMT+2.
Previous run at `verify/wave-4-closure @ 96d7d63` FAILED 2/10 — staging
container was running pre-fix code (`abf5803`). Wrapper redeploy brought
`/app/dist/advertising/image-url.util.js` up to `main@4497f57`. This run
confirms the merged fix is live and effective end-to-end.

- Target: `https://staging.maksimfrelikh.ru`
- Branch: `verify/wave-4-closure` off `main@4497f57`
- Route: `/api/stores/:storeId/advertising/banners` (POST + PATCH)
- Store used: `e4d711db-dddd-4749-9a4c-0c2aed2f4f77` (`STORE-001`)
- Playwright: 1.60.0 (resolved from `/tmp/openclaw-pw/node_modules`)
- Total scenarios: 10
- Passed: 10
- Median elapsed: 10 ms

## Scenario table

| # | Scenario | Expected | Actual | Status | Elapsed ms |
|---|---|---|---|---|---|
| S1 | POST `https://example.com/banner.png` | 201 | 201, banner id `124147e2…` | PASS | 12 |
| S2 | POST `javascript:alert(1)` | 400, http(s) URL error | 400, "imageUrl must be a valid http(s) URL" | PASS | 8 |
| S3 | POST `data:image/png;base64,iVBORw0KGgo...` | 400 | 400, "imageUrl must be a valid http(s) URL" | PASS | 8 |
| S4 | POST `not-a-url` | 400 | 400, "imageUrl must be a valid http(s) URL" | PASS | 7 |
| S5 | POST `ftp://example.com/x.png` | 400 | 400, "imageUrl must be a valid http(s) URL" | PASS | 32 |
| S6a | PATCH `javascript:alert(1)` | 400 | 400, "imageUrl must be a valid http(s) URL" | PASS | 16 |
| S6b | PATCH `data:image/png;base64,xxx` | 400 | 400, "imageUrl must be a valid http(s) URL" | PASS | 8 |
| S6c | PATCH `not-a-url` | 400 | 400, "imageUrl must be a valid http(s) URL" | PASS | 8 |
| S6d | PATCH `ftp://example.com/x.png` | 400 | 400, "imageUrl must be a valid http(s) URL" | PASS | 8 |
| S7 | PATCH `https://example.com/banner2.png` | 200 | 200, imageUrl updated | PASS | 11 |

Empty-imageUrl sanity probe (out-of-band curl):

```
POST /api/stores/e4d711db-…/advertising/banners  { "imageUrl": "", ... }
HTTP 400 {"message":"imageUrl is required","error":"Bad Request","statusCode":400}
```

The legacy `imageUrl is required` message is preserved for the empty case
per BUG-REG-040 design. The new `imageUrl must be a valid http(s) URL`
message fires only for non-empty values that fail URL/scheme parse.

## Evidence

- `../evidence/block-2-advertising-report.json` — full per-scenario capture (this run)
- Cleanup: created banner `124147e2-8855-42c7-95a8-89295f581602` archived during teardown.

## Per-scenario excerpts

<details>
<summary>S2 — javascript: scheme rejected</summary>

```
POST /api/stores/e4d711db-…/advertising/banners
{ "imageUrl": "javascript:alert(1)", "status": "active", "sortOrder": 0 }

HTTP 400
{"message":"imageUrl must be a valid http(s) URL","error":"Bad Request","statusCode":400}
```
</details>

<details>
<summary>S6a — PATCH javascript: now correctly rejected (Wave-4 fix verified live)</summary>

```
PATCH /api/stores/e4d711db-…/advertising/banners/124147e2-…
{ "imageUrl": "javascript:alert(1)" }

HTTP 400
{"message":"imageUrl must be a valid http(s) URL","error":"Bad Request","statusCode":400}
```
</details>

<details>
<summary>S7 — PATCH with valid https URL accepted</summary>

```
PATCH /api/stores/e4d711db-…/advertising/banners/124147e2-…
{ "imageUrl": "https://example.com/banner2.png" }

HTTP 200
{"banner":{"id":"124147e2-…","imageUrl":"https://example.com/banner2.png","status":"active",…}}
```
</details>
