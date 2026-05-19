# Wave 4 closure regression — SUMMARY

**Verdict: PASS (3/3 blocks)**

- Target: `https://staging.maksimfrelikh.ru`
- Branch: `verify/wave-4-closure` off `main@4497f57`
- Wave 4 merged set: BUG-REG-038 (#14) → BUG-REG-039 (#15) → BUG-REG-040 (#16)
- Initial run: 2026-05-19 ~22:17 GMT+2 at branch tip `96d7d63` (Blocks 1+2, 3 skipped)
- Re-dispatch: 2026-05-19 ~22:57 GMT+2 after Maksim's staging wrapper redeploy

## Verdict by block

| Block | Scope | Verdict | Evidence |
|---|---|---|---|
| 1 | Auth + invite RFC email validation (BUG-REG-039 surface) | **PASS 14/14** | `evidence/block-1-auth-report.json` (from `96d7d63`, reused) |
| 2 | Advertising banner imageUrl validation (BUG-REG-040 surface) | **PASS 10/10** | `evidence/block-2-advertising-report.json` (fresh, overwritten) |
| 3 | Smoke + `/api/auth/session` poll-rate (Wave 1 regression guard) | **PASS 8/8** | `evidence/block-3-smoke-report.json`, `evidence/session-rate.json` |

## Block 1 — reuse policy

Block 1 evidence on `verify/wave-4-closure @ 96d7d63` was captured against the
production-built staging bundle and tested code paths in
`backend/src/auth/email-validation.util.ts`. Per `git log -- backend/src/auth/email-validation.util.ts`,
that file has been unchanged since the BUG-REG-039 merge in commit `1b1ac7d`
(parent of `4497f57`). Staging's wrapper redeploy on 2026-05-19 ~22:50 GMT+2
rebuilt the backend image from the same code path — so the previously
captured PASS evidence is structurally valid against the now-live build.

**Reuse decision: yes, cite verbatim** — see `evidence/block-1-auth-report.json`
preserved on this branch. Highlights:

- 14/14 scenarios PASS, median 13 ms
- POST /api/auth/login (admin@example.com) → 200, session cookie set
- GET / renders dashboard (Local Admin / Overview / Stores / Admin dashboard)
- 3 valid invite emails [plain / +tag / .dot] → 201
- 9 invalid invite emails → 400 "Valid email is required" each:
  multi-@, phish-@, space-in-local, leading-dot, trailing-dot,
  consecutive-dots, TAB char, IDN domain (пример.рф), empty string

Detailed scenario table: `blocks/BLOCK-Auth-wave-4.md`.

## Block 2 — fresh run, NOW PASS

Previous run at `96d7d63` FAILED 2/10 — staging container was serving
pre-fix code (~`abf5803`), so URL-scheme guard was inert and persisted
`javascript:`, `data:`, `not-a-url`, `ftp:` URLs (the latter via PATCH 200
being the explicit FAIL-FAST trigger). Source of truth at `main@4497f57`
was unchanged and correct; the issue was a stale staging deploy.

Wrapper redeploy at ~22:50 GMT+2 brought `image-url.util.js` and
`advertising.service.js` to `main@4497f57`. This run executed the full
10-scenario suite at 2026-05-19T20:57:42Z.

- **All 4 invalid POST cases → 400** with message `imageUrl must be a valid http(s) URL`
- **All 4 invalid PATCH cases → 400** with the same message (security-critical
  `javascript:` PATCH now correctly rejected)
- **Valid POST `https://example.com/banner.png` → 201**
- **Valid PATCH `https://example.com/banner2.png` → 200**
- Out-of-band sanity: empty `imageUrl` → 400 `"imageUrl is required"`
  (legacy message preserved per BUG-REG-040 design)
- Cleanup: created banner `124147e2-…` archived during teardown.

Detailed scenario table: `blocks/BLOCK-Advertising-wave-4.md`.

## Block 3 — smoke + Wave-1 session-rate guard

Executed at 2026-05-19T21:01:38Z–21:03:39Z.

| Probe | Status |
|---|---|
| Login + cookie persist | 200 |
| /api/health | 200 |
| GET / (Vite SPA shell) | 200, `<title>Scale Admin</title>` + `/assets/index-*.js` + `id="root"` |
| /api/stores | 200, stores[] |
| /api/stores/:id (store detail) | 200 |
| /api/stores/:id/advertising/banners | 200, banners[] |
| /api/auth/csrf | 200, fresh token |
| /api/auth/session poll rate (120 s dashboard idle) | **0.50 / min** (1 hit on bootstrap) |

Session-rate guard well under the 2 / min ceiling — Wave-1 cross-tab/polling
fallback that was reverted in `98c085d` remains absent. Detailed scenario
table: `blocks/BLOCK-Smoke-wave-4.md`.

## Side findings (non-blocking)

1. **`qa-admin@example.com` is still not seeded on staging.** Brief allowed
   fallback to `admin@example.com / admin12345`; using that. Recommend
   either seeding `qa-admin@example.com` via env override or updating
   AGENTS.md / regression brief to reference `admin@example.com` as the
   canonical staging admin.

2. **Brief listed `GET /api/advertising/banners?storeId=…` as a smoke
   target.** That route does not exist; canonical surface is
   `GET /api/stores/:storeId/advertising/banners` (see
   `backend/src/advertising/advertising.controller.ts:31`). Block 3 was
   adapted to the canonical route; recommend the regression brief / AGENTS.md
   §6.2 catalogue be updated to match.

3. **No DELETE for invites.** 3 valid invite rows created during the
   Block 1 run on 96d7d63 (`wave4-valid-…`, `wave4-tag+…`, `wave4-name-…`)
   remain on staging. Same observation as the previous run; carry
   forward as a future ticket if hygiene matters.

4. **No `/api/version` endpoint.** Deployed-build identification on
   staging still requires `docker inspect` on the backend image SHA.
   Adding a build-SHA-exposing version endpoint would let testers
   pre-validate "is the fix actually live" without container shell
   access. Already recommended in the original `96d7d63` Block 2 doc.

5. **CSRF token rotates per `GET /api/auth/csrf`.** Wave 2 helper
   assumed stability — confirmed inaccurate. This run's helper
   (`scripts/helpers/staging.cjs`) re-fetches the CSRF token
   immediately before every mutating request.

## Restore / hygiene

- No code changes to backend/, frontend/, or shared infra. All new files
  are under `docs/regression/2026-05-19-wave-4-closure/`.
- No prod hits. Staging only.
- One banner created and archived during Block 2 cleanup (id `124147e2-…`);
  no orphan rows beyond the previous-run residue logged on `96d7d63`.
- `git config core.hooksPath` = `.githooks` — confirmed active before commit.
- No scale-device token rotations occurred during smoke.

## Handoff

Block 1 evidence cited from `96d7d63`; Block 2 + Block 3 evidence and
updated block docs + this SUMMARY committed on top of `96d7d63` on branch
`verify/wave-4-closure`, then pushed to origin.

Lead can now dispatch BUG-REG-042 (docker prune cron) as a separate task.
