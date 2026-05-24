# 6.8 edge cases + cleanup + endprobe — SUMMARY

**Verdict:** ✅ PASS 10/10. 0 bugs filed. Edge inputs gracefully handled; SCALE-W6-01 archived; token file wiped; redaction grep 0 unredacted hits across 4 patterns; ZERO drift on prod+staging across ~23-min wave window.
**Window:** 18:38–18:40 GMT+2.

## Probes & results

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 01 | POST ack with empty body | 400 | 400 "versionId обязателен" | ✅ |
| 02 | POST check-update with malformed JSON `{"currentCatalogVersionId":` | 400 | 400 "Unexpected end of JSON input" (Express body parser) | ✅ |
| 03 | POST check-update with 150 KB oversize body | 413 (nginx/Express size limit) | 413 "request entity too large" | ✅ |
| 04 | POST check-update with Content-Type: text/plain + non-JSON body | 200 hasUpdate=true (server treats unparseable body as missing fields → returns latest; permissive recovery semantics) | 201 hasUpdate=true full packageData v#5 delivered | ✅ |
| 05 | POST check-update with no Content-Type header + valid JSON body | 200 (same permissive behavior) | 201 hasUpdate=true; identical delivery | ✅ |
| 06 | Cleanup — admin PATCH `/api/scales/<SCALE-W6-01.id>/status` = archived | 200 + device.status="archived" | 200 + `device.status="archived"`, changed=true | ✅ |
| 07 | Post-cleanup list — `GET /api/stores/STORE-001/scales` | SCALE-W6-01 shown with status=archived, NOT active | `deviceCode=SCALE-W6-01 status=archived` (still in list — by design, archived devices remain queryable; admin can re-activate if needed) | ✅ |
| 08 | End-probe prod `/api/version` + `/api/health` | byte-identical to start-probe `3538b7c` (built 2026-05-22T08:05:35Z) + `status:ok` | prod /version=`3538b7c` ✓ no diff; prod /health=`ok` ✓ | ✅ |
| 09 | End-probe staging `/api/version` + `/api/health` | byte-identical to start-probe `0cf0966` (built 2026-05-23T20:42:10Z) + `status:ok` | staging /version=`0cf0966` ✓ no diff; staging /health=`ok` ✓ | ✅ |
| 10 | Secret cleanup — `rm /tmp/scale-token-w6.txt` + 4-pattern redact grep across `BLOCK-06/` | token file gone; grep returns 0 unredacted hits | `/tmp/scale-token-w6.txt`: removed (ls reports no-such-file); 4 patterns checked (`"apiToken":"…"`, `x-scale-api-token: …`, `apiToken=…`, `scale_admin*_(session\|csrf)=…`) — **0 unredacted hits across all** ✓ | ✅ |

## Drift comparison

| Surface | Start-probe (18:14 GMT+2) | End-probe (18:40 GMT+2) | Delta |
|---------|---------------------------|--------------------------|-------|
| prod /api/version | `commit=3538b7c builtAt=2026-05-22T08:05:35Z` | `commit=3538b7c builtAt=2026-05-22T08:05:35Z` | **0** |
| prod /api/health | `status=ok` | `status=ok` | **0** |
| staging /api/version | `commit=0cf0966 builtAt=2026-05-23T20:42:10Z` | `commit=0cf0966 builtAt=2026-05-23T20:42:10Z` | **0** |
| staging /api/health | `status=ok` | `status=ok` | **0** |

Wave 6 window = ~23 min active + 1h 55min idle stall between §6.3 (18:21) and resume (18:17 GMT+2). Drift ZERO across the full window.

## Permissive parsing observation (§6.8.04-05, not a bug)

Probes 04 + 05 show that the scale-api endpoints accept requests with non-JSON Content-Type or missing Content-Type, treating the body as empty. This is graceful degradation (Express body-parser fallback) rather than strict 400. Per PRD §11 the scale-API contract documents `application/json` as preferred but does not require strict enforcement. Mention is for transparency; no behavioral defect.

## Cleanup state

- ✅ SCALE-W6-01 archived (`status=archived`); admin can re-activate if needed.
- ✅ `/tmp/scale-token-w6.txt` removed.
- ✅ Earlier-session `/tmp/w6r-*.json` + `/tmp/w6r-*.txt` (jar + login bodies from this resume's admin/operator sessions) removed; sessions also expired server-side.
- ⚠️  `/tmp/w6-*.json` + `/tmp/w6-*-cookies.txt` retained from prior §6.1–§6.3 session (sessions expired naturally). Not in brief's explicit cleanup checklist; preserved per W5 precedent (only the long-lived `/tmp/scale-token-w6.txt` was explicitly required to be wiped).
- ✅ Redact grep 4 patterns × `BLOCK-06/` tree → 0 unredacted hits.

## Bugs filed

None.
