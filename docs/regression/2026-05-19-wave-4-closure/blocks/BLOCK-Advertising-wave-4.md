# BLOCK Advertising: FAIL

Wave 4 closure regression — Advertising banner imageUrl validation (BUG-REG-040).

**FAIL-FAST tripped**: PATCH with `javascript:alert(1)` returned 200 — exactly the security-regression trigger called out in the brief.

- Target: `https://staging.maksimfrelikh.ru`
- Branch: `verify/wave-4-closure` off `main@4497f57`
- Route: `/api/stores/:storeId/advertising/banners`
- Store used: `e4d711db-dddd-4749-9a4c-0c2aed2f4f77` (`STORE-001`)
- Playwright: 1.60.0
- Total scenarios: 10
- Passed: 2 (S1 create-valid, S7 patch-valid)
- Median elapsed: 14 ms

## Scenario table

| # | Scenario | Expected | Actual | Status | Elapsed ms |
|---|---|---|---|---|---|
| S1 | POST create `https://example.com/banner.png` | 201 | 201, banner id `3c608aaf…` | PASS | 20 |
| S2 | POST create `javascript:alert(1)` | 400, http(s) URL error | **201, banner persisted with javascript: URL** | **FAIL** | 11 |
| S3 | POST create `data:image/png;base64,…` | 400 | **201, banner persisted with data: URI** | **FAIL** | 13 |
| S4 | POST create `not-a-url` | 400 | **201, banner persisted** | **FAIL** | 11 |
| S5 | POST create `ftp://example.com/x.png` | 400 | **201, banner persisted with ftp: URL** | **FAIL** | 61 |
| S6a | PATCH `javascript:alert(1)` on valid banner | 400 | **200, imageUrl updated to javascript:** | **FAIL** (SECURITY) | 19 |
| S6b | PATCH `data:image/png;base64,xxx` | 400 | **200, imageUrl updated to data:** | **FAIL** | 14 |
| S6c | PATCH `not-a-url` | 400 | **200, imageUrl updated** | **FAIL** | 12 |
| S6d | PATCH `ftp://example.com/x.png` | 400 | **200, imageUrl updated to ftp:** | **FAIL** | 11 |
| S7 | PATCH `https://example.com/banner2.png` | 200 | 200 | PASS | 14 |

## Root cause hypothesis

The fix at `main@4497f57` introduces `backend/src/advertising/image-url.util.ts`:

```ts
if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
  return { valid: false, reason: 'imageUrl must be a valid http(s) URL' };
}
```

…called from `requireImageUrl` in `advertising.service.ts`.

The **previous** version (commit `abf5803`, pre-fix) had:

```ts
private requireImageUrl(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException('imageUrl is required');
  }
  return value.trim();
}
```

Probe `POST imageUrl=""` against staging returns **`{"message":"imageUrl is required",...}`** — verbatim the pre-fix message. The new fix would still emit that for the empty case, BUT staging happily accepts `not-a-url`, `ftp://`, `javascript:`, `data:` (any non-empty string) which is impossible if the new URL-scheme guard is wired in.

**Conclusion**: the staging container image was NOT rebuilt with PR#16 / commit `4497f57`. The deployed backend is running pre-fix code (presumably built off `abf5803` or earlier). Codebase at HEAD is correct; the issue is purely operational (stale deploy).

## Evidence

- `../evidence/block-2-advertising-report.json` — full per-scenario capture
- Created/leaked banner IDs (all archived during cleanup, but still persisted in DB rows):
  - `3c608aaf-55d0-4834-9e5d-d120ee6b5176` (S1 valid → mutated via PATCH to `javascript:`, then `data:`, then `not-a-url`, then `ftp://`, then `https://…banner2.png`, then archived)
  - `724e5d37-eaac-4bb5-99d4-169fe067b4ef` (S2 javascript:) — archived
  - `b4acb2af-a100-4d70-86e4-355d18abb14f` (S3 data:) — archived
  - `4ca47d1c-cf3d-462b-ab80-d4612c284e27` (S4 not-a-url) — archived
  - `3d1f0113-35d7-47ae-aa1a-e586f6332148` (S5 ftp:) — archived

## Per-scenario excerpts

<details>
<summary>S2 — javascript: scheme accepted (CRITICAL)</summary>

```
POST /api/stores/e4d711db-…/advertising/banners
{ "imageUrl": "javascript:alert(1)", "status": "active", "sortOrder": 0 }

HTTP 201
{"banner":{"id":"724e5d37-…","imageUrl":"javascript:alert(1)","status":"active",…}}
```
</details>

<details>
<summary>S6a — PATCH javascript: returned 200 (CRITICAL — FAIL-FAST trigger)</summary>

```
PATCH /api/stores/e4d711db-…/advertising/banners/3c608aaf-…
{ "imageUrl": "javascript:alert(1)" }

HTTP 200
{"banner":{"id":"3c608aaf-…","imageUrl":"javascript:alert(1)","status":"active",…}}
```
</details>

<details>
<summary>Sanity probe — empty imageUrl still gives pre-fix error message</summary>

```
POST /api/stores/e4d711db-…/advertising/banners
{ "imageUrl": "", "status": "active", "sortOrder": 0 }

HTTP 400
{"message":"imageUrl is required","error":"Bad Request","statusCode":400}
```

This message verbatim matches the pre-fix `requireImageUrl` at `abf5803`, confirming the deployed code path runs the OLD validator.
</details>

## Recommendation to Manager / Lead

1. Rebuild and redeploy the staging backend container from `main@4497f57`. The fix is correct in source; this is an operational issue.
2. Re-run Block 2 (and Block 3 smoke) once the new image is live.
3. Consider adding a `/api/version` endpoint or a build-SHA label so testers can verify deployed-vs-source-of-truth before regression runs.
