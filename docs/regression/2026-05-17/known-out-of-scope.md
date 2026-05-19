# Regression 2026-05-17 — known out-of-scope

Findings from the 2026-05-17 regression that are real functional gaps but deferred from Wave 1 bug-fix scope. Each entry must point to (a) the source BUG-REG defect, (b) the current mitigation shipped (if any), and (c) the follow-up TASK card that tracks the full fix.

---

## BUG-REG-025 — Password reset / forgot password flow

- Source defect: `docs/regression/2026-05-17/bugs/BUG-REG-025.md`
- Severity: high
- Reason for deferral: full backend reset flow (request + confirm endpoints, `PasswordResetToken` table, rate-limit, 15-minute token expiry, email send) is a multi-day feature, not a bug-bash item. Wave 1 scope is regression closure only.
- Wave 1 mitigation (shipped in `bugfix/BUG-REG-025-password-reset-mvp-text`):
  - Static notice "Забыли пароль? Обратитесь к администратору." rendered under the login form (`frontend/src/main.tsx` `LoginScreen`).
  - Admin manual reset remains the operational path: update `UserCredential.passwordHash` via `psql`, or revoke + re-invite.
- Follow-up: `docs/dev-tasks/TASK-062-password-reset-flow.md` (status: proposed).
- Closure condition: TASK-062 merged → remove this entry → close BUG-REG-025.
