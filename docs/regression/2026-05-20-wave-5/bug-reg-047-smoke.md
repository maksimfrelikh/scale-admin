# BUG-REG-047 — `/api/version` smoke evidence

**Date:** 2026-05-20
**Branch:** `fix/bug-reg-047-api-version-endpoint`
**Base commit:** `111f646` (TASK 1 BUG-REG-044)

## §4.2 build verify

- `npm run build` in `backend/` → clean (no errors, no warnings).
- `gitleaks protect --staged` on the branch diff → `no leaks found` (gitleaks 8.21.2).

## §4.3 scoped test — local smoke against `docker compose up -d backend`

### Mode A — env-set (build-time args injected)

```
$ export BUILD_SHA=$(git rev-parse --short HEAD)   # 111f646 at smoke time
$ export BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)   # 2026-05-20T08:51:13Z
$ docker compose build backend && docker compose up -d --force-recreate --no-deps backend
$ curl -s http://localhost:3000/api/version
{"commit":"111f646","builtAt":"2026-05-20T08:51:13Z","version":"0.1.0","environment":"production"}
```

All four payload keys present. `commit` non-empty. `builtAt` ISO-8601 UTC. `version` read from `backend/package.json`. `environment` reflects `NODE_ENV`.

### Mode B — dev fallback (no build-time args)

```
$ unset BUILD_SHA BUILT_AT
$ docker compose build backend && docker compose up -d --force-recreate --no-deps backend
$ curl -s http://localhost:3000/api/version
{"commit":"dev","builtAt":"dev","version":"0.1.0","environment":"production"}
```

`commit` and `builtAt` fall back to `"dev"` placeholder per PRD. No 500, no throw.

### `/api/health` regression sanity

```
$ curl -s http://localhost:3000/api/health
{"status":"ok","service":"scale-admin-backend","timestamp":"2026-05-20T08:52:22.454Z"}
```

Existing health endpoint untouched.

## §4.4 manual repro

N/A — backend-only smoke endpoint per PRD (analog of `/api/health`). Waiver noted.

## Decisions taken (autonomous authority)

- **Build-time injection:** Docker `ARG BUILD_SHA=dev` + `ARG BUILT_AT=dev` on the runtime stage, projected into `ENV` at build time. `docker-compose.yml` passes them as build args, defaulting to `dev` if env unset. `scripts/deploy-prod.sh` exports `git rev-parse --short HEAD` + `date -u +%Y-%m-%dT%H:%M:%SZ` before `docker compose build`. Hypothesis path (a) from the bug stub.
- **Module placement:** New `backend/src/version.controller.ts`, registered as a sibling controller of `HealthController` in `app.module.ts`. Mirrors the existing health pattern (single-file controller, no module wrapper).
- **Env var naming:** `BUILD_SHA` and `BUILT_AT`. Concise; symmetrical with `NODE_ENV`.
- **`version` source:** Read at runtime from `package.json` at process cwd (which is `/app` in container per Dockerfile `WORKDIR`). PRD says "from package.json"; runtime read is the literal interpretation and avoids a second build-time injection.
- **`environment` source:** `process.env.NODE_ENV` (already set everywhere). Returns `"dev"` if unset.
- **Dev fallback policy:** Trim + length check; `"dev"` placeholder when value empty/missing. No throw, no 500.

## Docker / deploy script changes (ESCALATE flag)

YES — required by PRD ("Build-time injection via Docker ARG → env var → endpoint reads at boot"):

- `backend/Dockerfile` — runtime stage adds `ARG BUILD_SHA=dev`, `ARG BUILT_AT=dev`, and corresponding `ENV` lines.
- `docker-compose.yml` — `backend.build.args` block added, defaults to `dev`.
- `scripts/deploy-prod.sh` — exports `BUILD_SHA` + `BUILT_AT` before `docker compose build` so deployed images carry the SHA.

No changes to `docker-compose.staging.yml` (inherits `build.args` from the base compose file automatically — verified by running with default `docker compose ... up -d` against the base file path).

No changes to `docker-compose.override.yml` or `docker-entrypoint.sh`.
