<!--
Task: T1
Variant: minimal
-->

## 1. Agent Role

You are a senior full-stack engineer working on a production-grade multi-tenant CRM built with NestJS using TypeScript (backend), React with MUI using JavaScript (frontend), and TypeORM with PostgreSQL.

## 2. Codebase Orientation

The backend CRM modules are under `backend/src/modules/`. Inspect the existing customer and Deal-related modules before making changes.

The frontend feature code is under `frontend/src/`. Inspect the current navigation, views, or components before extending the application.

Treat the current workspace as the source of truth. Build on the existing implementation and preserve existing externally observable behaviour unless this task explicitly requires a change.

## 3. Problem Statement

### Feature Request: Add Deal tracking to the CRM

### Background

A Deal represents a sales opportunity. It is fundamentally a relation: it links a value (numeric) and stage (string) to a specific Company. Optionally, a Deal may link to a Contact associated with that Company. Currently, our CRM only tracks Companies and Contacts, leaving sales opportunities undocumented in the system.

### Current Problem

Sales reps currently track opportunities in parallel spreadsheets because the CRM lacks a "pipeline" entity. This leads to data silos where (1) there is no system-level visibility into total pipeline value or activity, and (2) sales teams cannot associate sales engagement with specific revenue opportunities. The absence of this entity is a total blocker for pipeline reporting.

### Desired Outcome

Introduce the Deal entity in the CRM. The system must support CRUD operations for Deals, allowing them to be linked to Companies (mandatory) and Contacts (optional). The frontend must provide a dedicated list and detail view for Deals, supporting basic filtering by stage and Company. The initial seed data must be updated to include representative Deal records to ensure the development environment is immediately functional.

## 4. Requirements

Entity invariants

1. A Deal SHALL reference exactly one Company (required, uuid).
2. A Deal SHALL reference zero or one Contact (optional, uuid).
3. A Deal's value SHALL be a non-negative number.
4. A Deal's stage SHALL default to 'lead' when omitted on creation.
5. A Deal's expectedCloseDate SHALL be nullable.

Creation
 6. Creating a Deal SHALL persist all supplied fields and return the created Deal.
 7. Requests missing any of {name, value, companyId} SHALL return VALIDATION_ERROR.
 8. Requests referencing an unknown companyId SHALL return NOT_FOUND.
 9. Requests referencing an unknown contactId SHALL return NOT_FOUND.

Query
 10. Listing Deals SHALL support pagination by page and pageSize.
 11. Listing Deals SHALL support exact-match filter by stage.
 12. Listing Deals SHALL support filter by companyId.
 13. Requesting a page beyond the last SHALL return an empty items list, not an error.

Detail / Update
 14. Fetching a Deal SHALL return the Deal with the linked Company summary.
 15. Fetching a Deal by unknown id SHALL return NOT_FOUND.
 16. Updating a Deal SHALL accept any subset of mutable fields.
 17. Updating a Deal with an empty body SHALL return VALIDATION_ERROR.
 18. Updating with fields outside the Deal schema SHALL return VALIDATION_ERROR.

Edge cases
 19. A Deal with contactId=null SHALL render on all views (list, detail, form)
 without error.
 20. A Deal with expectedCloseDate=null SHALL render on all views without error.

UI

21. Users SHALL create and edit Deals from the same UI surface.

22. The Deals list SHALL be reachable from the primary navigation.

Data setup
 23. After 'demo' seed runs, at least 8 Deals SHALL exist across at least 4
 distinct stage values.
 24. After 'edge-case' seed runs, at least one Deal SHALL have contactId=null
 and at least one SHALL have expectedCloseDate=null.

## 5. API Contract

Determine any necessary API additions or modifications from the functional requirements.

Preserve existing public API behaviour unless a change is necessary to fulfil those requirements.

## 6. Architecture Rules

Apply these rules to all production code added or modified for this task. Do
not disable, suppress, or bypass the corresponding checks. Explicit task
requirements take precedence where a conflict exists.

### Backend

- **BE-STRUCT-C-001:** Each business module uses separate module, controller,
  service, and repository files.
- **BE-DEP-C-001:** Dependencies follow Controller → Service → Repository →
  Entity.
- **BE-DEP-C-002:** `src/common/` and `src/core/` must not import business
  implementations from `src/modules/`.
- **BE-DEP-C-003:** Guards, interceptors, and filters must not import
  module-specific entities or repositories.
- **BE-DEP-C-004:** Do not introduce circular imports.
- **BE-DOM-C-001:** Cross-module imports use only the target module's
  `.module.ts` or `index.ts` entry point.
- **BE-DOM-C-002:** Module entry points must not export repositories or
  entities.
- **BE-ERR-C-001:** Services must not throw NestJS `HttpException` classes.
- **BE-ERR-C-002:** Service failures use the project's `AppException`.
- **BE-ERR-C-003:** Catch blocks must handle, wrap, or rethrow errors; no
  silent or log-only catches.
- **BE-CONTRACT-C-001:** Persistent entity or relationship changes require a
  corresponding executable migration.
- **BE-CONTRACT-C-002:** Request DTOs use the project's `class-validator` and
  `ValidationPipe` mechanism.
- **BE-CONTRACT-C-003:** Optional request properties must validate supplied
  values; `@IsOptional()` alone is insufficient.
- **BE-CONTRACT-C-004:** Preserve input whitelisting and rejection of unknown
  request fields.
- **BE-TEST-C-001:** Services obtain repositories through dependency
  injection; do not call `new Repository(...)`.
- **BE-ROUTE-C-001:** Resolved public routes use the global `/api` prefix and
  kebab-case resource paths.
- **BE-SIZE-C-001:** Production methods have at most three direct parameters;
  group cohesive inputs in a DTO or parameter object.
- **BE-DUP-C-001:** Each business resource has one backend owner; do not create
  competing modules, controllers, routes, or entity-table owners.
- **BE-DUP-C-002:** Each business policy or invariant has one authoritative
  implementation; all entry points delegate to it.
- **BE-DUP-C-003:** Do not copy equivalent production functions or code
  blocks; reuse or extract an existing shared implementation.

### Frontend

- **FE-COM-C-001:** React component files contain at most 300 non-blank,
  non-comment lines.
- **FE-COM-C-002:** Business JSX nesting does not exceed five levels.
- **FE-STATE-C-001:** Components under `src/components/` and
  `src/layout/components/` must not introduce `useState` or `useReducer`.
- **FE-STATE-C-002:** Context providers appear only at the application root,
  route layouts, `src/providers/`, or `src/contexts/`.
- **FE-ROUTE-C-001:** Route definitions live under `src/routes/`.
- **FE-ROUTE-C-002:** Every route resolves to a page component.
- **FE-STYLE-C-001:** Do not use raw JSX `style`; use MUI or the established
  shared styling abstraction.
- **FE-STYLE-C-002:** Global styles live only under `src/styles/global/`.
- **FE-DATA-C-001:** Direct `fetch` or `axios` calls appear only in approved
  API service or data-hook modules.
- **FE-DATA-C-002:** Every `useEffect` declares all referenced reactive values
  in its dependency array.
- **FE-COMM-C-001:** Do not introduce a global event bus; use props, controlled
  context, or the established state mechanism.
- **FE-DUP-C-001:** Each resource has one frontend feature, route, page, and
  form owner; do not create competing feature directories or UI surfaces.
- **FE-DUP-C-002:** Frontend logic has one authoritative implementation.
  Repeated API, form, validation, transformation, state, component, function,
  or code-block logic belongs in a shared service, hook, component, or utility.

### Cross-Stack

- **CROSS-TYPE-C-001:** Frontend requests and response models match backend
  DTO names, types, requiredness, nullability, and enum values.
- **CROSS-EP-C-001:** Every frontend API URL resolves to an implemented
  backend route.
- **CROSS-ERR-C-001:** Every frontend-handled error code is defined and emitted
  by the backend.
- **CROSS-METHOD-C-001:** Frontend HTTP methods and expected statuses match
  the corresponding backend endpoints.
- **CROSS-NAME-C-001:** Use one canonical resource name across backend routes,
  modules, frontend features, API services, and UI terminology.
- **CROSS-PROP-C-001:** Propagate API-facing changes to every affected DTO,
  route, persistence artifact, frontend adapter, UI surface, seed, and test.
- **CROSS-DUP-C-001:** Each cross-stack contract has one authoritative source
  or an automated synchronization mechanism; do not maintain unsynchronized
  duplicate definitions.

## 7. Delivery & Verification Protocol:

- Work directly in the provided workspace. Implement the task by modifying the
  relevant project files; do not merely describe a proposed solution.

- Add or update focused functional tests for the behaviour introduced or changed
  by this task. Keep those tests in the project's existing test locations and
  run the relevant test suite before concluding.

- Before concluding, run the relevant functional tests and fix any failures,
  compilation errors, or regressions caused by your changes.

- Do not create Git commits or Git tags.

- When the implementation is complete and the relevant functional tests pass, respond with exactly `[TASK_COMPLETED]` and nothing else.
