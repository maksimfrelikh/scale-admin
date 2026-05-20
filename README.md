# Scale Admin

Scale Admin is an MVP web administration system for managing product catalogs, store prices, advertising banners, users, access control, and electronic scale synchronization.

The project is built as a Docker Compose based monorepo with:

- NestJS backend
- React + TypeScript frontend
- PostgreSQL
- Prisma ORM
- Cookie-based server-side sessions
- RBAC for admin/operator access
- OpenClaw orchestration workflow

## Current MVP status

Implemented foundation includes:

- Docker Compose project skeleton
- Backend health endpoint
- Frontend health integration through RTK Query
- Prisma auth/access data model
- Seed admin and sample data
- Login/logout with server-side sessions
- Session guard and RBAC guard
- Store access checks for operators
- CSRF protection and rate limiting for web auth endpoints
- Deterministic OpenClaw verification scripts

## Run locally with Docker Compose

The compose stack now refuses to start without an explicit `.env`. Copy the
template and populate it before the first `docker compose up`:

```bash
cp .env.example .env
$EDITOR .env   # at minimum set POSTGRES_PASSWORD and DATABASE_URL to matching random strings
docker compose up --build
```

Compose maps `${POSTGRES_PASSWORD:?...}` and `${DATABASE_URL:?...}` as required
variables — running `docker compose up` against an empty `.env` will fail fast
with a clear error rather than silently booting on the historical insecure
default `scale_admin_password`. The backend additionally re-checks at boot
(see `backend/src/config/environment.validation.ts`) and refuses to start in
`NODE_ENV=production` if the DB URL still contains that legacy literal.

Services:

Frontend: http://localhost:5173
Backend health: http://localhost:3000/api/health
PostgreSQL: localhost:5432

The repository intentionally uses the default Compose file for deterministic verification:

docker compose -f docker-compose.yml ...

Local docker-compose.override.yml files are ignored for verification and should not be committed.

Backend setup

Backend local development defaults are documented in:

backend/.env.example

Required local .env files are not committed.

After migrations, seed the first local admin and sample manual-test data:

cd backend
npm run prisma:seed

Default local seed values from backend/.env.example:

SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=admin12345
SEED_ADMIN_FULL_NAME=Local Admin

Override these values before seeding shared or non-local databases.

The seed is idempotent. Use SEED_ADMIN_RESET_PASSWORD=true only when intentionally rotating the existing seeded admin password.

Useful commands

Backend build:

npm --prefix backend run build

Frontend build:

npm --prefix frontend run build

Prisma validation:

cd backend
npx prisma validate

Docker verification:

scripts/openclaw-docker-verify.sh TASK-XXX

## MVP deployment notes

Production-oriented Compose and deployment guidance is documented in `docs/deployment.md`.

Before important changes, create both backups:

- PostgreSQL custom dump with `pg_dump` from the `postgres` Compose service.
- Uploaded-file copy/backup from the backend `/app/uploads` volume.

Production deployments must run behind HTTPS using a reverse proxy or another explicit external TLS layer. This is required for secure cookie behavior and authenticated admin sessions.

OpenClaw workflow

This project uses OpenClaw agents:

manager
backend
frontend

Manager orchestrates tasks. Backend/frontend implement. Repository scripts provide deterministic verification gates.

Tracked workflow docs:

docs/openclaw/manager-a2a-workflow.md
docs/openclaw/manager-bootstrap.md

Verification scripts:

scripts/openclaw-preflight.sh
scripts/openclaw-after-task-check.sh
scripts/openclaw-docker-verify.sh

The scripts verify repository and runtime state. They do not choose the next task or the implementation agent.

Manager chooses backend/frontend based on task meaning, PRD, tasks.json, dependencies, and acceptance criteria.

Task branch flow

Each task uses feature branch flow:

Start from main.
Create task/<TASK_ID>-<slug>.
Manager creates a coordination commit.
Backend or frontend creates implementation commits.
Manager verifies implementation.
Manager runs Docker verification when required.
Manager creates closure commit.
Task branch is merged into main with --no-ff.
main is pushed to origin.
Task branch remains open and pushed.
Docker verification gate

The approved Docker verification command is:

scripts/openclaw-docker-verify.sh <TASK_ID>

The script uses:

docker compose -f docker-compose.yml ...

It intentionally ignores docker-compose.override.yml.

The script checks:

Docker daemon access
Docker Compose availability
Compose build and startup
Backend health endpoint
Frontend availability
Frontend behavior while backend is stopped
Backend restart recovery
Clean git status after verification

Expected final output:

DOCKER_VERIFY_RESULT=PASS

or:

DOCKER_VERIFY_RESULT=FAIL
Security and local files

Do not commit:

.env
real passwords
API keys
Telegram/OpenClaw tokens
private runtime configuration
local Docker override files

Sensitive local files are intentionally kept outside git.

### Pre-commit secret scanner (BUG-REG-034 Stream B)

A gitleaks-based pre-commit hook blocks accidental commits of scale device
API tokens (43-char base64url from `createScaleApiToken()`), hardcoded
password literals, and gitleaks' default library (AWS / GCP / Azure / GitHub
/ Slack / JWT / PEM / generic high-entropy).

One-time setup after `git clone`:

```bash
# 1. install gitleaks
sudo apt-get install gitleaks     # Ubuntu/Debian (>= 24.04)
brew install gitleaks             # macOS
# or: https://github.com/gitleaks/gitleaks/releases

# 2. activate the repo-tracked hook
./scripts/install-hooks.sh
```

Hook entry point: `.githooks/pre-commit` · Config: `.gitleaks.toml` ·
Rule tests: `./scripts/test-secret-hook.sh`.

Bypass (last resort, NOT recommended for shared branches):

```bash
git commit --no-verify
```

## Public preview on VPS

For ad-hoc public preview on the VPS, use a local ignored `docker-compose.override.yml`.

Example:

```yaml
services:
  frontend:
    build:
      args:
        VITE_API_BASE_URL: "http://132.243.114.86:3000"
    environment:
      VITE_API_BASE_URL: "http://132.243.114.86:3000"

  backend:
    environment:
      FRONTEND_ORIGIN: "http://132.243.114.86:5173"
This file must stay local and ignored.

Public preview URLs:

Frontend: http://132.243.114.86:5173/
Backend health: http://132.243.114.86:3000/api/health

Update public preview after new changes:

git switch main
git pull --ff-only origin main
docker compose build --no-cache backend frontend
docker compose up -d

If Prisma migrations were added:

cd backend
npx prisma migrate deploy
cd ..
docker compose up -d

Deterministic manager verification intentionally ignores this override and uses:

docker compose -f docker-compose.yml ...

