# BLOCK 1 — Login / session / RBAC + Cross-tab MODE_A

**Verdict:** PASS
**Time:** ~3 min (incl. 65 s rate-limit cooldown for MODE_A)
**Script:** `scripts/block-01-login-rbac.cjs`
**Report JSON:** `evidence/block-01-report.json`
**Stack:** local docker, frontend production-built bundle at :5173, backend :3000, CORS=localhost:5173

## Scenarios

| ID | Scenario | Expected | Actual | Verdict | Evidence |
|---|---|---|---|---|---|
| 1.1 | Login form renders (email/password/submit) | 1/1/1 inputs | 1/1/1 | ✅ | `block-01-1-1-login-form.png` |
| 1.2 | POST /api/auth/login w/o CSRF token | 403 `CSRF_TOKEN_INVALID` | 403 `CSRF_TOKEN_INVALID` | ✅ | report.scenarios.1.2 |
| 1.3 | Login with invalid password (random non-existent email) | 401 `Invalid email or password` | 401 `Invalid email or password` | ✅ | report.scenarios.1.3 |
| 1.4 | qa-admin UI login + session cookie | 200 + cookie `scale_admin_session` (HttpOnly, Secure, SameSite=Lax) | 200 + cookie attrs match | ✅ | `block-01-1-4-admin-after-login.png` |
| 1.5 | Admin GET /api/users | 200 + array of users | 200 + 26 users | ✅ | report.scenarios.1.5 |
| 1.6 | GET /api/auth/session as admin | 200 + email=qa-admin@gmail.com, role=admin | match | ✅ | report.scenarios.1.6 |
| 1.7 | POST /api/auth/logout invalidates session | 200 + next /session → 401 | 200 + 401 | ✅ | report.scenarios.1.7 |
| 1.8 | qa-operator UI login | 200 + dashboard | 200 + `Добро пожаловать, QA Operator` | ✅ | `block-01-1-8-operator-after-login.png` |
| 1.9 | Operator GET /api/users (admin-only) | 403 | 403 | ✅ | report.scenarios.1.9 |
| 1.10 | GET /api/auth/session as operator | 200 + role=operator | match | ✅ | report.scenarios.1.10 |
| 1.12 | MODE_A cross-tab logout: tabA logout → tabB within 30s | EXPECTED-OFF post-revert (`98c085d`); `/auth/session` call rate < 2/min | tabB NOT propagated (correct per moratorium); 0 session polls during 30s window | ✅ | `block-01-1-12-tabB-30s-post-logout.png` |
| 1.13 | Unauthenticated /stores → redirect | redirected to /login | redirected to /login | ✅ | report.scenarios.1.13 |

## Critical signal — infinite session-loop check (BUG-REG-014/017 regression guard)

- **Session call rate during 30 s post-logout window:** **0 calls/min**
- **Wave 1 incident signature:** ≥4 calls/min sustained `/api/auth/session` polling
- **Verdict:** NO regression. Revert (`98c085d`) is clean.

## Cross-tab moratorium notes

- MODE_A cross-tab logout propagation is **expected NOT to fire** on `main` after Wave 1 revert.
- MODE_B (independent contexts) not tested in this block (per plan: BroadcastChannel doesn't cross — out of scope).
- BUG-REG-037 (cross-tab moratorium) covers the future re-fix work.

## Issues / Notes

- **Rate-limit interaction observed:** login bucket is `(IP, email)`, 5 attempts/60 s. The initial dry-run accidentally hit the limit because Block 1 re-used qa-admin for 5+ logins. Restructured to share one context per role per identity. **No bug** — rate-limit is working as intended.
- All session-cookie attributes match production hardening: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.

## Stack state at end of block
Local docker, CORS=localhost. QA accounts intact.

## New BUG-REG opened
None.
