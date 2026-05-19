# TASK-062 — Password reset / forgot password flow

- Status: proposed
- Owner: (unassigned)
- Branch: `feature/TASK-062-password-reset-flow` (to be created on dev assignment)
- Closes: BUG-REG-025 (high)
- Last updated: 2026-05-19

Source defect: `docs/regression/2026-05-17/bugs/BUG-REG-025.md` (no self-service password recovery; admin must run `psql` to reset).

Wave 1 MVP closure shipped in `bugfix/BUG-REG-025-password-reset-mvp-text`:
- Static notice "Забыли пароль? Обратитесь к администратору." rendered under the login form.
- BUG-REG-025 reclassified as known-out-of-scope (see `docs/regression/2026-05-17/known-out-of-scope.md`).

This TASK card captures the full backend + UI flow required to actually close the gap. Spec only — no implementation in this card.

---

## 1. Goal

Provide a self-service password recovery flow for authenticated users who have lost access, eliminating the need for an admin `psql` intervention while preserving rate-limit and token-expiry guarantees.

## 2. Functional requirements

### 2.1 UI

- `/login` shows a `Забыли пароль?` link (replaces / sits next to the current static notice).
- New page `/forgot-password`:
  - Single field `email`.
  - On submit → `POST /api/auth/password-reset/request`.
  - Always returns a generic "Если такой email зарегистрирован, мы отправили инструкцию" message (no account enumeration).
- New page `/reset-password?token=…`:
  - Two fields: `password`, `passwordConfirm`.
  - On submit → `POST /api/auth/password-reset/confirm` with `{ token, password }`.
  - Success → redirect to `/login` with banner "Пароль обновлён. Войдите.".
  - Failure (expired / unknown token) → inline form error.

### 2.2 Backend endpoints

- `POST /api/auth/password-reset/request`
  - Body: `{ email: string }`
  - Returns: `204` always (no enumeration).
  - Side effects:
    - If email matches an active `UserCredential`, create row in new table `PasswordResetToken` (see §3).
    - Send email via existing notification channel (or stub if SMTP not yet integrated — gate behind `EMAIL_ENABLED` env flag).
  - Rate limit: max **3 requests per email per hour**, **10 per IP per hour**. Reuse existing rate-limit middleware if available; otherwise add per-route limiter.
- `POST /api/auth/password-reset/confirm`
  - Body: `{ token: string, password: string }`
  - Returns: `204` on success; `400` on validation error; `410` on expired/used token; `404` on unknown token.
  - Side effects:
    - Validate password meets existing complexity policy (reuse helper used in invite-accept).
    - Replace `UserCredential.passwordHash` for the owning user.
    - Mark token consumed (`usedAt = NOW()`).
    - Invalidate all existing sessions for the user (force re-login).
    - Audit log entry `password.reset.confirmed`.

### 2.3 Token semantics

- Length: 32 random bytes, hex-encoded (64 chars) — keep parity with existing invite tokens.
- TTL: **15 minutes** from issuance.
- Single-use: `usedAt` set on first successful confirm.
- Storage: hashed (SHA-256) in DB, raw value only in email link.

## 3. Schema migration (separate sub-task)

New table `PasswordResetToken`:

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `userId` | uuid FK → User | |
| `tokenHash` | text unique | sha256 of raw token |
| `createdAt` | timestamptz | default now() |
| `expiresAt` | timestamptz | createdAt + 15m |
| `usedAt` | timestamptz nullable | |
| `requestIp` | inet nullable | for audit |

Indexes: `(tokenHash)` unique, `(userId, createdAt)` for rate-limit lookup.

## 4. Out of scope for this TASK

- SMS / 2FA recovery — explicitly deferred.
- Admin-side "force reset" UI (separate ticket if needed).
- Self-service password change for authenticated users (different flow — `/account/password`).

## 5. Acceptance criteria

- [ ] `POST /api/auth/password-reset/request` returns `204` for both valid and unknown emails.
- [ ] Rate limit triggers `429` on 4th request from same email within 60 minutes.
- [ ] Email contains a link of form `https://<host>/reset-password?token=<hex>`.
- [ ] Token older than 15 minutes returns `410` from `/confirm`.
- [ ] Used token returns `410` on replay.
- [ ] Successful confirm invalidates all sessions for the user (existing session cookies stop working).
- [ ] Audit log emits `password.reset.requested` and `password.reset.confirmed` events.
- [ ] BUG-REG-025 regression test (probe endpoints + UI `/login` for "Forgot password?" link) passes.
- [ ] After merge, the BUG-REG-025 entry in `known-out-of-scope.md` is removed and the bug is closed.

## 6. Open questions

- SMTP provider — is one chosen for MVP, or is `EMAIL_ENABLED=false` the launch state? If the latter, request flow must log the token link to ops channel as a temporary bridge.
- Should the existing `/login` field-error wording be standardised at the same time (BUG-REG-006 area)? Out of scope unless deliberately bundled.
