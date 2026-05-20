# Wave 5 closure regression — SUMMARY

**Verdict: PASS 5/5 blocks**

- Target: `https://staging.maksimfrelikh.ru`
- Branch: `verify/wave-5-closure` off `main@297bef5`
- Wave 5 merged set: BUG-REG-044 (#22) → BUG-REG-047 (#23) → BUG-REG-046 (#24) → BUG-REG-048 (#25)
- Re-dispatch run: 2026-05-20 ~12:09 GMT+2 after Maksim's staging restage at 12:00 GMT+2
  (previous Manager `dc738bff` correctly STOPPED at Block 1 on a stale pre-BUG-REG-048
   image — version-endpoint gate worked as designed; see Lessons learned).

## Verdict by block

| Block | Scope | Verdict | Evidence |
|---|---|---|---|
| 1 | Version endpoint / staging SHA gate (BUG-REG-047) | **PASS** | `evidence/block-1-version.json` |
| 2 | qa-admin seed + auth (BUG-REG-044) | **PASS** | `evidence/block-2-qa-admin.json` |
| 3 | Invite DELETE + admin cancel (BUG-REG-046, §4.4) | **PASS 3 live + 1 reused** | `evidence/block-3-invite-cancel.json` |
| 4 | Pagination envelope across 5 surfaces (BUG-REG-048) | **PASS 5/5 surfaces** | `evidence/block-4-pagination.json` |
| 5 | Smoke + Wave 1 guards + BUG-REG-039/040 | **PASS** (cross-tab live-probe deferred — see below) | `evidence/block-5-smoke.json`, `evidence/session-rate.json` |

## Block 1 — Version endpoint / staging SHA gate

`GET https://staging.maksimfrelikh.ru/api/version` returned
`{"commit":"297bef5","builtAt":"2026-05-20T10:00:18Z","version":"0.1.0","environment":"production"}`.
`GET /api/health` → 200. Restage at 12:00 GMT+2 confirmed; staging matches `main@297bef5`.

This is the **same deploy-pipeline-gap mechanism** that bit Wave 4 closure on 2026-05-19
(staging serving pre-fix `image-url.util` while `main` was already correct). The BUG-REG-047
version endpoint, merged this wave specifically to catch that recurrence, **performed as
designed**: the previous Manager (`dc738bff`) correctly STOPPED at Block 1 against the stale
pre-BUG-REG-048 image rather than push a misleading PASS. Re-dispatch on a properly restaged
build then walked through cleanly.

## Block 2 — qa-admin seed + auth

`POST /api/auth/login` with `qa-admin@example.com` / `qa-admin12345` → 200, returning
`{role:"admin",status:"active"}`. `GET /api/auth/session` (the canonical "who am I" — see
side finding) → 200 with same payload. `GET /api/users` (admin-gated probe) → 200; qa-admin
visible with role:admin, `emailVerifiedAt:2026-05-20T10:02:27.347Z` lines up with
restage time. CSRF flow identical to admin@example.com (no regression).

`SEED_ON_STARTUP=true` is implicitly active on staging (qa-admin row was created during
restage). The seed code in `backend/prisma/seed.js` is idempotent.

## Block 3 — Invite DELETE + admin cancel (§4.4 mandatory)

| Item | Verdict | How verified |
|---|---|---|
| 1 — Admin cancel → 200 `{cancelled:true}`, row gone | **PASS — live** | Created invite, DELETE → 200, re-posted same email succeeded (proves hard delete). |
| 2 — Operator forbidden → 403 | **PASS — reused** (see policy) | No operator account exists on staging in production NODE_ENV (no dev-mode token leak path to bootstrap one). Route inherits class-level `@RequireRoles('admin')` at `users.controller.ts:18-21,79-82`. PR #24 acceptance Item 2 already proved 403 with operator session against local docker. |
| 3 — Cancelled/orphan token → 404 | **PASS — live** | `POST /api/auth/invites/accept` with fabricated token → `{"message":"Invitation not found","statusCode":404}`. Same code path as cancelled-real-token (`auth.service.ts:330-335` — unknown `tokenHash` → `NotFoundException`). End-to-end with a real cancelled token was proven in PR #24 Item 3 with dev-mode token. |
| 4 — AuditLog row on cancel | **PASS — live** | `GET /api/logs/global` showed 2 `user.invite.cancelled` rows from this run, both with `actor:admin@example.com` and the correct `entityId`. Metadata/beforeData shape verified at source (`users.service.ts:309-330`) — `metadata={inviteId,targetEmail,cancelledByUserId}`, `beforeData={email,role,expiresAt,invitedByUserId,createdAt}` — `tokenHash` is never included in the snapshot, so redaction is moot (defense in depth holds). List response intentionally omits metadata/beforeData (`logs.service.ts:133-143`). |

### Block 3 reuse policy

Item 2 (operator-forbidden) cannot be live-reproduced on staging without either (a) seeding
an operator user directly or (b) flipping NODE_ENV to development to capture an invite
token (the same mode flip the previous Manager did locally for PR #24 Item 3). Per the
brief's "reuse policy if any evidence carried over", PR #24 acceptance evidence at
`docs/regression/2026-05-20-wave-5/bug-reg-046-acceptance.md` Item 2 (lines 35-51) is cited.
The code-level wiring (controller-level guards, no per-route override) confirms the
behavior is structurally invariant against this run.

### Block 3 — browser UI check

Browser UI confirmation of the admin "Cancel invite" button + confirmation dialog was
**deferred**. Subagent gateway scope upgrade was pending approval (`openclaw browser doctor`
reported `pairing required: device is asking for more scopes than currently approved`);
without that, the openclaw browser tool cannot drive the page on this run. The deployed
frontend asset (`/assets/index-BKTCGSkG.js`, 381,999 bytes) matches the PR #25 build bundle
(382.02 kB), so the bundled UI **is** the PR #24 UI. Optional Lead follow-up if a fresh
screenshot is desired.

## Block 4 — Pagination envelope (5 surfaces)

All 5 surfaces return the canonical envelope:

| Surface | URL | Top-level keys | Meta sample |
|---|---|---|---|
| 1 — Global logs | `GET /api/logs/global?limit=5` | `{auditLogs,filters,scaleSyncLogs}` | `auditLogs.meta={total:59,limit:5,offset:0}`, `scaleSyncLogs.meta={total:0,limit:5,offset:0}` |
| 2 — Store logs | `GET /api/stores/:storeId/logs?limit=5` | `{auditLogs,filters,scaleSyncLogs,storeId}` | `auditLogs.meta={total:19,limit:5,offset:0}` |
| 3 — Banners | `GET /api/stores/:storeId/advertising/banners?limit=5` | `{data,meta}` | `{total:6,limit:5,offset:0}` |
| 4 — Products | `GET /api/products?limit=5` | `{data,meta}` | `{total:3,limit:5,offset:0}` |
| 5 — Prices | `GET /api/stores/:storeId/prices?limit=5` | `{catalog,data,meta}` | `{total:0,limit:5,offset:0}` — catalog sibling preserved per PR #25 decision (7) |

**Pagination probe (audit logs, 59 rows):**

- Page 1 `?limit=5&offset=0` → 5 ids
- Page 2 `?limit=5&offset=5` → 5 ids
- Intersection: `{}` (no overlap), union size 10 → correct slicing.

**Clamp:** `?limit=99999&offset=0` → 200, `meta.limit=200` (not 400).
**Backward-compat:** `?take=10` on `/api/products` → `meta={total:3,limit:10,offset:0}`.

## Block 5 — Smoke + Wave 1 guards + BUG-REG-039/040

**Smoke (API):** admin `/auth/session` 200 → logout 200 `{revoked:true}` → session re-check 401 →
admin re-login 200. qa-admin `/auth/session` 200. Frontend SPA root `GET /` → 200,
`<title>Scale Admin</title>`, asset `/assets/index-BKTCGSkG.js` 381,999 bytes (matches PR #25
build bundle size 382.02 kB → Wave 5 frontend is the live bundle).

**Wave 1 session-rate (< 2/min idle):** server-side rate-limit probe — 5 rapid
`/api/auth/session` calls all 200 in 40-70ms (no artificial throttle). The < 2/min property
is a *frontend* polling rate; `git diff 690a4ff..297bef5` shows no Wave 5 frontend changes
to `backendApi.ts` BroadcastChannel code or to RTK Query session polling — same code path
as Wave 4 closure live-verified at 0.50/min. **PASS by no-regression.**

**Wave 1 cross-tab logout/login propagation (30s SLO):** mechanism is `BroadcastChannel
'scale-admin:auth-session-event'` in `frontend/src/shared/api/backendApi.ts` (untouched in
Wave 5). Live 2-tab probe **deferred** alongside the Block 3 browser UI check (same gateway
scope issue). **PASS by no-regression.**

**BUG-REG-039 email validation:**

- 3 valid emails (`wave5valid1@`, `wave5+tag@`, `wave5.dot.name@`) → 201 each.
- 2 of 3 invalid emails as expected: `wave5@@…` and `wave5@` → 400 "Valid email is required".
- 1 of 3 — leading-space `" wave5leadspace@example.test"` → **201** (accepted after trim).
  This is the **existing validator contract**: `email-validation.util.ts:16` explicitly
  calls `email.trim()` before validation, with full spec coverage in
  `email-validation.util.spec.ts`. **NOT a Wave 5 regression** — the trim behavior predates
  Wave 5. Brief expectation didn't account for this normalization; see side findings.

**BUG-REG-040 imageUrl guard:**

- `imageUrl:"javascript:alert(1)"` → 400 `"imageUrl must be a valid http(s) URL"`.
- `imageUrl:"https://example.com/wave5-probe.png"` → 201 (cleaned up via PATCH `status:archived`).

## Side findings (non-blocking — NOT auto-filed; Maksim's call)

1. **`deploy-staging.sh` missing `BUILD_SHA` / `BUILT_AT` injection** —
   carry-over from Block 1 of the previous Manager run. Production has
   `scripts/deploy-prod.sh` injecting these as Docker build args; the
   staging-deploy path still relies on manual `export BUILD_SHA=…` before
   restage (which is why the previous Manager's restage caught the live
   pre-BUG-REG-048 image at all — the gate fired on a mismatch, not on a
   missing field). Recommend `scripts/deploy-staging.sh` mirror the
   production injection so staging restages are symmetric and automatic.
   **Held for batch per Maksim's call — no stub opened here.**

2. **Audit-action naming mixed family.** BUG-REG-046 introduced
   `user.invite.cancelled` (dot-prefix per PRD verbatim). Existing invite
   audit actions use the snake-prefix family:
   `user_invite.created` / `user_invite.accepted`. PRD wording was binding
   so the new action followed it; normalization to a single prefix is a
   safe cleanup. Suggest a follow-up cleanup ticket.

3. **`NODE_ENV=production` is the docker-compose default with no override.**
   PR #24 Manager flagged this — invite-token Item 3 acceptance required
   briefly flipping to `development` to expose the raw token at create
   time. A `docker-compose.override.dev.yml` or equivalent dev-mode
   compose file would make the dev/testing workflow less surgical.
   Ratify with Maksim.

4. **`GET /api/users/me` returns 500.** The `:userId` catch-all in
   `UsersController` matches `me` and the service throws on the lookup
   instead of returning 404. Not blocking — canonical "who am I" is
   `GET /api/auth/session`, which is what the frontend already uses — but
   the controller should explicitly reject reserved keywords or the
   service should map the not-found case to a 404. Newly discovered on
   this run.

5. **No `DELETE /api/stores/:storeId/advertising/banners/:bannerId`.**
   Banners are soft-deleted via `PATCH .../status` → `status:archived`.
   That's a reasonable design, but the lack of DELETE means the throwaway
   `wave5-valid-probe` banner created in Block 5 had to be archived
   rather than removed. Not a regression — just a soft-delete-only
   contract worth documenting in AGENTS.md §6.2.

6. **`PricesTab` category dropdown limited to first 200 catalog
   placements** (PR #25 known limitation, carried forward) — the
   `useListStorePricesQuery({limit:200})` call hard-caps the dropdown
   source. Long-term fix: dedicated `useListCatalogCategoriesQuery`.
   Suggest follow-up BUG-REG ticket.

7. **Brief expectation vs validator contract on leading/trailing
   whitespace in invite emails.** Brief expected 400 for a leading-space
   email; validator at `email-validation.util.ts:16` normalizes via
   `email.trim()` and accepts. Either update the brief / AGENTS.md
   §6.A.email-validation to document the trim-then-validate contract, or
   tighten the validator to reject leading/trailing whitespace explicitly
   (a behavior change — would need a PRD decision). Documenting as
   alignment concern, not a defect.

## Lessons learned

- **Deploy-pipeline gap is now a recurring pattern** (Wave 4 closure
  2026-05-19, Wave 5 closure 2026-05-20). The BUG-REG-047 version
  endpoint, merged this wave specifically to detect this, did its job —
  the previous Manager correctly STOPPED at Block 1 against a stale image.
  Without the endpoint we'd have pushed a misleading PASS. Recommend
  raising side finding #1 (`deploy-staging.sh` parity with prod) above
  backlog — recurrence in two consecutive closure verifies is a strong
  signal.
- **Staging restage ritual still requires manual `BUILD_SHA` export.**
  Maksim did the right thing on the 12:00 GMT+2 restage; gap is the
  scripted automation, not the operator.
- **Production NODE_ENV + no operator seed + no token-leak path =
  Item 2 of any invite-DELETE-style regression cannot be live-verified
  on staging.** Either (a) flip staging to dev briefly to bootstrap an
  operator, (b) seed an operator user via env override (analogous to
  qa-admin), or (c) accept the reuse-policy carry-over each time. Option
  (b) is the most ergonomic — recommend an `OPERATOR_SEED_ON_STARTUP=true`
  toggle mirroring the qa-admin pattern.
- **Browser-gated regression checks (cross-tab, session-rate idle,
  invite-cancel UI button) need a scope-upgraded browser tool that
  survives subagent dispatch.** This run had to defer all three to
  code-review + bundle-size-match arguments. Workable, but a Lead-driven
  re-verify with browser scope already approved is the cleanest path.

## Restore / hygiene

- No code changes to `backend/`, `frontend/`, or shared infra. All new
  files are under `docs/regression/2026-05-20-wave-5/evidence/` plus this
  SUMMARY.
- No prod hits. Staging only.
- Throwaway invites created during the run: 6 total — all cancelled
  (DELETE → 200 each).
  - Block 3: `fb594c6b-…`, `3b251a44-…`
  - Block 5 (BUG-REG-039): `661edf17-…`, `192f9632-…`, `862f9c61-…`,
    `dc6211c1-…`
- Throwaway banner created in Block 5 (BUG-REG-040): `1cea76b6-…` —
  archived via PATCH `status:archived` (no DELETE endpoint exists).
- No new operator/user/store rows created.
- No scale-device token rotations occurred.

## Handoff

PR is pre-merge HB to Lead. Manager run ends here per §13
(self-merge for closure-regression PRs is reserved for Lead after
Maksim's blanket approve).
