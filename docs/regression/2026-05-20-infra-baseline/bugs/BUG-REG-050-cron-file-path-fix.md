# BUG-REG-050 — `scripts/docker-prune.cron` install path + format

**Status:** OPEN — backlog
**Severity:** low
**Area:** scripts / infra
**Origin:** pre-Wave-5 infrastructure review (2026-05-20). `scripts/docker-prune.cron` (added in [[BUG-REG-042]], commit `8092dc9`) used `/opt/scale-admin` as the working directory, but the actual install location on the production host is `/home/clawd/projects/scale-admin`. The file is also user-crontab format (no user column) — drops into `/etc/cron.d/` silently broken. Worked around manually 2026-05-20 with a `systemd-cron`-generated unit (override committed to host, not to repo).

## Steps to reproduce

1. `cp scripts/docker-prune.cron /etc/cron.d/scale-admin-docker-prune`
2. `systemctl reload cron` (or wait for cron to pick up the file).
3. Weekly run never fires. `/var/log/syslog` shows nothing — wrong path AND wrong format.

## Expected

Shipping the cron file should produce a clear install path that works on a standard Ubuntu host without per-host hand-editing.

## Actual

File is committed as a template that nobody can use as-is. Lead manually authored an override on 2026-05-20 to get it firing on the production host.

## Hypothesis paths (for the eventual fix)

- **(a) `scripts/install-cron.sh` wrapper** that `envsubst`s the install path (read from `pwd` or env var) and installs to `/etc/cron.d/` with correct format (user column included).
- **(b) Document existing manual install procedure** in `scripts/README.md` — minimum viable, no code change.
- **(c) Switch to a `systemd` timer + service unit** shipped in `scripts/systemd/` — sidesteps cron format ambiguity, easier to test (`systemctl status`), survives reboots cleanly.

## Out of scope

- Multi-host orchestration (Ansible / Salt) — single-host install only.
- Cron job rotation / retention policy — separate ticket once monitoring lands ([[BUG-REG-054]]).

## Wave placement

Backlog. Bundle with the next infrastructure pass; share resolution with [[BUG-REG-053]] (backup automation will face the same install-path question).

## Cross-references

- [[BUG-REG-042]] — origin commit that introduced the committed-template file.
- [[BUG-REG-053]] — backup cron will have the same install-path problem; solve once.
