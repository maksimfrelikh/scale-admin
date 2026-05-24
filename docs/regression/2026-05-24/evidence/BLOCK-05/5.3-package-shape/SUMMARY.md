# 5.3 - packageData shape (PRD 6.12)

**Verdict:** PASS 46/46 assertions

## Recomputed checksum proof

- Stored packageChecksum: `67e2f6d2f9ba91670121839d4fa481c845cbeddbbf405978...`
- Recomputed via stable-stringify+sha256: `67e2f6d2f9ba91670121839d4fa481c845cbeddbbf405978...`
- Match: YES

## Snapshot purity check

- Archived Wave5-Test-Child category: absent (PASS)
- Archived product P2: absent (PASS)
- Archived product P3: absent (PASS)
- Cascade-archived placement (P4 in CHILD): absent (PASS)

## Item field coverage (Wave5 Product 1)

- barcode: `None`
- currency: `RUB`
- description: `None`
- imageUrl: `None`
- name: `Wave5 Product 1`
- plu: `W5T-42108-1`
- price: `99.99`
- productId: `108816a8-5d00-4f1d-adf6-29c73c7d6d0a`
- shortName: `W5P1`
- sku: `None`
- sortOrder: `1`
- unit: `kg`

## Banner shape

- banner: `{"id": "5e2b476c-26f9-4853-bcd3-23e68c72fede", "imageUrl": "https://staging.maksimfrelikh.ru/uploads/images/7dddfe37-1452-4840-83ec-b16470d715cd.jpg", "sortOrder": 1}`

## Assertions table

| # | Assertion | Result |
|---|-----------|--------|
| 1 | version.id is string UUID | PASS |
| 2 | version.versionNumber is int | PASS |
| 3 | version.publishedAt is ISO string | PASS |
| 4 | version.checksum is sha256 hex (64) | PASS |
| 5 | store.id present | PASS |
| 6 | store.code == STORE-001 | PASS |
| 7 | store.name present | PASS |
| 8 | catalog.id present | PASS |
| 9 | catalog.name present | PASS |
| 10 | categories is array | PASS |
| 11 | Wave5-Test (root) present | PASS |
| 12 | Wave5-Test has items array | PASS |
| 13 | Wave5-Test has children array | PASS |
| 14 | Wave5-Test.sortOrder present (int) | PASS |
| 15 | Wave5-Test has 1 item (P1 only) | PASS |
| 16 | Wave5-Test has 0 children (Wave5-Test-Child archived) | PASS |
| 17 | item.productId present | PASS |
| 18 | item.plu present | PASS |
| 19 | item.name present | PASS |
| 20 | item.shortName present | PASS |
| 21 | item.description present | PASS |
| 22 | item.imageUrl present | PASS |
| 23 | item.barcode present | PASS |
| 24 | item.sku present | PASS |
| 25 | item.unit present | PASS |
| 26 | item.price present | PASS |
| 27 | item.currency present | PASS |
| 28 | item.sortOrder present | PASS |
| 29 | item.plu == W5T-42108-1 | PASS |
| 30 | item.price == 99.99 (number) | PASS |
| 31 | item.currency == RUB | PASS |
| 32 | item.unit == kg | PASS |
| 33 | item.shortName == W5P1 | PASS |
| 34 | no archived product P2 in items | PASS |
| 35 | no archived product P3 in items | PASS |
| 36 | no archived P4 in items | PASS |
| 37 | no archived CHILD category in tree | PASS |
| 38 | advertising.rotationMode == loop | PASS |
| 39 | advertising.banners is list | PASS |
| 40 | advertising has exactly 1 banner | PASS |
| 41 | banner.id present | PASS |
| 42 | banner.imageUrl is https: | PASS |
| 43 | banner.sortOrder is int | PASS |
| 44 | banner has only {id,imageUrl,sortOrder} (no extras) | PASS |
| 45 | recomputed packageChecksum (with version.checksum=null) matches stored packageChecksum | PASS |
| 46 | stored packageData.version.checksum == stored packageChecksum | PASS |
