# BLOCK-01-auth — Wave 1 auth/session lifecycle

Target: https://staging.maksimfrelikh.ru. Production trogать запрещено кроме GET /api/version и GET /api/health.

Status: ⏸️ BLOCKED — Manager dispatch failed before Tester execution.

Found: 2026-05-24 11:35 CEST

## Scope Requested

- PRD §6.1 and §11.1-11.3 auth/session lifecycle regression.
- Staging functional QA only.
- Production limited to read-only GET /api/version and GET /api/health.
- Tester multi-block execution per Tester §5.

## Preflight

- Staging GET /api/version: 200, commit 0cf0966.
- Staging GET /api/health: 200.
- Production GET /api/version: 200, commit 3538b7c.
- Production GET /api/health: 200.

Evidence: docs/regression/2026-05-24/evidence/manager-dispatch-blocker.txt

## Blocker

Manager subagent dispatch failed before producing a usable Manager plan or Tester handoff. Multiple retries were attempted, including a supported-thinking retry and a model override retry. Each failed during subagent startup before any Tester coverage could begin.

No QA login, cookie, CSRF, DB, invite/reset, timeout, browser, or edge-case checks were executed in this retry.

## Coverage Result

- Login/logout under qa-admin and qa-operator: ⏭️ not executed, infra blocker.
- Wrong-password/rate-limit/lockout: ⏭️ not executed, infra blocker.
- Cookie attributes and session regeneration: ⏭️ not executed, infra blocker.
- Read-only DB UserSession hash check: ⏭️ not executed, infra blocker.
- CSRF checks: ⏭️ not executed, infra blocker.
- Idle/absolute timeout smoke: ⏭️ not executed, infra blocker.
- Invite/reset dummy-token hardening: ⏭️ not executed, infra blocker.
- Edge cases and Russian UI leakage pass: ⏭️ not executed, infra blocker.

## Bugs

- Product BUG-REG findings: none filed. Wave 1 did not execute.
- This is an OpenClaw execution-infrastructure blocker, not an application PASS/FAIL.

## Recommendation

Do not dispatch Wave 2. Rerun Wave 1 only after Manager subagent startup/model permissions are verified, or approve an alternate execution path explicitly.
