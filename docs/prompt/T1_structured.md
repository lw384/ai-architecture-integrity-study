<!--
Task: T1
Variant: structured
Blocks enabled: 1, 2, 3, 4, 5, 6, 7 
Rule IDs targeted: 
Derived from: prompt_meta_template_v2.md
Source documents: 
Content hash (SHA-256 of blocks 3+4+5): [pending — must match T1_structured.md]
Frozen at: [pending — set at freeze commit]
-->

## 1. Agent Role

You are a senior full-stack engineer working on a production-grade multi-tenant CRM built with NestJS using TypeScript (backend), React with MUI using JavaScript (frontend), and TypeORM with PostgreSQL.

## 2. Codebase Orientation

Add code under `backend/src/module/deal/` and `frontend/src/pages/deals/`. See `backend/src/module/company/` and `frontend/src/pages/companies/` for the pattern. Shared backend utilities live in `backend/src/common/`. Global API prefix is `/api/v1`. Frontend API clients live under `frontend/src/api/`. Routes register in `frontend/src/routes/route-registry.js`. Seed lives at `backend/src/database/seed/seed.ts`.

## 3. Problem Statement

### Feature Request: Add Deal tracking to the CRM

### Background

A Deal represents a sales opportunity. It is fundamentally a relation: it links a value (numeric) and stage (string) to a specific Company. Optionally, a Deal may link to a Contact associated with that Company. Currently, our CRM only tracks Companies and Contacts, leaving sales opportunities undocumented in the system.

### Current Problem

Sales reps currently track opportunities in parallel spreadsheets because the CRM lacks a "pipeline" entity. This leads to data silos where (1) there is no system-level visibility into total pipeline value or activity, and (2) sales teams cannot associate sales engagement with specific revenue opportunities. The absence of this entity is a total blocker for pipeline reporting.

### Desired Outcome

Introduce the Deal entity as a first-class citizen in the CRM. The system must support CRUD operations for Deals, allowing them to be linked to Companies (mandatory) and Contacts (optional). The frontend must provide a dedicated list and detail view for Deals, supporting basic filtering by stage and Company. The initial seed data must be updated to include representative Deal records to ensure the development environment is immediately functional.

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

22. 22. The Deals list SHALL be reachable from the primary navigation.

Data setup
 23. After 'demo' seed runs, at least 8 Deals SHALL exist across at least 4
 distinct stage values.
 24. After 'edge-case' seed runs, at least one Deal SHALL have contactId=null
 and at least one SHALL have expectedCloseDate=null.

5. API Contract

The internal architecture, file structure, class names, and DTO definitions used to satisfy this contract are left to the implementer. All routes are relative to the global prefix `/api`.

### 1.Create Deal

**Route:** POST /api/deals

**Request:**

Content-Type: `application/json`

```json
name:              { type: string,       required: true,  maxLength: 255 }
value:             { type: number,       required: true,  min: 0 }
companyId:         { type: uuid-v4,      required: true,  refs: Company }
stage:             { type: string,       required: false, maxLength: 100, default: lead }
contactId:         { type: uuid-v4,      required: false, refs: Contact, nullable: true }
expectedCloseDate: { type: iso-8601-date, required: false, nullable: true }
```

example:

> `// required, non-empty string, max 255   "name": "Acme Q3 renewal",    // required, number, >= 0   "value": 50000,    // required, uuid v4; referenced Company must exist   "companyId": "a3f8c1e2-1234-5678-9abc-def012345678",    // optional, string, max 100; defaults to 'lead' when omitted   "stage": "qualified",    // optional, uuid v4; referenced Contact must exist when supplied   "contactId": "b4e9d2f3-1234-5678-9abc-def012345678",    // optional, ISO 8601 date; nullable   "expectedCloseDate": "2026-09-30"`

**Sucess Response:**

```json
{ "id": "<uuid>" }
```

Clients requiring full Deal state issue a subsequent `GET /api/deals/:id`.

**Error Response:**

| HTTP | code               | Trigger                                                                                                                                   |
| ---- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR` | body missing any of `name`, `value`, `companyId`; any field violates its stated constraint; body contains a field outside the allowed set |
| 404  | `PARENT_NOT_FOUND` | `companyId` does not reference an existing Company; `contactId` (when supplied) does not reference an existing Contact                    |

Example error response (unknown `companyId`):

```json
{
  "success": false,
  "statusCode": 404,
  "code": "PARENT_NOT_FOUND",
  "message": "Company with ID 8e2f... not found",
  "details": { "resource": "Company", "id": "8e2f..." },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "path": "/api/deals"
}
```

### 2. List Deals

**Route:** GET /api/deals

**Request:**

Unknown query params are rejected.

**Success Response:** `200 OK`

```js
{
  "items": [
    {
      "id": "<uuid>",
      "name": "<string>",
      "value": <number>,
      "stage": "<string>",
      "companyId": "<uuid>",
      "contactId": "<uuid> | null",
      "expectedCloseDate": "<ISO date> | null",
      "createdAt": "<ISO 8601>",
      "updatedAt": "<ISO 8601>"
    }
  ],
  "total": <int>,
  "page": <int>,
  "pageSize": <int>,
  "totalPages": <int>
}
```

Requesting a page beyond the last returns `items: []` with a correct `total` value

**Error Response:**

`400 VALIDATION_ERROR`: any query param violates its stated constraint; an unknown query param is present

### 3. Get Deal

Route: GET /api/deals/:id (Path params: `id` : uuid v4)

Request: No body, no query params.

Success Response:

```json
{
  "id": "<uuid>",
  "name": "<string>",
  "value": <number>,
  "stage": "<string>",
  "companyId": "<uuid>",
  "contactId": "<uuid> | null",
  "expectedCloseDate": "<ISO date> | null",
  "createdAt": "<ISO 8601>",
  "updatedAt": "<ISO 8601>",
  "company": {
    "id": "<uuid>",
    "name": "<string>"
  }
}
```

Error Response:

- 400`INVALID_UUID``:id` is not a valid UUID

- 404`ENTITY_NOT_FOUND`no Deal with the given id exists

### 4. Update Deal

**Route**: POST /api/deals/:id

**Request**: Content-Type: `application/json`

**Mutable fields**

```yaml
name:              { type: string,        maxLength: 255, minLength: 1 }
value:             { type: number,        min: 0 }
stage:             { type: string,        maxLength: 100 }
contactId:         { type: uuid-v4,       nullable: true,  refs: Contact }
expectedCloseDate: { type: iso-8601-date, nullable: true }
```

**Immutable and rejected fields**

```yaml
companyId:         { type: uuid-v4,       policy: reject-if-different }
id, createdAt, updatedAt, deletedAt: { policy: reject-always }
```

**Success Response**: `200 OK`

Example:

```js
{
  "id": "c5f0e3g4-9d3f-4a2e-9abc-def012345678",
  "name": "Acme Q3 renewal",
  "value": 55000,
  "stage": "proposal",
  "companyId": "a3f8c1e2-9d3f-4a2e-9abc-def012345678",
  "contactId": "b4e9d2f3-abcd-4b7c-8def-a12345678901",
  "expectedCloseDate": "2026-09-30",
  "createdAt": "2026-07-03T10:30:00.000Z",
  "updatedAt": "2026-07-19T14:22:11.000Z"
}
```

**Error Response**:

- 400`INVALID_UUID``:id` is not a valid UUID v4

- 400`VALIDATION_ERROR`body is empty (no mutable field after `companyId` silent-drop); body contains `id`, `createdAt`, or `updatedAt`; body contains a field outside the allowed set; a mutable field violates its constraint

- 422`IMMUTABLE_FIELD``companyId` supplied and differs from the stored value

- 404`ENTITY_NOT_FOUND`no Deal with the given id exists

- 404`PARENT_NOT_FOUND``contactId` supplied (non-null) and does not reference an existing Contact

```js
{
  "success": false,
  "statusCode": 422,
  "code": "IMMUTABLE_FIELD",
  "message": "The companyId field cannot be updated after creation.",
  "details": { "field": "companyId" },
  "timestamp": "2026-07-19T14:30:00.000Z",
  "path": "/api/deals/c5f0e3g4-1234-5678-9abc-def012345678"
}
```

## 6. Delivery & Verification Protocol:

You MUST write and execute functional tests (npm run test) to verify your implementation. You are responsible for fixing any compilation errors or failing tests before concluding.

Do NOT print raw source code, diffs, or design rationales. Modify the files directly in the workspace. Once your tests pass and the implementation is complete, output exactly [TASK_COMPLETED] on a new line and terminate your process immediately.