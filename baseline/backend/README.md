# Baseline Backend

This backend is a NestJS + TypeORM + PostgreSQL service for the CRM baseline.

## 1. Project Structure

```text
backend/
├── src/
│   ├── app.module.ts              # Root module
│   ├── main.ts                    # App bootstrap
│   ├── common/                    # Shared errors, pipes, filters, utils
│   ├── core/
│   │   ├── database/              # Data source and migrations
│   │   └── seed/                  # Demo and edge-case seed scripts
│   └── modules/
│       ├── company/               # Company module
│       └── contact/               # Contact module
├── test/
│   ├── setup/                     # Test app and database helpers
│   ├── company.e2e-spec.ts
│   ├── contact.e2e-spec.ts
│   ├── migration.e2e-spec.ts
│   └── seed.e2e-spec.ts
├── package.json
└── tsconfig.json
```

## 2. How to Start the Project

### Prerequisites

- Node.js
- pnpm
- Docker

### Environment

The backend reads environment files from the baseline root, not only from `backend/`.

Recommended files:

- `baseline/.env.development`
- `baseline/.env.test`
- `baseline/.env.production`

The default development setup uses:

- API port: `3101`
- PostgreSQL port: `5434`

### Start the development database

From `baseline/`:

```bash
docker compose up -d postgres-dev
```

### Install dependencies

From `baseline/backend/`:

```bash
pnpm install
```

### Start the backend in development mode

From `baseline/backend/`:

```bash
pnpm start:dev
```

The API will be available at:

```text
http://localhost:3101/api
```

### Optional commands

Run migrations manually:

```bash
pnpm db:migrate:run
```

Run tests:

```bash
pnpm test:unit
pnpm test:e2e
pnpm test:baseline
```

## 3. How to Generate Demo Data

The backend provides seed scripts under `src/core/seed/`.

### Generate demo data without clearing existing rows

From `baseline/backend/`:

```bash
pnpm db:seed:demo
```

### Reset the business tables and generate demo data

This is the recommended command for a clean local dataset:

```bash
pnpm db:reset:seed:demo
```

### Generate edge-case data

```bash
pnpm db:seed:edge-case
```

Or reset first:

```bash
pnpm db:reset:seed:edge-case
```

### What the demo seed creates

The demo scenario creates:

- 10 companies
- 2 to 5 contacts per company
- mixed company statuses
- mixed industries
- recent `lastContactedAt` timestamps

### Notes

- Make sure the development database is running before seeding.
- Seed commands use the active environment configuration, so verify `DB_HOST`, `DB_PORT`, and `DB_DATABASE` first.
