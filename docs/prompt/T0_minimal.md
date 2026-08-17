<!--
Task: T0 (Pilot — add free-text notes field to Company)
Variant: minimal (T0 has no structured counterpart; pilot only)
Blocks enabled: 1, 2, 3, 4, 5, 7 (Block 6 absent — replaced by autonomy sentence)
Rule IDs targeted: none by design (T0 is pipeline validation, not IV manipulation)
Derived from: prompt_meta_template_v2.md
Source documents:
  - CRM_Scope_v2_Task_Design.docx (Sprint 0 — Pilot)
Purpose: Full end-to-end harness dry-run before T1–T5. Every pipeline stage
  (prompt load → agent call → code write → migration → backend tests → frontend
  tests → rulepack scan → cross-stack diff → report) must fire on a task cheap
  enough to iterate on.
Content hash (SHA-256 of blocks 3+4+5): [pending — set at freeze commit]
Frozen at: [pending — set at freeze commit]
-->

## 1. Agent Role

You are a senior full-stack engineer working on a production-grade multi-tenant CRM built with NestJS using TypeScript (backend), React with MUI using JavaScript (frontend), and TypeORM with PostgreSQL.

## 2. Codebase Orientation

The `company` module exists at `backend/src/module/company/`. Migrations are located at `backend/src/database/migrations/`; the seed entry point is `backend/src/database/seed/seed.ts`. Shared infrastructure at `backend/src/common/` includes `filter/http-exception.filter.ts` and `exceptions/` (contains an `EntityNotFoundException` mapping to HTTP 404 with `code: 'NOT_FOUND'`, and a `ValidationException` mapping to HTTP 400 with `code: 'VALIDATION_ERROR'`). Entry points: `main.ts` (global prefix `/api/v1`, global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted` enabled, global `HttpExceptionFilter`), `app.module.ts`. Frontend Company pages under `frontend/src/pages/companies/`; API client at `frontend/src/api/companyApi.js`.

## 3. Problem Statement

### Feature Request: Add a free-text notes field to Company

### Background

Sales reps and account managers accumulate context about each customer that does not fit into structured fields — "prefers phone over email", "budget cycle ends Q3", "usually decides after the CFO signs off". Today this context has no home in the CRM; reps write it into Contact records or scribble it in ticketing tools, both wrong places.

### Current Problem

Account-context notes are scattered across Contact records and external tools. When a rep leaves or hands over an account, the incoming rep has no consolidated place to read the account's history. This causes onboarding delays and repeat questions to the customer.

### Desired Outcome

The Company entity gains an optional free-text `notes` field. Reps view and edit these notes on the Company detail page. Existing data is preserved: every existing Company simply has `notes = null` after this change.

## 4. Requirements

### Target schema

1. Company SHALL gain a `notes` field: a nullable string with a maximum length of 1000 characters.

### Migration

2. After migration, every existing Company row SHALL have `notes = null`.
3. Re-running the migration against an already-migrated database SHALL succeed without error.

### Modified CRUD

4. `POST /companies` SHALL accept an optional `notes` field in the request body.
5. `PATCH /companies/:id` SHALL accept an optional `notes` field; supplying `null` SHALL clear the stored value; omitting the field SHALL leave the stored value unchanged.
6. `GET /companies/:id` SHALL return `notes` in the response body.
7. Each item in the response body of `GET /companies` SHALL include the `notes` field.

### Error semantics

8. Submitting `notes` longer than 1000 characters or of a non-string type SHALL return HTTP 400 with `code: 'VALIDATION_ERROR'`.

### Edge cases

9. A Company with `notes = null` SHALL render on the Company list and Company detail views without error.
10. A Company with `notes = ''` (empty string) SHALL be accepted on create and update, and stored as an empty string.

### UI acceptance

11. The Company detail page SHALL display the `notes` value in a text region, with a placeholder such as "No notes" when the value is null or empty.
12. The Company create and edit form SHALL include a multi-line text input bound to the `notes` field.

### Data setup

13. After the `demo` seed runs, at least two Companies SHALL have non-null `notes` values and at least two SHALL have `notes = null`.

## 5. API Contract

External API Contract. The internal file structure, class names, DTO definitions, and column specification used to satisfy this contract are left to the implementer. All routes are relative to the global prefix `/api`.

### Endpoint 1 — Create Company (field added)

- **Route:** `POST /companies`
- **Request body:** existing Company create fields **plus** `notes: string | null (optional, max 1000 chars)`.
- **201 response:** full Company object including `notes: string | null`.
- **400** `{ "code": "VALIDATION_ERROR", "error": "<message>" }` — `notes` exceeds max length, is a non-string, or the body carries other unknown fields.

### Endpoint 2 — Update Company (field added)

- **Route:** `PATCH /companies/:id`
- **Request body:** partial of Endpoint 1's body. Supplying `notes: null` clears the stored value. Omitting the `notes` field leaves the stored value unchanged.
- **200 response:** full Company object including `notes`.
- **400** `VALIDATION_ERROR`; **404** `{ "code": "NOT_FOUND", "error": "<message>" }` — the Company id is unknown.

### Endpoint 3 — Fetch Company (response shape adds field)

- **Route:** `GET /companies/:id`
- **200 response:** Company object with `notes: string | null` present.
- **404** `NOT_FOUND`.

### Endpoint 4 — List Companies (response shape adds field)

- **Route:** `GET /companies`
- **Query params:** existing filters unchanged.
- **200 response:** `{ "items": Company[], "total": int, "page": int, "pageSize": int }` — each `Company` includes `notes: string | null`.

## 6. Rules

Please determine the best internal code structure and patterns autonomously to fulfill the requirements.

## 7. Delivery / Meta

**Delivery & Verification Protocol.**

- **Autonomous Verification.** You MUST write and execute functional tests (`npm run test`) to verify your implementation. You are responsible for fixing any compilation errors or failing tests before concluding.
- **Architecture Blindness.** You are strictly forbidden from running architectural linters, dependency-cruisers, or custom rulepacks. Your task is to fulfill the functional requirements.
- **Output Discipline.** Do NOT print raw source code, diffs, or design rationales. Modify the files directly in the workspace.
- **Termination Signal.** Once your tests pass and the implementation is complete, output exactly `[TASK_COMPLETED]` on a new line and terminate your process immediately.
