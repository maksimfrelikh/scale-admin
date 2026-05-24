# §4.5 Advertising — upload + reorder + packageData

**Verdict:** ✅ PASS 19/19 (4 🔴 watchpoints CLEAN)
**Probes:** 19 across upload, magic-byte, oversize, path-traversal, banner CRUD, reorder, packageData snapshot

## Probe ledger

| # | Probe | Method | Path | Expected | Actual | File |
|---|-------|--------|------|----------|--------|------|
| 1 | upload valid.jpg (332 bytes, JPEG magic FF D8 FF) | POST | `/api/files/images` | 201 fileAsset | 201 ✓ id=`f1a16923-…`, storedFilename=`<uuid>.jpg`, mimeType:"image/jpeg" | 01-upload-jpg.txt |
| 2 | upload valid.png (69 bytes, PNG magic 89 50 4E 47) | POST | `/api/files/images` | 201 | 201 ✓ mimeType:"image/png" | 02-upload-png.txt |
| 3 | upload valid.webp (30 bytes, RIFF…WEBP) | POST | `/api/files/images` | 201 | 201 ✓ mimeType:"image/webp" | 03-upload-webp.txt |
| 4 | **🔴 fake-as.jpg (txt content + .jpg ext)** | POST | `/api/files/images` | 400 magic-byte mismatch | 400 ✓ "Поддерживаются только изображения jpg, png или webp" (magic-byte detection at `files.service.ts:155-183`) | 04-crit-fake-as-jpg.txt |
| 5 | **🔴 oversize.jpg (2,097,255 bytes > 2 MB)** | POST | `/api/files/images` | rejected | **413** nginx `Request Entity Too Large` (nginx upload-cap at edge BEFORE backend) — defense-in-depth: nginx hard-rejects > size; backend also has `MAX_IMAGE_SIZE_BYTES = 2*1024*1024` Multer cap | 05-crit-oversize.txt |
| 6 | plain.txt (text content + .txt ext) | POST | `/api/files/images` | 400 ext reject | 400 ✓ "Поддерживаются только расширения изображений jpg, png или webp" (extension allow-list at `files.service.ts:146-153`) | 06-neg-plain-txt.txt |
| 7 | create banner using JPG asset | POST | `/api/stores/:id/advertising/banners` | 201 | 201 ✓ imageFileAssetId attached | 07-create-banner-jpg.txt |
| 8 | create banner using PNG asset | POST | `/api/stores/:id/advertising/banners` | 201 | 201 ✓ | 08-create-banner-png.txt |
| 9 | reorder banners [B2, B1] | POST | `/api/.../banners/reorder` | 201 sortOrder=[0,1] | 201 ✓ | 09-reorder-banners.txt |
| 10 | **🔴 path-traversal originalFilename** `../../etc/passwd.png` | POST | `/api/files/images` | sanitized | 201 ✓ originalFileName=`passwd.png` (Multer strips path segments); storedFilename=UUID; storagePath=`uploads/images/{uuid}.png` — **no traversal escape** | 10-path-traversal.txt |
| 11 | audit file.uploaded (operator /logs vs admin global) | GET | `/api/stores/:id/logs?entityType=FileAsset` (op) + `/api/logs/global?action=file.uploaded` (admin) | events recorded | operator scope returns empty (file uploads are global, storeId=null); admin global returns all 4 file.uploaded events with actor=operator | 11-audit-fileasset.txt |
| 12 | banner status active→inactive | PATCH | `/banners/:id/status` | 200 | 200 ✓ | 12-banner-status.txt |
| 13 | banner status inactive→active (restore) | PATCH | `/banners/:id/status` | 200 | 200 ✓ | 13-banner-restore.txt |
| 14 | GET banner detail | GET | `/banners/:id` | 200 | 200 ✓ | 14-banner-get.txt |
| 15 | GET banner list | GET | `/banners` | active+archived | 200 ✓ — list shows 2 new (active) + 7 legacy archived (incl. `javascript:`, `data:`, `not-a-url`, `ftp:` from BUG-REG-040 testing — all archived) | 15-banner-list.txt |
| 16 | **packageData shape via /catalog-package** | GET | `/publishing/catalog-package` | shape match | 200 ✓ shape: `{version:{id:null,...}, store, catalog, categories[tree+items], advertising:{rotationMode:"loop",banners:[…]}, packageChecksum:"…"}` — all W4 banners present (2 active) with `{id,imageUrl,sortOrder}` only; categories tree fully nested (Root→Child→GC) with item products + prices+currency | 16-packagedata-shape.txt |
| 17 | catalog-validation (canPublish?) | GET | `/publishing/catalog-validation` | canPublish:true | 200 ✓ canPublish:true, blockingErrors:[], warnings:[], summary={categoryCount:4,activePlacementCount:3,activeBannerCount:2,catalogVersionCount:0} | 17-catalog-validation.txt |
| 18 | NEG banner sortOrder=-1 | POST | `/banners` | 400 | 400 ✓ "sortOrder должен быть неотрицательным целым числом" | 18-neg-banner-sortorder.txt |
| 19 | **🔴 BUG-REG-040 regression: banner imageUrl=`javascript:alert(1)`** | POST | `/banners` | 400 | 400 ✓ "imageUrl должен быть корректным URL с протоколом http(s)" — `image-url.util.ts` http(s)-only validator still in force | 19-neg-banner-javascript-url.txt |

## Findings

- **🔴 ALL FOUR CRITICAL WATCHPOINTS CLEAN:**
  - txt-content with .jpg extension → 400 (magic-byte detection)
  - >2MB upload → 413 nginx (defense-in-depth: edge + Multer + service)
  - path-traversal filename → sanitized (UUID-only storage; path-segments stripped from originalname)
  - BUG-REG-040 javascript:/data:/non-http URL regression → 400 (validator preserved)
- **storedFilename is always `${randomUUID()}.${detected-extension}`** (`files.service.ts:65`) — originalFilename is recorded for display only, never used in storage path. Detected extension comes from magic-byte detection, not from upload header — defeats double-extension attacks (e.g. `.png.jpg` content-type spoofing).
- **packageData shape exactly matches `CatalogPackageData` interface** at `catalog-package.service.ts:91-108`: `{version,store,catalog,categories[items+children tree],advertising{rotationMode:"loop",banners[]}}`. Checksum is SHA-256 of stable-stringified package — verifiable by reproducing.
- **Operator file.uploaded audit is GLOBAL not store-scoped** — `storeId:null` on the audit row, so it doesn't surface via `/api/stores/:id/logs`, only via admin `/api/logs/global`. This is a deliberate design choice: file uploads aren't tenant-scoped (the FileAsset belongs to no store until referenced via banner). Not a bug; worth noting for ops cookbook.
- **nginx 413 is HTML response, not the JSON 400 a frontend would expect.** Backend never sees the request when size exceeds nginx `client_max_body_size`. Acceptable for a hard cap but FE upload UI needs to handle HTML 413 gracefully. (Not in scope to fix.)

## Deviations

- §4.5.5 oversize → returned **nginx 413 HTML**, not backend JSON 400. The backend's Multer `MAX_IMAGE_SIZE_BYTES = 2MB` cap is the same value as nginx's edge cap, so requests at exactly 2MB+ are gated at the edge. Brief said ">2MB reject" — satisfied. Documented as a defense-in-depth observation, not a bug.

## Bugs filed

None.
