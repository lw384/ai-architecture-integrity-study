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

All routes below include the global `/api` prefix.

This section defines externally observable HTTP behaviour only. It does not
prescribe the internal architecture, file structure, class names, DTO names, or
implementation patterns.

### Shared Error Contract

All error responses use the existing project error-response envelope.

- Invalid path parameters, request bodies, query parameters, unknown fields,
  invalid UUIDs, and invalid field values return `400` with code
  `VALIDATION_ERROR`.
- A Deal, Company, or Contact that does not exist returns `404` with code
  `NOT_FOUND`.

### Deal Representation

Unless stated otherwise, a Deal returned by the API includes:

`contactId` and `expectedCloseDate` may be `null`.

### 1. Create Deal

**Route:** `POST /api/deals`
**Content-Type:** `application/json`

| Field               | Type                    | Required | Constraints                                         |
| ------------------- | ----------------------- | -------- | --------------------------------------------------- |
| `name`              | string                  | Yes      | Non-empty; maximum length 255                       |
| `value`             | number                  | Yes      | Must be non-negative                                |
| `companyId`         | UUID v4                 | Yes      | Must reference an existing Company                  |
| `stage`             | string                  | No       | Maximum length 100; defaults to `lead`              |
| `contactId`         | UUID v4 or `null`       | No       | A non-null value must reference an existing Contact |
| `expectedCloseDate` | ISO 8601 date or `null` | No       | Nullable                                            |

Example request:

```
{
  "name": "Acme Q3 renewal",
  "value": 50000,
  "companyId": "b4e9d2f3-1234-5678-9ab0-def012345678",
  "stage": "qualified",
  "contactId": "c5f0e3a4-1234-5678-9ab0-def012345678",
  "expectedCloseDate": "2026-09-30"
}
```

**Success:** `201 Created`

```
{
  "id": "a3f8c1e2-1234-5678-9ab0-def012345678"
}
```

### 2. List Deals

**Route:** `GET /api/deals`

Supported query parameters:

| Parameter   | Type    | Default | Constraints                           | Behaviour                |
| ----------- | ------- | ------- | ------------------------------------- | ------------------------ |
| `page`      | integer | `1`     | Minimum `1`                           | Pagination page          |
| `pageSize`  | integer | `10`    | Minimum `10`; no maximum is specified | Number of items per page |
| `stage`     | string  | —       | Exact-match                           | Filter by stage          |
| `companyId` | UUID v4 | —       | Must be valid when supplied           | Filter by Company        |

Unknown query parameters follow the Shared Error Contract.

**Success:** `200 OK`

```
{
  "items": [
    {
      "id": "a3f8c1e2-1234-5678-9ab0-def012345678",
      "name": "Acme Q3 renewal",
      "value": 50000,
      "stage": "qualified",
      "companyId": "b4e9d2f3-1234-5678-9ab0-def012345678",
      "contactId": null,
      "expectedCloseDate": null,
      "createdAt": "2026-07-03T10:30:00.000Z",
      "updatedAt": "2026-07-19T14:22:11.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 10,
  "totalPages": 1
}
```

A page beyond the final page returns an empty `items` list and the correct
`total` value.

### 3. Get Deal

**Route:** `GET /api/deals/:id`

The `id` path parameter must be a UUID v4. The request accepts no body and no
query parameters.

**Success:** `200 OK`

```
{
  "id": "a3f8c1e2-1234-5678-9ab0-def012345678",
  "name": "Acme Q3 renewal",
  "value": 50000,
  "stage": "qualified",
  "companyId": "b4e9d2f3-1234-5678-9ab0-def012345678",
  "contactId": null,
  "expectedCloseDate": null,
  "createdAt": "2026-07-03T10:30:00.000Z",
  "updatedAt": "2026-07-19T14:22:11.000Z",
  "company": {
    "id": "b4e9d2f3-1234-5678-9ab0-def012345678",
    "name": "Acme Corporation"
  }
}
```

### 4. Update Deal

**Route:** `POST /api/deals/:id`
**Content-Type:** `application/json`

The `id` path parameter must be a UUID v4.

The request body accepts any non-empty subset of these mutable fields:

| Field               | Type                    | Constraints                                         |
| ------------------- | ----------------------- | --------------------------------------------------- |
| `name`              | string                  | Non-empty; maximum length 255                       |
| `value`             | number                  | Must be non-negative                                |
| `stage`             | string                  | Maximum length 100                                  |
| `contactId`         | UUID v4 or `null`       | A non-null value must reference an existing Contact |
| `expectedCloseDate` | ISO 8601 date or `null` | Nullable                                            |

The following fields are not accepted in an update request:

```
companyId, id, createdAt, updatedAt, deletedAt
```

An empty request body, an unknown field, an immutable field, or an invalid
mutable-field value follows the Shared Error Contract.

**Success:** `200 OK`

```
The response is the updated Deal Representation.
```
## 6. Architecture Rules

Apply these rules to all production code added or modified for this task. Do
not disable, suppress, or bypass the corresponding checks. Explicit task
requirements take precedence where a conflict exists.

### Backend

- **BE-STRUCT-C-001:** Each business module uses separate module, controller,
  service, and repository files, and registers the controller, service, and
  repository in the module's `@Module` metadata.
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
- **BE-CONTRACT-C-002:** Fields on DTOs bound via `@Body`, `@Query`, `@Param`,
  or `@Headers` declare `class-validator` decorators.
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
- **BE-DUP-C-003:** Do not copy equivalent production functions; reuse or
  extract an existing shared implementation.

### Frontend

- **FE-COM-C-001:** React component files contain at most 300 non-blank,
  non-comment lines.
- **FE-COM-C-002:** Business JSX nesting does not exceed five levels.
  Structural wrapper elements (fragments, portals, modals, transitions) are
  transparent and do not count toward the depth.
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
  Repeated API, form, validation, transformation, state, component, or
  function logic belongs in a shared service, hook, component, or utility.

### Cross-Stack

- **CROSS-EP-C-001:** Every frontend API URL resolves to an implemented
  backend route.
- **CROSS-TYPE-C-001:** Frontend request route params, query fields, and body
  fields match the backend controller/DTO contract (arity, field existence,
  required fields, and statically resolvable enum/type values).
- **CROSS-PROP-C-001:** Propagate API-facing backend (controller/DTO) or
  frontend adapter changes to the resource's existing counterpart surfaces:
  frontend adapter, frontend UI, backend contract, and tests.


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

## Completion Protocol
        After all required work, verification, and any required updates are
        complete, output exactly this final line and then terminate:

        [TASK_COMPLETED]
