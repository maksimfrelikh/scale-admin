# BUG-REG-041 — Production hardening: insecure defaults in `docker-compose.yml` + vite-preview serving frontend

**Status:** OPEN — Wave 3 backlog (adjacent finding from infra session 2026-05-19)
**Severity:** medium-high (insecure defaults are easy to ship to prod by accident; surface area is unnecessarily wide)
**Area:** infra / docker-compose / frontend serving
**Found during:** 2026-05-19 infra session (post-Wave-3 cleanup / staging prep — Lead-side observation, not from regression script).

## Findings

- `docker-compose.yml` sets `NODE_ENV: development` as the default for backend and frontend services. A naive `docker compose up -d` on a fresh host therefore brings up a "production-shaped" deploy still running in dev mode (verbose logs, dev error pages, dev-only middleware, no JIT optimizations on the Node side).
- `postgres` port `5432` is bound on `0.0.0.0:5432` — exposed to every interface the host listens on, not just localhost. No password/network policy in compose; relies on the host firewall, which is out-of-band of the repo.
- `backend` port `3000` is bound on `0.0.0.0:3000` — same problem: directly reachable from the network, bypassing any reverse proxy / TLS termination an operator might add later.
- `frontend` is served via `vite preview` (a Node-based preview server intended for local "is the build OK" checks). Vite's own docs are explicit that `vite preview` is **not** a production HTTP server. Production should be `dist/` static files served by nginx (or equivalent) with proper caching headers, gzip, and ETags.

## Expected (suggested fix)

- `NODE_ENV=production` as the default in `docker-compose.yml`; `docker-compose.override.yml` (dev) sets it back to `development`.
- All `ports:` declarations bind `127.0.0.1:<host>:<container>` only. The only externally-reachable port is whatever nginx/edge-proxy publishes (set up at the operator layer, not in this compose file).
- Add an `nginx` service that:
  - mounts the frontend `dist/` build output
  - serves it as static files with correct caching + gzip + `Content-Security-Policy`
  - reverse-proxies `/api/*` to the backend service over the internal compose network
- Drop the `frontend` (`vite preview`) service from the production-shape compose; keep it only in the dev override.

## Impact

- **Foot-gun for first prod deploy.** Right now, "follow the README, run `docker compose up -d` on a clean host" produces a deploy with: dev mode app, DB reachable from the public internet (if no host firewall), backend reachable from the public internet, and frontend served by a non-production HTTP server. Anyone who isn't infra-savvy will ship this exact shape.
- **Defense-in-depth.** Even with a host firewall in front, `0.0.0.0` binds leak through any future container-network misconfiguration (e.g. host networking, accidental `--network host` on the backend).
- **Performance/UX.** `vite preview` does not match nginx in caching, compression, or TLS termination. Live customers will see worse cold-cache loads + no proper `cache-control` on hashed assets.

## Acceptance criteria

1. Fresh `docker compose -f docker-compose.yml up -d` on a clean host comes up with `NODE_ENV=production`, no Postgres/backend ports reachable from the public interface (only via nginx), and frontend served by nginx as static assets.
2. `docker-compose.override.yml` (dev) keeps current dev behavior: vite dev server, source maps, exposed ports, `NODE_ENV=development`.
3. README updated to describe the two-compose-file shape (prod default vs dev override).
4. Manual smoke test from a non-loopback host on the LAN: `curl postgres-host:5432` and `curl backend-host:3000` both refused; `curl backend-host:80/` returns the frontend; `curl backend-host:80/api/health` returns the backend health response (via nginx proxy).

## Out of scope

- TLS / Let's Encrypt automation — operator-layer concern.
- Multi-host orchestration (k8s, swarm) — separate ticket if/when it becomes relevant.
- Secret management for prod DB passwords — separate ticket (current compose uses `.env`).
