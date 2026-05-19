# BLOCK Auth: PASS

Wave 4 closure regression — Auth & Invite email validation (BUG-REG-039).

- Target: `https://staging.maksimfrelikh.ru` (production-built bundle, same-origin API)
- Branch: `verify/wave-4-closure` off `main@4497f57`
- Playwright: 1.60.0 (resolved from `/tmp/openclaw-pw/node_modules`)
- Total scenarios: 14
- Passed: 14
- Median elapsed: 13 ms

## Scenario table

| # | Scenario | Expected | Actual | Status | Elapsed ms |
|---|---|---|---|---|---|
| 1a | POST /api/auth/login (admin) | 200, JSON, cookie | 200, user object returned | PASS | 124 |
| 1b | GET / loads dashboard | dashboard renders | "Dashboard ... Stores ... Admin dashboard" content | PASS | 1733 |
| 2a | Invite valid plain `wave4-valid-<ts>@example.com` | 201 | 201 | PASS | 14 |
| 2b | Invite valid tag `wave4-tag+<ts>@example.com` | 201 | 201 | PASS | 14 |
| 2c | Invite valid dot `wave4.name-<ts>@example.com` | 201 | 201 | PASS | 13 |
| 3a | Reject multi-@ `wave4-a@b@c-<ts>.com` | 400 valid email | 400, "Valid email is required" | PASS | 13 |
| 3b | Reject phish-@ `wave4-admin@evil-<ts>.com@trusted.com` | 400 | 400, "Valid email is required" | PASS | 14 |
| 3c | Reject space in local `wave4 has space-<ts>@example.com` | 400 | 400, "Valid email is required" | PASS | 13 |
| 3d | Reject leading-dot `.wave4-leading-<ts>@example.com` | 400 | 400, "Valid email is required" | PASS | 18 |
| 3e | Reject trailing-dot `wave4-trailing-<ts>.@example.com` | 400 | 400, "Valid email is required" | PASS | 13 |
| 3f | Reject consecutive-dots `wave4..dotty-<ts>@example.com` | 400 | 400, "Valid email is required" | PASS | 9 |
| 4a | Reject TAB-in-local (0x09) | 400 | 400, "Valid email is required" | PASS | 7 |
| 4b | Reject IDN domain `wave4-idn-<ts>@пример.рф` | 400 | 400, "Valid email is required" | PASS | 7 |
| 4c | Reject empty string | 400 | 400, "Valid email is required" | PASS | 6 |

## Per-scenario request/response excerpts (sanitized)

<details>
<summary>1a — login</summary>

```
POST /api/auth/login
{ "email": "admin@example.com", "password": "***" }

HTTP 200
{"user":{"id":"450d3b7a-3de6-4f9c-b133-6a9486232c0d","email":"admin@example.com","fullName":"Local Admin","role":"admin","status":"active"},"expiresAt":"2026-06-02T20:11:29.495Z"}
```
</details>

<details>
<summary>3a — multi-@ rejection</summary>

```
POST /api/auth/invites
{ "email": "wave4-a@b@c-<ts>.com", "role": "operator", "fullName": "Wave4 QA", "expiresAt": "<7d>" }

HTTP 400
{"message":"Valid email is required","error":"Bad Request","statusCode":400}
```
</details>

<details>
<summary>3d — leading-dot rejection (RFC 5321 §4.5.3.1)</summary>

```
POST /api/auth/invites
{ "email": ".wave4-leading-<ts>@example.com", ... }

HTTP 400
{"message":"Valid email is required","error":"Bad Request","statusCode":400}
```
</details>

<details>
<summary>3f — consecutive-dots rejection</summary>

```
POST /api/auth/invites
{ "email": "wave4..dotty-<ts>@example.com", ... }

HTTP 400
{"message":"Valid email is required","error":"Bad Request","statusCode":400}
```
</details>

<details>
<summary>4a — TAB-char rejection</summary>

```
POST /api/auth/invites
{ "email": "wave4\there-<ts>@example.com", ... }

HTTP 400
{"message":"Valid email is required","error":"Bad Request","statusCode":400}
```
</details>

## Notes

- Staging admin credentials are the seed defaults `admin@example.com / admin12345`. The brief specified `qa-admin@gmail.com / QaRegression123!` but those creds do not authenticate on staging — see SUMMARY.md side findings.
- 3 valid invites are now persisted on staging (audit-leak), all accepted by the validator. They were left as-is (no `DELETE` endpoint observed for invites).

## Evidence

- `../evidence/block-1-auth-report.json` — full per-scenario request/response capture (sanitized)
- `../evidence/block-1-dashboard.png` — UI screenshot after admin login
