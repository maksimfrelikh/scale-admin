# BUG-REG-052 — Staging deploy automation

**Status:** IMPLEMENTED — pending PR review/merge (2026-05-23)
**Severity:** medium
**Area:** infra / CD
**Origin:** pre-Wave-5 infrastructure review (2026-05-20). Current production deploy is the manual `./scripts/deploy-prod.sh` ritual (committed in `5daea4f`), run from a local SSH session by the Lead. Risk: human in the loop, slower than necessary, and not consistently reproducible if the operator drifts from the script (e.g. forgets pre-deploy backup, skips a health probe).

## Scope update (2026-05-23)

Maksim narrowed this task to **auto-deploy current `main` to staging only**. Production deploys remain fully manual and are not changed by this work.

## Steps to reproduce

1. Merge a change to `main`.
2. Staging does not automatically pick up the new commit.
3. Lead has to manually SSH to the VPS, pull `main`, and run `./scripts/deploy-staging.sh deploy`.

## Expected

Pushing to `main` runs the staging deploy workflow, which SSHes to the VPS as `clawd`, fast-forwards `/home/clawd/projects/scale-admin` to `origin/main`, runs `./scripts/deploy-staging.sh deploy`, and prints `https://staging.maksimfrelikh.ru/api/version` for deployed-version evidence.

Production remains manual and untouched.

## Actual

Staging deploys depend on Lead being awake and remembering the ritual.

## Required pieces

- **(a) SSH deploy key** stored in GitHub Secrets (separate key from Lead's personal SSH key).
- **(b) Staging workflow** at `.github/workflows/staging-deploy.yml`, triggered by `push` to `main` plus manual `workflow_dispatch`.
- **(c) Required GitHub Secrets:** `STAGING_SSH_HOST`, `STAGING_SSH_USER=clawd`, `STAGING_SSH_KEY`; optional `STAGING_SSH_PORT` defaults to `22`.
- **(d) Remote deploy command:** `git fetch origin && git checkout main && git pull --ff-only origin main && ./scripts/deploy-staging.sh deploy && curl -sS https://staging.maksimfrelikh.ru/api/version`.

## Depends on

- [[BUG-REG-051]] — CI exists and continues to guard PRs before merge.

## Out of scope

- Production deploy automation — explicitly manual by owner directive.
- Rollback automation — separate work once staging deploy automation records enough operational history.
- Blue/green or canary deploys — overkill for current traffic.

## Wave placement

Active PR. Do not merge without Maksim approval because GitHub Actions/workflow changes are always-manual.

## Cross-references

- [[BUG-REG-049]] — secret injection path for the deploy workflow.
- [[BUG-REG-053]] — pre-deploy backup hook should land here.
- [[BUG-REG-054]] — deploy success/failure notifications share alerting channel.
