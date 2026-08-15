# Baseline Frontend

This frontend is a Vite + React application for the CRM baseline.

## 1. Project Structure

```text
frontend/
├── src/
│   ├── index.jsx                 # App entry
│   ├── App.jsx                   # Root app providers
│   ├── api/                      # API client and request helpers
│   ├── assets/                   # Images and third-party static assets
│   ├── components/               # Shared UI components
│   ├── config/                   # Frontend config
│   ├── contexts/                 # React context providers
│   ├── hooks/                    # Reusable hooks
│   ├── layout/                   # Main layout and navigation UI
│   ├── pages/                    # Route pages
│   │   ├── companies/
│   │   ├── contacts/
│   │   └── dashboard/
│   ├── routes/                   # Router configuration
│   ├── styles/                   # Global styles
│   ├── test/                     # Frontend test setup
│   ├── themes/                   # MUI theme configuration
│   └── utils/                    # Utility helpers
├── mock/                         # Mock assets/data for local use
├── index.html                    # Vite HTML entry
├── vite.config.js                # Vite config and API proxy
├── package.json
└── Dockerfile
```

## 2. How to Start the Project

### Prerequisites

- Node.js
- pnpm
- Docker

### Environment

The frontend reads environment variables from the baseline root, not only from `frontend/`.

The development setup uses values from:

- `baseline/.env.development`

Important variables:

- `CRM_BASELINE_FRONTEND_DEV_PORT` for the Vite dev server
- `CRM_BASELINE_API_ORIGIN` for the backend API proxy target

By default:

- frontend dev server: `5173`
- backend API origin: `http://localhost:3101`

### Start the backend dependencies

The frontend expects the backend API to be available. A typical local startup sequence is:

From `baseline/`:

```bash
docker compose up -d postgres-dev
```

From `baseline/backend/`:

```bash
pnpm install
pnpm start:dev
```

### Install frontend dependencies

From `baseline/frontend/`:

```bash
pnpm install
```

### Start the frontend in development mode

From `baseline/frontend/`:

```bash
pnpm dev
```

Or:

```bash
pnpm start
```

The app will be available at:

```text
http://localhost:5173
```

### Build and preview

Build the production bundle:

```bash
pnpm build
```

Preview the built app locally:

```bash
pnpm preview
```

### Notes

- Vite proxies `/api/*` requests to `CRM_BASELINE_API_ORIGIN`.
- If you change backend or frontend ports, update the baseline root environment file before starting the app.
