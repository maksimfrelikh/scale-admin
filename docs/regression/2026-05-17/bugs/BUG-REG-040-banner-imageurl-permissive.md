# BUG-REG-040: Advertising banner `imageUrl` validation accepts arbitrary strings (incl. `javascript:` URI and plain garbage)

- **Status:** OPEN
- **Severity:** medium (defense-in-depth gap; not directly exploitable as XSS in modern browsers, but pollutes data + may leak to scales via publishing)
- **Area:** advertising / banners / validation
- **Role:** admin
- **Environment:** local docker against `main @ bd3d5e2`
- **Browser/Tool:** Playwright + direct API
- **Found during:** Wave 3 full regression, Block 8 (`block-08-banners.cjs`)
- **Related:** none currently

## Шаги воспроизведения

```bash
# As authenticated admin (CSRF + session cookie set):
curl -s -i -H "Content-Type: application/json" -H "Origin: http://localhost:5173" \
  -H "X-CSRF-Token: $TOKEN" -H "Cookie: scale_admin_csrf=$TOKEN; scale_admin_session=<...>" \
  -X POST http://localhost:3000/api/stores/<storeId>/advertising/banners \
  -d '{"imageUrl":"javascript:alert(1)","status":"active"}'
# → 201 Created

curl ... -d '{"imageUrl":"not-a-url","status":"active"}'
# → 201 Created
```

UI behavior (verified by `scripts/probe-block-08-banner-render.cjs`):

```html
<!-- in advertising-tab section -->
<img alt="Advertising banner preview" src="not-a-url">
  <small>not-a-url</small>
<img alt="Advertising banner preview" src="javascript:alert(1)">
  <small>javascript:alert(1)</small>
```

## Ожидаемое

- 400 + helpful validation message for non-http(s) schemes.
- 400 for syntactically invalid URLs.
- Acceptable schemes: `http://`, `https://`, possibly internal `/uploads/<file-asset-id>` if using file-asset path. Per the banner-upload-card UI ("Upload JPG, PNG or WebP banners up to 2 MB"), the expected flow is file upload → server returns a URL; manually-entered imageUrl was likely never supposed to be a happy path.

## Фактическое

- 201 Created for `javascript:alert(1)`
- 201 Created for `not-a-url`
- 201 Created for `data:image/png;base64,...` (untested — but likely)
- 400 only for missing `imageUrl`

## Network / Console

```
POST /api/stores/<id>/advertising/banners
  body: {"imageUrl":"javascript:alert(1)","status":"active"}
→ 201 {"id":"<uuid>","imageUrl":"javascript:alert(1)","status":"active",...}
```

## Hypothesis

`backend/src/advertising/advertising.service.ts` — `createBanner`:
- Likely validates non-empty string only, not URL syntax or scheme.
- The `imageUrl` field probably has type `string` with no URL parsing.

Probable fix:
- Add server-side URL validation: `new URL(input.imageUrl)` and require `protocol` ∈ `{ 'http:', 'https:' }`.
- Optionally enforce file-asset-only mode by requiring `imageFileAssetId` and rejecting raw `imageUrl` from the request body (UI uses file upload happy path).

## Impact

- **XSS via `javascript:` in `<img src>`:** NOT directly exploitable in modern browsers (HTML5 spec: javascript: URLs in `<img>` are silently dropped). Verified: `page.on('dialog')` and `framenavigated` never fire on the admin preview page.
- **Phishing surface:** an admin (or attacker with admin) could set `imageUrl: 'https://impersonating-domain.com/realistic-banner.png'`. Once the catalog is published, scales serve this image to retail customers. Not a regression per se, but the missing URL validation makes it trivially exploitable.
- **Defense-in-depth gap:** unvalidated input flows to:
  - Admin UI `<img src>` (currently harmless in browsers)
  - Published catalog data → scale firmware (unknown rendering surface; may not have the same XSS protections as Chrome)
- **Data hygiene:** broken-image placeholders in admin UI when `not-a-url` is saved.

## Acceptance criteria

1. POST banner with `imageUrl: 'javascript:alert(1)'` → 400.
2. POST banner with `imageUrl: 'data:text/html,<script>alert(1)</script>'` → 400.
3. POST banner with `imageUrl: 'not-a-url'` → 400.
4. POST banner with `imageUrl: 'https://example.com/x.png'` → 201 (still works).
5. POST banner with `imageUrl: 'ftp://example.com/x.png'` → 400 (or per discussion).
6. Same rules on PATCH for `imageUrl`.
7. Unit tests added under `backend/src/advertising/advertising.service.spec.ts`.

## Out of scope

- Image fetching / validation (HEAD request to confirm Content-Type) — separate ticket if needed.
- File-asset-only mode (replacing imageUrl with imageFileAssetId pointer) — product decision.

## Evidence

- `docs/regression/2026-05-19-full-regression-post-wave-2/scripts/block-08-banners.cjs` (initial discovery — 8.4, 8.5)
- `docs/regression/2026-05-19-full-regression-post-wave-2/scripts/probe-block-08-banner-render.cjs` (UI rendering verification)
- `docs/regression/2026-05-19-full-regression-post-wave-2/evidence/probe-banner-render.png`
- `docs/regression/2026-05-19-full-regression-post-wave-2/evidence/block-08-report.json`
