<!--
Task: T1 (Deal CRUD — L1 Floor)
Variant: structured
Blocks enabled: 1, 2, 3, 4, 5, 6 (R1–R7), 7 (all sub-elements)
Rule IDs targeted (D3 = prompt-fixable): ARCH-1, ARCH-2, ARCH-4, WEB-1, WEB-2, WEB-4, WEB-6, WEB-7, WEB-8, WEB-9, WEB-10, STY-3, STY-5, BIZ-1, LLM-1, LLM-2
Derived from: prompt_meta_template_v3.md
Source documents: PRD_v1.docx §Customer, §Deal, §Contact; CRM_Scope_v2_Task_Design.docx §4.1; Rule_Registry_v0.1.md
Content hash (SHA-256 of Blocks 3+4+5): [pending — set at freeze commit]
Frozen at: [pending — set at freeze commit]
-->

## 1. Agent Role

You are a senior full-stack engineer working on a production-grade multi-tenant CRM built with **NestJS (backend)**, **React with MUI (frontend)**, **TypeScript throughout**, and **TypeORM with PostgreSQL**. The codebase enforces strict layered architecture: controllers orchestrate, services hold business logic, repositories are the only layer that touches the database.

## 2. Codebase Orientation

Add the Deal feature under `src/modules/deal/`. Follow the pattern established by the existing feature modules:

- **Reference pattern**: `src/modules/customer/` — complete module with `customer.controller.ts`, `customer.service.ts`, `customer.repository.ts`, `customer.entity.ts`, `dto/create-customer.dto.ts`, `dto/update-customer.dto.ts`, and co-located `*.spec.ts` tests.
- **Also see**: `src/modules/contact/` — a smaller module illustrating a foreign-key relationship to Customer.
- **Shared utilities**: `src/common/` — includes `exceptions/`, `filters/`, `pipes/`, and a `BaseRepository` in `src/common/db/base.repository.ts`.
- **Test utilities**: `test/utils/` — fixture builders (`makeCustomer`, `makeContact`), in-memory database setup, and common assertions.
- **Module registration**: register the new `DealModule` in `src/app.module.ts` following the pattern used for `CustomerModule` and `ContactModule`.

## 3. Problem Statement

### Add the Deal entity to the CRM

The CRM currently tracks Customers and Contacts, but there is no representation of sales opportunities. Sales users cannot record what they are selling, to whom, or at what stage of the sales process.

### Domain context

A **Deal** represents a sales opportunity linked to exactly one **Customer** and optionally to one **Contact** at that customer. Deals have a monetary value and progress through pipeline stages. In mature CRMs (Salesforce Opportunity, HubSpot Deal, Twenty Opportunity), Deals are the primary unit around which forecasting, quota tracking, and win-rate analytics are built.

Deals frequently exist in an incomplete state:
- A Deal may be created before a specific contact person has been identified (nullable `contactId`).
- A Deal may exist before a close date has been agreed with the customer (nullable `expectedCloseDate`).
- Deals in early stages may have a low-confidence `value` that the salesperson revises later.

This messiness is normal, not exceptional. The implementation must tolerate it end-to-end.

### Why now

Without a Deal entity the CRM cannot support any downstream feature — pipeline reporting, revenue forecasting, deal-stage automation, or customer health scoring all depend on Deals being a first-class entity.

### Success

`Deal` is a first-class entity with full CRUD support, correctly linked to Customer (required) and Contact (optional), following the module patterns already established by Customer and Contact.

## 4. Requirements

### Data model

- The `Deal` entity has the following fields:
  - `id`: UUID, primary key, generated.
  - `title`: string, required, non-empty, max length 200.
  - `value`: number, required, non-negative, may be zero, precision to 2 decimal places, stored in the customer's implicit currency (no explicit currency field in v1).
  - `stage`: string, required, default `'lead'`. In this task, `stage` is a free string — the state machine is introduced in a later task and MUST NOT be pre-implemented here.
  - `customerId`: UUID, required, foreign key to `Customer.id`. Deleting a Customer with associated Deals must fail with a business-rule violation, not cascade.
  - `contactId`: UUID, nullable, foreign key to `Contact.id`. When present, the Contact must belong to the same Customer as the Deal.
  - `expectedCloseDate`: ISO date string, nullable.
  - `createdAt`: timestamp, generated on insert.
  - `updatedAt`: timestamp, updated on every write.

### API endpoints

- `POST /deals` creates a new Deal. Returns 201 with the created Deal.
- `GET /deals` returns all Deals for the current tenant. Supports optional `?customerId=<uuid>` filter.
- `GET /deals/:id` returns a single Deal or 404 if not found.
- `PATCH /deals/:id` partially updates a Deal. Returns the updated Deal.
- `DELETE /deals/:id` deletes a Deal. Returns 204 on success.

### Behavioural invariants

- Creating a Deal with a non-existent `customerId` returns 404 (referencing a missing resource).
- Creating a Deal with a `contactId` that does not belong to the referenced `customerId` returns 422.
- Providing `contactId: null` explicitly, or omitting the field, are both accepted and both result in a Deal with no contact.
- `PATCH /deals/:id` must accept partial updates — sending only `{ "stage": "qualified" }` must not overwrite `title` or `value`.
- The list endpoint's response includes deals in insertion order (by `createdAt` ascending) unless filtering is applied.

### Testing

- Unit tests must cover: (a) at least one happy path per endpoint; (b) at least one edge case per endpoint (empty title, negative value, null contactId with the Deal still created, filter with no matches); (c) at least one error case per endpoint (missing customerId, mismatched contactId, non-existent Deal on GET/PATCH/DELETE).

## 5. Interface

The following public signatures must be present. Unit tests target these exact names.

**Controller** — `src/modules/deal/deal.controller.ts`:

```
class DealController
  create(dto: CreateDealDto): Promise<DealResponseDto>
  findAll(customerId?: string): Promise<DealResponseDto[]>
  findOne(id: string): Promise<DealResponseDto>
  update(id: string, dto: UpdateDealDto): Promise<DealResponseDto>
  remove(id: string): Promise<void>
```

**Service** — `src/modules/deal/deal.service.ts`:

```
class DealService
  create(dto: CreateDealDto): Promise<Deal>
  findAll(filter?: { customerId?: string }): Promise<Deal[]>
  findOne(id: string): Promise<Deal>
  update(id: string, dto: UpdateDealDto): Promise<Deal>
  remove(id: string): Promise<void>
```

**Repository** — `src/modules/deal/deal.repository.ts`:

```
class DealRepository extends BaseRepository<Deal>
  findByCustomer(customerId: string): Promise<Deal[]>
```

**DTOs** — `src/modules/deal/dto/`:

```
class CreateDealDto
  title: string
  value: number
  stage?: string
  customerId: string
  contactId?: string | null
  expectedCloseDate?: string | null

class UpdateDealDto (all fields optional)

class DealResponseDto (mirrors Deal entity)
```

## 6. Rules

### R1 — Architectural Constraints

- Controllers only orchestrate: receive HTTP, call one service method, map result to the response DTO, translate exceptions to HTTP status codes.
- Business logic (referential integrity checks, contact-belongs-to-customer verification) lives in `DealService`, not the controller.
- Only `DealRepository` and other repositories touch the database via TypeORM.
- No upward imports: `DealService` must not import `DealController`; `DealRepository` must not import `DealService`.
- No circular dependencies between modules.
- The frontend, if updated in this task, consumes the backend only through `src/services/api/`.

### R2 — HTTP / REST Conventions

- GET is safe and idempotent. `GET /deals` and `GET /deals/:id` must not modify server state under any code path.
- POST for creation. PATCH for partial update. DELETE for removal. Do not overload GET with side effects.
- URLs use plural nouns: `/deals`, not `/deal` or `/getDeals`. Nesting depth ≤ 2.
- Status codes: 201 (created), 200 (ok), 204 (no content, for successful delete), 400 (malformed body), 404 (missing resource), 409 (state conflict — e.g., delete blocked by references), 422 (semantic validation failure — e.g., mismatched contact/customer).

### R3 — Error Handling

- Throw domain exceptions from `DealService`. Use `EntityNotFoundException` (for missing Customer, Contact, or Deal), `BusinessRuleViolationException` (for contact-customer mismatch, or delete blocked by references). Both live in `src/common/exceptions/`.
- Do not throw raw `HttpException` from controller or service.
- The global `HttpExceptionFilter` at `src/common/filters/http-exception.filter.ts` maps domain exceptions to status codes. Do not construct error response bodies manually.
- All error responses follow `{ error: { code, message, details? } }`.

### R4 — DTO Validation

- `CreateDealDto` and `UpdateDealDto` use class-validator decorators. Do not read from `req.body` directly.
- DTOs live in `src/modules/deal/dto/`.
- Global `ValidationPipe` runs with `{ whitelist: true, forbidNonWhitelisted: true }` — undeclared fields in the request are rejected.
- If a frontend API client type for Deal exists, ensure it matches `DealResponseDto` field-for-field.

### R5 — Naming and Style

- TypeScript strict mode is on. Do not use `any`; if inference fails, use `unknown` and narrow with a type guard.
- camelCase for variables, functions, properties; PascalCase for classes, DTOs, entities; SCREAMING_SNAKE for constants.
- Prefer `interface` for object shapes without methods; `type` for unions and utility types.
- Import order: framework/library first, then internal module imports, then relative imports; alphabetical within each group.

### R6 — Anti-Shortcut Warning

Even for a straightforward CRUD, do not skip the layers. Specifically: do not perform the contact-belongs-to-customer check with an inline TypeORM query in the controller; route it through `ContactRepository` (or an equivalent service call) from inside `DealService`. Do not manually construct SQL to fetch Deal + Customer + Contact together in one query — the aggregation, if needed, is a service-layer concern using injected repositories.

### R7 — Completeness

- No stub methods. No `throw new Error('Not implemented')`.
- Handle null / undefined / empty results explicitly. `findAll` with no results returns `[]`, not `null` or `undefined`.
- Every code path handles error responses from injected repositories. Silent try-catch that swallows errors is forbidden.
- Each new service method has at least three tests: one happy path, one edge case (as listed in Requirements), one error case.

## 7. Delivery / Meta

### Output format

When done, list every file you created or modified with its full path relative to the repository root. Do not include commit messages, changelogs, or design-rationale prose — the evaluation harness reads code changes, not narration.

### Testing expectation

Write Vitest tests co-located with the modified files (`*.spec.ts` next to each source file). Cover: (a) the happy path with realistic fixture data; (b) at least one edge case (empty title, null contactId, filter with no matches); (c) at least one error case (missing customer, mismatched contact, deleting a non-existent Deal). Use the fixture builders and test utilities in `test/utils/`. Do not modify existing tests unless a requirement explicitly requires it.
