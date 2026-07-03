<!--
Task: T1 (Deal CRUD — L1 Floor)
Variant: minimal
Blocks enabled: 1, 2, 3, 4, 5, 7 (output format + weak testing expectation)
Blocks omitted: 6 (Rules R1–R7), 7.c (Sequence Continuity — T4 only)
Derived from: prompt_meta_template_v3.md
Source documents: PRD_v1.docx §Customer, §Deal, §Contact; CRM_Scope_v2_Task_Design.docx §4.1; Rule_Registry_v0.1.md
Content hash (SHA-256 of Blocks 3+4+5): [pending — MUST equal T1_structured.md hash]
Frozen at: [pending — set at freeze commit]
-->

## 1. Agent Role

You are a full-stack engineer working on a CRM app using NestJS, React, and TypeScript.

## 2. Codebase Orientation

Add the Deal feature under `src/modules/deal/`. See `src/modules/customer/` for the pattern. Shared utilities in `src/common/`. Test utilities in `test/utils/`. Register the new module in `src/app.module.ts`.

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

## 7. Delivery / Meta

### Output format

When done, list every file you changed with its full path relative to the repo root. No commit messages, no explanations.

### Testing expectation

Add tests where appropriate.
