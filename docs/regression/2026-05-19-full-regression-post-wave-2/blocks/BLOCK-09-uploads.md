# BLOCK 9 — File uploads

**Verdict:** PASS
**Time:** ~30 s
**Script:** `scripts/block-09-uploads.cjs`
**Report JSON:** `evidence/block-09-report.json`

## Scenarios

| ID | Scenario | Expected | Actual | Verdict |
|---|---|---|---|---|
| 9.1 | Upload valid PNG (1×1 with PNG magic) | 201 + publicUrl | 201, mimeType=image/png, publicUrl=/uploads/images/<uuid>.png | ✅ |
| 9.2 | Upload valid JPEG | 201 | 201, mimeType=image/jpeg | ✅ |
| 9.3 | Extension mismatch: .png file with JPEG bytes | 400 | 400 "Image extension does not match actual file type" | ✅ |
| 9.4 | GIF rejected | 400 | 400 "Only jpg, png, or webp image extensions are supported" | ✅ |
| 9.5 | SVG with XSS payload | 400 | 400 (svg ext not in allow list) | ✅ |
| 9.6 | HTML masquerading as .png | 400 | 400 "Only jpg, png, or webp images are supported" (magic-byte check defeats) | ✅ |
| 9.7 | Filename with no extension | 400 | 400 | ✅ |
| 9.8 | Empty file | 400 | 400 "Image file is required" | ✅ |
| 9.9 | Oversize (2 MB + 10 bytes) | 413 | 413 "File too large" | ✅ |
| 9.10 | Path traversal in filename: `../../etc/passwd.png` | accepted but server-side filename replaced with random UUID | 201 + publicUrl uses UUID (not traversal path) | ✅ |
| 9.11 | Wrong field name | 400 | 400 "Unexpected field" | ✅ |
| 9.12 | Unicode filename `тест-файл.png` | 201 + UUID-based storage path | 201 | ✅ |
| 9.13 | Operator role can upload | 201 | 201 | ✅ |
| 9.14 | Unauthenticated upload | 401 | 401 "Authentication required" | ✅ |

## Notes

- **Magic-byte detection is the defense:** even if extension is right, the content bytes must match. HTML+PNG ext is rejected.
- **Path traversal neutralized:** server generates a fresh UUID filename, ignoring user-supplied path. The stored file is always under `/uploads/images/<uuid>.<detected-ext>`.
- **Size limit enforced at multer layer (413), not downstream Nest BadRequest (400).** Correct HTTP semantics.
- **No file leakage:** unauthenticated requests rejected before reaching multer middleware.
- Test uploaded a 1×1 minimal PNG (Base64-decoded). Files written: 7+ small files in `/home/clawd/.../uploads/images/`. Acceptable — files are ~70 bytes each, ephemeral test data.

## Stack state at end of block

Local docker, CORS=localhost; +7 tiny test images on disk in container, +rows in `file_asset` table.

## New BUG-REG opened
None.
