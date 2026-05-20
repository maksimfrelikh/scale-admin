# Infrastructure baseline gaps — discovered 2026-05-20 pre-Wave 5

Pre-Wave-5 infrastructure review surfaced 6 gaps in the production posture. Two were immediately remediated by the Lead on 2026-05-20 (production secrets rotation, cron file manual override). Four medium-term improvements are stubbed below for a future infrastructure wave.

## Immediately remediated (2026-05-20)

- **Production secrets rotation.** `.env` on the prod host contained only `NODE_ENV` + `FRONTEND_ORIGIN`, so `docker-compose` fell back to the public-default `POSTGRES_PASSWORD=scale_admin_password` literal from the compose file. The postgres role password was rotated via `ALTER USER`, and `.env` was populated with a random password. **Stubbed forward as [[BUG-REG-049]]** — root cause is the lack of an `.env.example` and a startup-time config validator that would catch this on a fresh install.
- **Cron install path + format.** `scripts/docker-prune.cron` (from [[BUG-REG-042]]) used `/opt/scale-admin` rather than the production host's actual `/home/clawd/projects/scale-admin`, and was in user-crontab format rather than `/etc/cron.d/` format. Replaced manually with a `systemd-cron`-managed override. **Stubbed forward as [[BUG-REG-050]]** — the committed file should be installable as-is or via an `install-cron.sh` wrapper.

## Stubbed for a future infrastructure wave

| ID | Severity | Area |
|---|---|---|
| [[BUG-REG-049]] | medium | `.env.example` + startup config validation |
| [[BUG-REG-050]] | low | cron install path + format |
| [[BUG-REG-051]] | medium | GitHub Actions CI pipeline |
| [[BUG-REG-052]] | medium | Production deploy automation |
| [[BUG-REG-053]] | medium | Backup automation (periodic + retention + uploads) |
| [[BUG-REG-054]] | low | Monitoring + alerting baseline |

## Suggested ordering

1. **[[BUG-REG-049]]** first — closes the secret-leakage root cause that prompted this batch.
2. **[[BUG-REG-051]]** second — CI is a prerequisite for [[BUG-REG-052]] and unblocks automated lint/test gates.
3. **[[BUG-REG-050]]** + **[[BUG-REG-053]]** together — they share the cron / systemd-timer install-path question.
4. **[[BUG-REG-052]]** after [[BUG-REG-051]] — deploy automation needs CI as a green-main gate.
5. **[[BUG-REG-054]]** last — observability is the lowest-urgency item; system has been running without it, add when first incident motivates.

## Cross-references

- Wave 4 closure: `docs/regression/2026-05-19-wave-4-closure/SUMMARY.md` — last completed regression wave.
- [[BUG-REG-042]] — docker-prune cron commit that surfaced [[BUG-REG-050]].
- `scripts/deploy-prod.sh` (commit `5daea4f`) — current manual deploy ritual that [[BUG-REG-052]] would automate.
