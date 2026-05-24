# BLOCK-01 deviation — QA credentials mismatch (brief vs staging)

**Captured:** 2026-05-24 ~12:55 GMT+2.
**Severity:** blocker for verbatim brief execution; resolved by substitution + reuse-policy.

## What the brief specified
- `qa-admin@gmail.com` / `QaRegression123!`
- `qa-operator@gmail.com` / `QaRegression123!`

## What staging actually has
`GET /api/users` (as logged-in seeded admin) returned exactly 4 accounts:

| email                | role  | status |
|----------------------|-------|--------|
| qorxoes@gmail.com    | admin | active |
| frelikhmax@gmail.com | admin | active |
| qa-admin@example.com | admin | active |
| admin@example.com    | admin | active |

- **None** of the brief's emails exist.
- **No operator-role user exists on staging at all.**

## Confirmation
- `POST /api/auth/login` with `qa-admin@gmail.com` / `QaRegression123!` → 401 `"Неверный email или пароль"` (no Set-Cookie).
- `POST /api/auth/login` with `qa-operator@gmail.com` / `QaRegression123!` → 401 `"Неверный email или пароль"` (no Set-Cookie).
- `POST /api/auth/login` with `qa-admin@example.com` / `qa-admin12345` → 200, valid session cookie set.
- `POST /api/auth/login` with `admin@example.com` / `admin12345` → 200, valid session cookie set.

No rate-limit/lockout was hit — staging simply lacks the brief-named accounts.

## Background
- `backend/prisma/seed.js:16-17` defines `DEFAULT_QA_ADMIN_EMAIL = 'qa-admin@example.com'` and `DEFAULT_QA_ADMIN_PASSWORD = 'qa-admin12345'`, gated by `SEED_ON_STARTUP=true`. Wave 5 closure (PR #22, 2026-05-20) shipped this seed.
- Wave 5 closure SUMMARY.md, "Lessons learned" §3, already documented: *"Production NODE_ENV + no operator seed + no token-leak path = Item 2 of any invite-DELETE-style regression cannot be live-verified on staging. … recommend an `OPERATOR_SEED_ON_STARTUP=true` toggle mirroring the qa-admin pattern."* That recommendation has not landed; staging still has no operator user.

## Substitution applied (Wave 1 manager's call)
- **Admin role tests** (`§1.1` golden path, `§1.4`/`§1.5` cookie + fixation, `§1.7` CSRF, `§1.9` real invite + reset, `§1.10` edges): use `qa-admin@example.com` / `qa-admin12345`. The seeded QA admin is the closest analog to the brief's `qa-admin@gmail.com`.
- **Lockout target** (`§1.3`): use `admin@example.com` (the dev fallback) for the DB-tracked lockout probe, so the seeded `qa-admin@example.com` stays available for the remaining sub-blocks. Brief said "use a disposable email or qa-operator"; with no operator on staging, `admin@example.com` is the next-most-disposable.
- **Operator-role tests** (`§1.1` operator-side login, `§1.7` operator-403 on admin-only endpoints): live execution is impossible without a seeded operator. Per the brief's "deviations with justification" clause, I substitute **code-review evidence + Wave 5 reuse policy** (Wave 5 SUMMARY.md Block 3 reuse-policy: `users.controller.ts:18-21,79-82` class-level `@RequireRoles('admin')` makes operator-403 structurally invariant; PR #24 acceptance evidence cited from `docs/regression/2026-05-20-wave-5/bug-reg-046-acceptance.md` Item 2 lines 35-51).

## Recommendation for Lead
1. Refresh the brief's "Test accounts" section to match staging reality, or
2. Provision `qa-admin@gmail.com` and `qa-operator@gmail.com` on staging (either by seed update or out-of-band invite + accept), and re-dispatch Wave 1.
3. Land the `OPERATOR_SEED_ON_STARTUP=true` toggle recommended by Wave 5 closure so future regression waves can live-exercise operator role.

A bug file has been opened for tracking under `bugs/BUG-REG-067-brief-vs-staging-credential-mismatch.md`.
