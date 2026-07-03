# CRM Baseline

This baseline project now supports the same deployment pattern used in EXCOFF_CRM-master:

- Dockerized backend and frontend
- PostgreSQL-backed persistence with TypeORM
- Single frontend entrypoint
- Frontend-to-backend access through `/api`
- Environment-specific root-level configuration for local and Docker runs

## Environment variables

The baseline project reads shared configuration from one of the root environment files, selected by `NODE_ENV`.

Available files:

- `.env.development` - local development defaults
- `.env.test` - isolated local test database defaults
- `.env.production` - production-oriented settings
- `.env` - optional fallback only

Available variables:

- `NODE_ENV` - active runtime environment (`development`, `test`, `production`)
- `CRM_BASELINE_BACKEND_PORT` - backend listen port and Docker published backend port
- `CRM_BASELINE_FRONTEND_DEV_PORT` - Vite dev server port
- `CRM_BASELINE_FRONTEND_PORT` - Docker published frontend port
- `CRM_BASELINE_POSTGRES_PORT` - Docker published PostgreSQL port
- `CRM_BASELINE_API_ORIGIN` - frontend dev proxy target
- `DB_HOST` - backend PostgreSQL host for local development
- `DB_PORT` - backend PostgreSQL port
- `DB_USERNAME` - PostgreSQL username
- `DB_PASSWORD` - PostgreSQL password
- `DB_DATABASE` - PostgreSQL database name
- `DB_SYNCHRONIZE` - TypeORM schema sync toggle

The PostgreSQL containers also read `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` from the same environment files.

The repository includes `.env.development`, `.env.test`, `.env.production`, and `.env.example` at the baseline root.

## Local development

Development backend:

```bash
cd backend
source ~/.nvm/nvm.sh
nvm use v20
pnpm install
pnpm run start:dev
```

The `start:dev` script sets `NODE_ENV=development`, so the backend loads `.env.development` automatically.

Frontend:

```bash
cd frontend
pnpm install
pnpm run dev
```

Default local URLs:

- Frontend dev server: http://localhost:5173
- Backend API: http://localhost:3101/api
- PostgreSQL: localhost:5434

The frontend dev server proxies `/api` requests to `http://localhost:3101`.

### Local test database

Start an isolated PostgreSQL instance for tests:

```bash
docker-compose --profile test up -d postgres-test
```

Test defaults:

- Backend API: http://localhost:3102/api
- Frontend dev server: http://localhost:5174
- PostgreSQL: localhost:5435

Commands that set `NODE_ENV=test` automatically use `.env.test`, including the backend Jest scripts.

## Docker

Start the development stack:

```bash
docker-compose up -d --build
```

Docker URLs:

- Frontend: http://localhost:8081
- Backend API: http://localhost:3101/api
- PostgreSQL: localhost:5434

Start only the local test database:

```bash
docker-compose --profile test up -d postgres-test
```

Stop services:

```bash
docker-compose down
```