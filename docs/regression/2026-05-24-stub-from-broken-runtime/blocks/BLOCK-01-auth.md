# BLOCK-01 Auth & Session Lifecycle

Status: BLOCKED - Manager/Tester dispatch did not start successfully.

Required Tester block-plan first line:

> Target: https://staging.maksimfrelikh.ru. Production trogать запрещено кроме GET /api/version и /api/health.

## Scope

- Wave: REGRESSION-2026-05-24 Wave 1.
- Target: staging functional QA for PRD §6.1 and §11.1-11.3.
- Production boundary: read-only GET /api/version and /api/health only.
- Required executor shape: Manager dispatching Tester multi-block execution.

## Blocker

Manager dispatch failed before producing any usable Manager or Tester output. No Tester execution occurred, no QA credentials were requested, and no functional auth/session checks were performed.

This is an execution infrastructure blocker, not an application PASS/FAIL verdict.

## Read-Only Liveness Probes

- Production /api/version: 200, commit 3538b7c, builtAt 2026-05-22T08:05:35Z.
- Production /api/health: 200.
- Staging /api/version: 200, commit 0cf0966, builtAt 2026-05-23T20:42:10Z.
- Staging /api/health: 200.

## Coverage Notes

Not covered because dispatch failed before Tester execution:

- Login/logout for qa-admin@gmail.com and qa-operator@gmail.com.
- Wrong-password behavior, rate-limit/lockout.
- Cookie flags and session id regeneration.
- UserSession.sessionTokenHash read-only verification.
- CSRF negative checks.
- Idle and absolute timeout smoke.
- Invite/reset dummy-token UI and raw-token leak checks.
- Edge cases: empty, max length, Unicode/Russian/emoji, XSS smoke, multi-tab, back/forward/refresh, network errors, English leakage.

## Recommendation

Fix the Manager/subagent execution path, then rerun Wave 1 from the original brief. Do not dispatch Wave 2 from this state.
