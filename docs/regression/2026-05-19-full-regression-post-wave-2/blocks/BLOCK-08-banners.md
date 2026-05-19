# BLOCK 8 — Advertising banners

**Verdict:** PASS-with-1-bug
**Time:** ~1 min
**Scripts:** `scripts/block-08-banners.cjs`, `scripts/probe-block-08-banner-render.cjs`
**Report JSON:** `evidence/block-08-report.json`

## Scenarios

| ID | Scenario | Expected | Actual | Verdict |
|---|---|---|---|---|
| 8.0 | Setup test store | created | created | ✅ |
| 8.1 | List banners — empty | 200, 0 | 200, 0 | ✅ |
| 8.2 | Create banner via `imageUrl` | 201 | 201 | ✅ |
| 8.3 | Create 2 more banners | 201/201 | 201/201 | ✅ |
| 8.4 | Create with `imageUrl: 'not-a-url'` | 400 invalid URL | **201 created** → BUG-REG-040 | ❌ |
| 8.5 | Create with `imageUrl: 'javascript:alert(1)'` | 400 unsafe scheme | **201 created** → BUG-REG-040 | ❌ |
| 8.6 | Create missing `imageUrl` | 400 | 400 "imageUrl is required" | ✅ |
| 8.7 | List after create — 5 banners present, sortOrder 0 default | 5 banners | 5 banners, sortOrder all 0 (newest insert at top via DB pk, not explicit ordering) | ✅ |
| 8.8 | Reorder via POST /reorder | 201 + new order | 201 + 3 banners reordered (sortOrder rebuilt) | ✅ |
| 8.9 | PATCH banner imageUrl (rename) | 200 | 200 | ✅ |
| 8.10 | PATCH /:id/status → archived | 200 + status=archived | 200 | ✅ |
| 8.11 | List `?status=active` after archive | 4 active (one was archived) | 4 active | ✅ |
| 8.12 | **Cascade**: archive parent store → banners | all banners → archived | all 5 banners status=archived after store archive | ✅ |

## Cascade verdict — CASCADE WORKS

Archiving the parent store atomically transitions all banners to `archived`. Confirmed in scenario 8.12.

## Adjacent finding — BUG-REG-040

**Severity:** medium
**Title:** Advertising banner `imageUrl` validation accepts arbitrary strings (incl. `javascript:` URI and plain garbage)

- POST banner with `imageUrl: 'javascript:alert(1)'` → 201 Created
- POST banner with `imageUrl: 'not-a-url'` → 201 Created
- Direct XSS via `<img src>` not exploitable in modern browsers (HTML5 ignores javascript: in img src — verified no dialog/navigation fired)
- But:
  - Phishing surface: arbitrary URLs accepted, propagated to published catalog
  - UI shows broken-image placeholder when src is `not-a-url`
  - Defense-in-depth gap: backend should validate URL scheme

See `docs/regression/2026-05-17/bugs/BUG-REG-040-banner-imageurl-permissive.md`.

## Notes

- Banner UI flow uses an upload widget (`<input type="file" accept="image/png,image/jpeg,image/webp">`) — the manual `imageUrl` field appears to be an advanced/test path.
- The publication-required banner ("Banner uploads, status changes and order changes require a new catalog publication before scales receive them") is a useful UX cue.

## Stack state at end of block

Local docker, CORS=localhost; +1 test store with 5 banners (4 active, 1 archived initially → all archived during cascade test → then store restored to active but banners remain archived since reverse-cascade is not part of restore scope, consistent with BUG-REG-035 closure behavior).

## New BUG-REG opened
- **BUG-REG-040** (medium) — banner imageUrl validation gap
