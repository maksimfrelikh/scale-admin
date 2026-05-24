# 2.4 Operator cross-store scoping — SUMMARY

Verdict: **PASS** on info-leak gate (the critical 🔴 RED check). One framework-routing footnote on the DELETE probe — not an RBAC defect.

13 probes from operator session: 9 against STORE-WAVE2 (exists, operator NOT assigned) + 4 against a synthetic non-existent UUID (`00000000-…-0999`). The critical comparison is the body+status shape across the "exists, no access" vs "doesn't exist" boundary.

| # | Method | Path | Expected | Got | Body |
|---|---|---|---|---|---|
| 01 | GET | `/api/stores/{W2}` | uniform 403 | **403** | `{"message":"Нет доступа к магазину","error":"Forbidden","statusCode":403}` |
| 02 | GET | `/api/stores/{W2}/details` | uniform 403 | **403** | same as 01 |
| 03 | GET | `/api/stores/{W2}/catalog/categories` | uniform 403 | **403** | same as 01 |
| 04 | GET | `/api/stores/{W2}/prices` | uniform 403 | **403** | same as 01 |
| 05 | GET | `/api/stores/{W2}/advertising/banners` | uniform 403 | **403** | same as 01 |
| 06 | GET | `/api/stores/{W2}/scales` | uniform 403 | **403** | same as 01 |
| 07 | GET | `/api/stores/{W2}/logs` | uniform 403 | **403** | same as 01 |
| 08 | PATCH | `/api/stores/{W2}/advertising/banners/{any}` body `{"sortOrder":99}` | uniform 403 | **403** | same as 01 |
| 09 | DELETE | `/api/stores/{W2}` | n/a (route doesn't exist) | **404** | `{"message":"Cannot DELETE /api/stores/{W2}","error":"Not Found","statusCode":404}` (Express default 404 — pre-Nest) |
| 10 | GET | `/api/stores/{BOGUS}` | uniform 403 (== probes 01-08) | **403** | **byte-identical to probe 01** ← critical |
| 11 | GET | `/api/stores/{BOGUS}/catalog/categories` | uniform 403 | **403** | byte-identical |
| 12 | GET | `/api/stores/{BOGUS}/prices` | uniform 403 | **403** | byte-identical |
| 13 | GET | `/api/stores/{BOGUS}/advertising/banners` | uniform 403 | **403** | byte-identical |

`{W2}` = `f728a42b-49f0-4668-a78b-68cfb711b711` (STORE-WAVE2, created in `_fixture/`).
`{BOGUS}` = `00000000-0000-0000-0000-000000000999`.

## Critical info-leak verdict (the 🔴 RED gate)

**No info leak observed.** The operator gets the same `403 / "Нет доступа к магазину" / Content-Length: 72` for all 12 in-band probes against either WAVE2 (exists) or BOGUS (doesn't exist). The `StoreAccessGuard` (`store-access.guard.ts:35-37`) fires before any route handler, so the operator cannot distinguish exists-vs-no-access from the response shape, status code, body, or message. Byte-comparison across probes 01..08 vs 10..13 confirms identical bodies.

## DELETE 404 footnote (probe 09 — not an RBAC defect)

The DELETE probe returned 404 because **the route doesn't exist on the backend**: `stores.controller.ts` has no `@Delete` decorator (`grep -n '@Delete' backend/src/stores/stores.controller.ts` → 0 hits). Express's catch-all returns "Cannot DELETE …" with the URL echoed. This is identical to what **admin** would get on the same request — confirmed by inspection: there is no admin-specific DELETE handler either; the entire route is undefined.

- **Not an info leak** between operator and admin: admin sees the same 404, since the route doesn't exist for anyone.
- **Not an info leak** between WAVE2 and BOGUS: hitting DELETE on BOGUS would also return the same 404 with `{BOGUS}` echoed.
- **The URL echo** in `"Cannot DELETE /api/stores/{the-uuid}"` is a generic Express default that returns whatever the caller put in the URL — they already know the UUID they sent. No new information disclosed.
- **Defense-in-depth note** (not a Wave 2 finding): BLOCK-01 already documented "framework-default 404 messages ('Cannot GET …') are English" as a side finding (`BLOCK-01-auth.md` §Side findings). Same pattern; same defense-in-depth gap. Already on record.

Decision: the DELETE 404 does not affect the 2.4 verdict because (a) the route truly doesn't exist for any role, (b) no exists-vs-no-access information is leaked through it, (c) the same response shape would be returned to any caller hitting any non-existent verb on any URL.

## Other observations

- Operator's PATCH attempt (probe 08) was guard-rejected as 403, NOT body-validation-rejected as 400. This proves the guard fires before request body parsing — operator can't probe payload validation across store boundary either.
- Russian-localized message used throughout the RBAC-gate responses (`Нет доступа к магазину`). Matches the localization gate from Wave 5 closure.
- Operator's session+CSRF are still valid (we used them); only `StoreAccessGuard` is denying. Confirms session lifecycle isn't a side effect.

## Evidence

`01-w2-get-store.txt` .. `13-bogus-get-advertising.txt` in this directory. All redacted.
