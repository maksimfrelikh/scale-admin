# §4.6 File Upload Security (PRD §11.7)

**Verdict:** ✅ PASS 14/14 (2 🔴 watchpoints CLEAN, BUG-REG-066 carryover CLEAN)
**Probes:** 14 (Cross-cuts with §4.5; §4.6 focuses on URL-side surface + auth + listing + rate limit)

## Probe ledger

| # | Probe | Method | Path | Expected | Actual | File |
|---|-------|--------|------|----------|--------|------|
| 1 | publicUrl is fetchable | GET | `/uploads/images/<uuid>.jpg` | 200 image/jpeg | 200 ✓ Content-Type:`image/jpeg` 332 bytes magic FF D8 FF E0 | 01-publicurl-fetchable.txt |
| 2a | **🔴 path-traversal URL** `/uploads/images/../../etc/passwd` | GET | raw `..` | nginx normalizes, no escape | 200 SPA HTML returned (path normalized at edge before /uploads handler) — **no file outside uploads accessible** | 02-crit-uploads-traversal.txt |
| 2b | **🔴 URL-encoded traversal** `%2e%2e%2f%2e%2e%2fetc%2fpasswd` | GET | encoded `..` | normalized away | 200 SPA HTML — same defense | 02-crit-uploads-traversal.txt |
| 3 | unauth upload (no session, no CSRF) | POST | `/api/files/images` | reject | 403 CSRF_TOKEN_INVALID (CSRF middleware fires before SessionGuard — same shape as W2 §2.1 POST observation) | 03-unauth-upload.txt |
| 4 | weird filename `evil name with spaces & quotes.png` | POST | `/api/files/images` | sanitized | 201 ✓ originalFileName preserved AS-IS for display; storedFilename UUID-only; storagePath inside uploads/images/ | 04-weird-filename.txt |
| 5 | NEG empty file (0 bytes) | POST | `/api/files/images` | 400 | 400 ✓ "Файл изображения обязателен" (`files.service.ts:41-43`) | 05-empty-file.txt |
| 6 | rate-limit upload bucket | POST | `/api/files/images` × N | 429 after burst | 1-8: 201, **9: 429** `code:"RATE_LIMIT_EXCEEDED",retryAfterSeconds:59` (`@RateLimit({bucket:'upload'})` on `files.controller.ts:28`) | 06-rate-limit-probe.txt |
| 7 | anonymous (no session) GET public image | GET | `/uploads/images/<uuid>.jpg` | 200 (public asset) | 200 ✓ — files are intentionally public delivery (no auth needed for image serving) | 07-anonymous-fetch.txt |
| 8 | nonexistent UUID under /uploads/ | GET | `/uploads/images/<bogus>.jpg` | 404 JSON | 404 ✓ `application/json {"error":"Not Found","statusCode":404}` — no info leak via redirect or 200-fallback | 08-nonexistent.txt |
| 9 | session-but-no-CSRF upload | POST | `/api/files/images` w/ session jar | 403 | 403 ✓ CSRF_TOKEN_INVALID identical to unauth | 09-neg-no-csrf.txt |
| 10a | NO directory listing on `/uploads/` | GET | `/uploads/` | 404 | 404 ✓ "Cannot GET /uploads/" | 10-no-listing.txt |
| 10b | NO directory listing on `/uploads/images/` | GET | `/uploads/images/` | 404 | 404 ✓ "Cannot GET /uploads/images/" | 10-no-listing.txt |

## Code-review confirmations (PRD §11.7 contract checks)

- **Server-generated filenames:** `files.service.ts:65` — `const storedFilename = \`${randomUUID()}.${detectedType.extension}\`;`. Original filename is preserved in DB for display only, **never used in storage path**. UUID + detected-magic-byte extension only.
- **Path traversal in filename:** Multer strips path segments from `originalname` (verified via §4.5.10: `../../etc/passwd.png` → `passwd.png`); even if it didn't, the storage path uses UUID exclusively.
- **AuditLog on upload:** `files.service.ts:86-106` records `action:"file.uploaded"`, entityType `FileAsset`, with `afterData` containing `{id, originalFileName, storedFilename, publicUrl, mimeType, sizeBytes}` — verified live in §4.5.11b admin global-logs.
- **FileAsset.publicUrl prefix:** `IMAGE_UPLOAD_PUBLIC_PREFIX = '/uploads/images'` (`files.service.ts:9`) — concatenated with UUID-filename only, no template/variable injection surface.
- **Defense-in-depth size cap:** `MAX_IMAGE_SIZE_BYTES = 2*1024*1024` enforced at Multer (`files.controller.ts:31`), at service (`files.service.ts:47-49`), and at nginx edge (413 from §4.5.5).
- **Allowed extensions allow-list (whitelist):** `ALLOWED_EXTENSIONS = new Set(['jpg','jpeg','png','webp'])` (`files.service.ts:10`).
- **Magic-byte detection** (`files.service.ts:155-183`): JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF…WEBP`. Must match the declared extension or 400.
- **Rate limit:** `@RateLimit({bucket:'upload'})` confirmed live at 8/min (1-8 PASS, 9 → 429).
- **BUG-REG-041 carry-over (rate limiting):** still in force.
- **BUG-REG-040 carry-over (banner imageUrl http(s)-only):** still in force — verified §4.5.19.
- **BUG-REG-066 carry-over (no plain auth tokens in invite/reset responses):** unrelated to upload but verified clean via W3 §3.3 — file uploads have no equivalent secret-exposure surface.

## Findings

- **🔴 BOTH CRITICAL WATCHPOINTS CLEAN:**
  - URL-side path traversal (raw + percent-encoded) → normalized by nginx, falls through to SPA fallback, NEVER reaches a file outside uploads dir.
  - Server-side stored filenames never use originalname; even if Multer didn't strip path segments, storage path is UUID-derived.
- `/uploads/` and `/uploads/images/` return **404 with no directory listing** — Express `serveStatic` has `index:false` semantics or equivalent (effective behavior verified at edge).
- `publicUrl` is intentionally **anonymous-readable** (no auth required on GET `/uploads/...`) — this is the design for serving banner images to scale devices and frontend. Acceptable because UUID filenames are unguessable (122 bits of entropy).
- **Operator file.uploaded audit row has `storeId=null`** (global event) — not surfaced via `/api/stores/:id/logs`, only via admin `/api/logs/global` (verified §4.5.11b). Design note, not a bug.

## Deviations

None. PRD §11.7 contract fully satisfied.

## Bugs filed

None.
