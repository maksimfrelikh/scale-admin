# 2.5 Admin global — SUMMARY

Verdict: **PASS**.

13 probes from admin session. All 11 in-scope reads return 200; both bogus-UUID probes return distinguishable 404s (intended asymmetry — admin can/should know exists vs no-exists; this is the dual to 2.4's operator-side info-hiding).

| # | Path | Status | Notes |
|---|---|---|---|
| 01 | GET `/api/users` | **200** | admin-only — confirms RBAC pass for admin role |
| 02 | GET `/api/stores` | **200** | returns BOTH STORE-001 and STORE-WAVE2 (admin sees global list) |
| 03 | GET `/api/stores/{W2}` | **200** | admin has access to all stores |
| 04 | GET `/api/stores/{W2}/details` | **200** | aggregate counts |
| 05 | GET `/api/logs/global` | **200** | admin-only succeeds for admin |
| 06 | GET `/api/stores/{S001}/catalog/categories` | **200** | |
| 07 | GET `/api/stores/{W2}/catalog/categories` | **200** | admin can read freshly-created store's catalog |
| 08 | GET `/api/stores/{W2}/prices` | **200** | |
| 09 | GET `/api/stores/{W2}/advertising/banners` | **200** | |
| 10 | GET `/api/stores/{W2}/scales` | **200** | |
| 11 | GET `/api/stores/{W2}/logs` | **200** | |
| 12 | GET `/api/stores/{BOGUS}` | **404** | `{"message":"Магазин не найден","error":"Not Found","statusCode":404}` |
| 13 | GET `/api/stores/{BOGUS}/catalog/categories` | **404** | `{"message":"Активный каталог магазина не найден","error":"Not Found","statusCode":404}` |

## Cross-cutting comparison (2.4 vs 2.5 — confirms info-hiding is operator-side only)

- **Operator hitting BOGUS** (probe 2.4-10..13): all 4 returned 403 `Нет доступа к магазину` — uniform with WAVE2 probes.
- **Admin hitting BOGUS** (probes 12, 13): returns 404 `Магазин не найден` and 404 `Активный каталог магазина не найден` — distinguishable from any 200 admin probe.

Admin gets the existence signal; operator does not. This is the intended dual-axis design — operators can't enumerate, admins can manage. ✓

## Evidence

`01-get-users.txt` .. `13-get-bogus-catalog.txt` in this directory. All redacted.
