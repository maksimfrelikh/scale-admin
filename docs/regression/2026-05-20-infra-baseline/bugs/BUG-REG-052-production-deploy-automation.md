# BUG-REG-052 — Production deploy automation

**Status:** OPEN — backlog
**Severity:** medium
**Area:** infra / CD
**Origin:** pre-Wave-5 infrastructure review (2026-05-20). Current production deploy is the manual `./scripts/deploy-prod.sh` ritual (committed in `5daea4f`), run from a local SSH session by the Lead. Risk: human in the loop, slower than necessary, and not consistently reproducible if the operator drifts from the script (e.g. forgets pre-deploy backup, skips a health probe).

## Steps to reproduce

1. Land a backend fix to `main`.
2. Lead manually SSHes to prod host, pulls, runs `./scripts/deploy-prod.sh`.
3. No automated artifact of what was deployed when, no record of pre-deploy backup outcome, no signal to other agents that prod is now ahead of staging.

## Expected

Pushing to `main` runs through CI ([[BUG-REG-051]]) → auto-deploys to staging → manual approval gate → auto-deploys to production, with a clear notification on each transition.

## Actual

Deploys depend on Lead being awake and remembering the ritual.

## Required pieces

- **(a) SSH deploy key** stored in GitHub Secrets (separate key from Lead's personal SSH key).
- **(b) Workflow that runs `./scripts/deploy-prod.sh` remotely** against the prod host.
- **(c) GitHub `environments` protection rule** (manual approval) for the `production` environment; `workflow_dispatch` trigger so prod isn't yoked to every staging deploy.
- **(d) Notification on success/failure** — Telegram (via existing bot) or email; share channel with [[BUG-REG-054]] alerting story.

## Depends on

- [[BUG-REG-051]] — CI must exist first so `main` is known-green before any deploy.

## Out of scope

- Rollback automation — separate work once we have deploy automation that records the previous image tag.
- Blue/green or canary deploys — overkill for current traffic.

## Wave placement

Backlog. Pick up after [[BUG-REG-051]] lands.

## Cross-references

- [[BUG-REG-049]] — secret injection path for the deploy workflow.
- [[BUG-REG-053]] — pre-deploy backup hook should land here.
- [[BUG-REG-054]] — deploy success/failure notifications share alerting channel.
