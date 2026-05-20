# BUG-REG-049 — `.env.example` + startup config validation

**Status:** RESOLVED — Wave 6, PR #30 (d700687 .env.example + startup validation)
**Severity:** medium
**Area:** backend (config bootstrap) + infra (`docker-compose.yml`)
**Origin:** pre-Wave-5 infrastructure review (2026-05-20). Surfaced when production `.env` was found to contain only 2 lines (`NODE_ENV`, `FRONTEND_ORIGIN`), causing `docker-compose` to fall back to its default literal `POSTGRES_PASSWORD=scale_admin_password` — a publicly-known string committed to the compose file. Rotated manually 2026-05-20 (postgres role password changed via `ALTER USER`, `.env` populated with a random password). See `docs/regression/2026-05-20-infra-baseline/SUMMARY.md`.

## Steps to reproduce

1. Fresh checkout; create a minimal `.env`:

   ```
   NODE_ENV=production
   FRONTEND_ORIGIN=https://example.com
   ```

2. `docker compose up -d`.
3. Backend starts silently; postgres role uses the default literal `scale_admin_password` from `docker-compose.yml`.

## Expected

Backend refuses to start (or loudly warns) when production-grade variables (`POSTGRES_PASSWORD`, `DATABASE_URL`, `JWT_SECRET`, etc.) fall back to insecure defaults; `docker-compose` itself refuses to start without explicit secrets.

## Actual

Backend starts on insecure defaults silently. Only Lead's manual review on 2026-05-20 caught the leakage. The publicly-known default password was active in production for an unknown window before rotation.

## Hypothesis paths (for the eventual fix)

- **(a) `.env.example` committed to repo** with every required var + inline comments, plus README pointer to copy/fill before deploy.
- **(b) NestJS config-validation pipe at startup** (`ConfigModule.forRoot({ validationSchema })`) — fail fast on missing/empty `POSTGRES_PASSWORD`, `DATABASE_URL`, `JWT_SECRET`, etc.
- **(c) `docker-compose.yml` — replace default-literal pattern** (`POSTGRES_PASSWORD=scale_admin_password`) with required-var syntax (`${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}`). Compose itself refuses to start.
- **(d) Startup banner log showing critical config state** (without echoing secret values) — surface-not-silent.

## Out of scope

- Vault / Doppler / 1Password external secrets management — overkill for current scale.
- Per-environment `.env` overlays (`.env.production`, `.env.staging`) — file-based env is fine; staging vs prod separation is already by `docker-compose` project.

## Wave placement

Wave 5 candidate (high value, closes the secret-leakage root cause). Otherwise backlog.

## Cross-references

- [[BUG-REG-051]] — CI could lint `.env.example` schema against committed validator.
- [[BUG-REG-052]] — deploy automation needs a vetted secret-injection path.
