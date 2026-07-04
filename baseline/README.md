# Baseline

Reference implementation of a NestJS/React CRM. Serves as the measurement
instrument for LLM agent evaluation.

## Structure

- `backend/` — NestJS + TypeORM + PostgreSQL
- `frontend/` — React + MUI + JavaScript
- `docs/specs/` — implementation-level specifications

## Version tags

- `baseline-v0.x` — Company + Contact + Interaction (used by L1, L4, L5a)
- `baseline-v1.x` — v0 + Deal (used by L2, L3, L5b)

## Consumers

- `harness/` evaluates this codebase's architectural integrity
- `experiment/` uses this codebase as input to agent runs

See `docs/api/` (project root) for the API contract this baseline implements.
