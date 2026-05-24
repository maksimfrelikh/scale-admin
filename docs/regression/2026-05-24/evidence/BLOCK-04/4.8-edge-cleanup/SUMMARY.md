# §4.8 Edge cases + cleanup

**Verdict:** ✅ PASS 12/12
**Probes:** 5 edge-case assertions + 7 cleanup operations

## Probe ledger

| # | Probe | Method | Path | Expected | Actual | File |
|---|-------|--------|------|----------|--------|------|
| 1 | Unicode/Russian name | POST | `/categories` `{name:"Овощи и фрукты — категория тест",shortName:"Овощи"}` | 201 round-trip preserved | 201 ✓ name+shortName preserved byte-for-byte | 01-unicode-russian.txt |
| 2 | Emoji + mixed-script name | POST | `/categories` `{name:"🥑 Avocados/Авокадо 🍌",shortName:"🥑Авок"}` | 201 4-byte emoji handled | 201 ✓ — UTF-8 emoji surrogates accepted | 02-emoji-mixed.txt |
| 3 | read-back tree (verify unicode) | GET | `/categories` | exact same strings | ✓ both names returned exactly as written | 03-readback.txt |
| 4 | NEG name > 255 chars | POST | `/categories` | 400 | 400 ✓ "Название категории обязательно и должно быть не длиннее 255 символов" | 04-neg-name-too-long.txt |
| 5a | concurrent PATCH single jar | PATCH | `/placements/:id` × 2 parallel | tokens raced | OP A=403, B=200 — same-jar CSRF rotation race (no data loss, just shared-cookie collision); test setup limitation, retried with 2 jars | 05-concurrent-edit.txt |
| 5b | concurrent PATCH 2 sessions (admin + operator) | PATCH | `/placements/:id` × 2 parallel | both 200 LWW | OP 200 wrote `sortOrder:111` at `13:10:54.361Z`; ADMIN 200 wrote `sortOrder:222` at `13:10:54.391Z` (30ms later); **final state sortOrder=222 → last-write-wins**, no optimistic-lock conflict, no data corruption | 05b-concurrent-2sessions.txt |
| 6 | CLEANUP cascade-archive Wave4-Root | PATCH | `/categories/:id` | cascade summary | 200 ✓ correlationId=`505b3654-…`, categories:[Child,GC], placements:[Milk,Bananas,Apples] | 06-cleanup-root-cascade.txt |
| 7 | CLEANUP archive Unicode category | PATCH | `/categories/:id` | 200 | 200 ✓ | 07-cleanup-unicode.txt |
| 8 | CLEANUP archive Emoji category | PATCH | `/categories/:id` | 200 | 200 ✓ | 08-cleanup-emoji.txt |
| 9 | CLEANUP archive banner 1 (jpg) | PATCH | `/banners/:id/status` | 200 | 200 ✓ | 09-cleanup-banner1.txt |
| 10 | CLEANUP archive banner 2 (png) | PATCH | `/banners/:id/status` | 200 | 200 ✓ | 10-cleanup-banner2.txt |
| 11 | VERIFY full tree archived | GET | `/categories` | all W4 archived | ✓ Root, Child, GC, Root2, Unicode, Emoji ALL status=archived; canAcceptActivePlacements=false everywhere | 11-verify-clean-tree.txt |
| 12 | VERIFY no active placements | GET | `/placements?status=active` | placements:[] | ✓ empty | 12-verify-no-active-placements.txt |
| 13 | VERIFY no active banners | GET | `/banners?status=active` | data:[] | ✓ empty | 13-verify-banners-archived.txt |

## Cleanup state after §4.8 (final)

| Entity type | Count after cleanup | Notes |
|---|---|---|
| W4 active categories | 0 | Root+Root2+Child+GC+Unicode+Emoji all archived |
| W4 active placements | 0 | Apples+Bananas+Milk all cascade-archived with Root |
| W4 active banners | 0 | B1+B2 archived via /status endpoint |
| W4 StoreProductPrice rows | 3 (orphaned, status=active) | No archive endpoint exists; rows are functionally inert because /prices filters by active placements (all archived). Acceptable. Same pattern as W3. |
| W4 FileAsset rows | 8 (rate-limit run uploaded ~8) | No DELETE endpoint; storage is by-design retained. Same as W3 pattern. |

## Findings

- **Unicode/Russian/emoji** in `name` and `shortName` works end-to-end (UTF-8 column + JSON round-trip). 4-byte emoji code points handled correctly (Postgres UTF8 columns).
- **Concurrent edit semantics: last-write-wins (LWW)**, no optimistic locking. Both writers got 200; final state = later-writer's value. This is acceptable for catalog placement reorders (no money/inventory implications); concurrent edits to *prices* would be a separate question, but §4.4 only writes to `StoreProductPrice` which uses Prisma `update`/`create` with primary-key targeting — no LWW conflict surface there (each productId has one row).
- `cascade-archive` on Wave4-Root archived 2 categories + 3 placements + emitted correlationId (`505b3654-…`). Same pattern as §4.3.14.
- §4.8.5a (shared-jar concurrent) showed CSRF token rotation per `GET /api/auth/csrf` — when 2 simultaneous `fresh_csrf` calls hit the same cookie jar, the second invalidates the first. **Documented for future Tester scripts: use separate jars for parallel writers, or pre-fetch a single token and reuse for one round.**

## Deviations

- Concurrent edit test (5a) hit a shared-cookie CSRF race that produced 403/200 instead of 200/200. Retried as 5b with separate sessions → both 200 LWW. The 5a result is a test-harness artifact, not a server bug.
- Prices and FileAssets are not archived in cleanup — they have no archive endpoint and are functionally inert.

## Bugs filed

None.
