# BUG-REG-069 — POST advertising banner with non-existent imageFileAssetId returns 500

**Severity:** medium (UX/error-handling — not security, not data-integrity)
**Status:** open
**Discovered:** 2026-05-24, Wave 5 §5.1.h (REGRESSION-2026-05-24)
**Env:** staging (commit `0cf0966`), also expected on prod commit `3538b7c` (same code path)
**Reporter:** Lead (single-inline)

## Summary

`POST /api/stores/:storeId/advertising/banners` with a syntactically-valid UUID `imageFileAssetId` that does not exist in the `FileAsset` table returns HTTP 500 with generic `Internal server error` payload. Should be 400 (validation) or 404 (FK target not found) with a structured error code.

## Repro

```bash
JAR_OP=...  # operator session for STORE-001
CSRF=$(curl -sS -b $JAR_OP -c $JAR_OP "$BASE/api/auth/csrf" | jq -r .csrfToken)
curl -sS -b $JAR_OP -X POST \
  -H "Content-Type: application/json" -H "x-csrf-token: $CSRF" \
  -d '{"imageUrl":"https://staging.maksimfrelikh.ru/uploads/images/bogus.jpg","imageFileAssetId":"00000000-0000-0000-0000-000000000000"}' \
  "$BASE/api/stores/$STORE/advertising/banners"
```

**Observed:**

```json
HTTP/1.1 500 Internal Server Error
{"statusCode":500,"message":"Internal server error"}
```

**Expected:**

```json
HTTP/1.1 400 Bad Request   (or 404)
{"message":"imageFileAssetId не найден","code":"FILE_ASSET_NOT_FOUND","statusCode":400}
```

## Code path

`backend/src/advertising/advertising.service.ts:86-110`
- `createBanner` constructs `Prisma.AdvertisingBannerUncheckedCreateInput` and writes directly.
- No `prisma.fileAsset.findUnique({where:{id}})` precheck for `imageFileAssetId`.
- Prisma raises `P2003 Foreign key constraint failed` (advertising_banners_imageFileAssetId_fkey).
- NestJS default exception filter maps unhandled error → 500.

## Why medium

- Data integrity intact (DB FK rejects the write — no orphan row created).
- Not exploitable for IDOR / enum (need authenticated operator with store access; cannot leak which FileAssetIds exist because both existing-but-unauthorized and non-existent produce the same 500).
- UX-only: API consumers cannot distinguish a server fault from a bad input, breaking client error-handling contracts. Operator UI would show a generic "Server error" instead of "this image no longer exists."

## Suggested fix

Add a precheck in `createBanner` (and `updateBanner` at parity):

```typescript
if (data.imageFileAssetId) {
  const exists = await this.prisma.fileAsset.findUnique({
    where: { id: data.imageFileAssetId },
    select: { id: true },
  });
  if (!exists) {
    throw new BadRequestException({
      code: 'FILE_ASSET_NOT_FOUND',
      message: 'imageFileAssetId ссылается на отсутствующий файл',
    });
  }
}
```

Same pattern recommended for `updateBanner` (`advertising.service.ts:115+`).

## Evidence

`docs/regression/2026-05-24/evidence/BLOCK-05/5.1-validation/5.1h-bad-banner.txt` lines for "POST banner with bogus FileAssetId".

## Out of scope (not bugs)

- `javascript:` / `data:` URL → already 400 (BUG-REG-040 fix, working as designed).
- Empty `imageUrl` → 400 "imageUrl обязателен" (working).
- `imageUrl` of unreachable HTTP URL (no actual image at the URL) → server does not validate URL liveness; not a regression, would require a separate decision.
