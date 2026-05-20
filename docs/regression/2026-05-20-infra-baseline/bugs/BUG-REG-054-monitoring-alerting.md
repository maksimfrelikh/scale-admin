# BUG-REG-054 — Monitoring + alerting baseline

**Status:** OPEN — backlog
**Severity:** low
**Area:** infra / observability
**Origin:** pre-Wave-5 infrastructure review (2026-05-20). No uptime monitoring (if prod goes down, the team finds out manually — usually after a user reports it). No error tracking (backend errors are logged inside the container; no alerts surface them). No performance baseline (slow queries, memory pressure go unnoticed until they become outages).

## Steps to reproduce

1. Stop the backend container on the prod host.
2. No alert, no notification.
3. Throw a 500 from a hot route — error is captured in container stdout, but nobody is paged.

## Expected

When prod is unhealthy, the team finds out before users do.

## Actual

Passive failure detection only.

## Proposed minimum-viable

- **(a) UptimeRobot** (or similar external probe) on `GET /api/health` — free tier handles 50 monitors at 5-min intervals.
- **(b) Optional: Sentry SDK** on backend for error tracking (free tier covers small projects).
- **(c) Backend internal metrics endpoint** (`GET /api/metrics`, Prometheus format) for future Grafana — wire `prom-client` into NestJS.
- **(d) Alerting channel:** existing Telegram bot fires a message on `/api/health` fail (UptimeRobot supports webhook → small bridge function or direct Telegram webhook).

## Acceptance criteria

- [ ] External probe runs every 5 min against `/api/health`.
- [ ] Telegram alert fires within 10 min of prod going down.
- [ ] `/api/metrics` returns at least: request count, request-latency histogram, DB pool stats.

## Out of scope

- APM / full distributed tracing — overkill for monolithic Nest backend.
- Log aggregation (Loki / ELK) — overkill at current volume; container `docker logs` is fine for now.
- Synthetic transaction monitoring (login flow, full purchase flow) — separate effort; current `/health` is sufficient signal.

## Wave placement

Backlog. Lowest urgency in the infra-baseline batch — the system has been running fine without it; add when the first incident motivates it.

## Cross-references

- [[BUG-REG-052]] — deploy notifications can share this alerting channel.
- [[BUG-REG-053]] — backup success/failure should fire through the same channel.
