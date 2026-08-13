# Deal API

> **Resource**: `/api/v1/deals`
> 
> **Available in**: `baseline-v1` **only**. `baseline-v0` does not include this
> resource — implementing it end-to-end is the L1 experimental task
> (`CRM_Scope §5.1`: 'Deal is NOT included so L1/L4 can use its implementation
> as the experimental task').
> 
> **Prerequisites**: [principles.md](./principles.md), [company.md](./company.md),
> [contact.md](./contact.md), [cross-entity.md](./cross-entity.md).
> 
> **Source lineage**: `PRD_v2.docx §2.5` (Deal row); `CRM_Scope_v2_Task_Design.docx
> §2.1` (Deal row, unchanged by the v2 naming migration — Deal did not carry
> "Customer" in its own name); `§4.1` (L1 task specification);
> `T1_minimal.md`, `T1_structured.md`.
> 
> **Real-world CRM equivalent**: Salesforce Opportunity, HubSpot Deal,
> Twenty Opportunity.
> 
> **Naming note (v2)**: the FK field is `companyId` (v1 called it
> `customerId`). See `PRD_v2 §1.2.1` for the migration rationale and
> [company.md](./company.md) for the entity this FK now points to.

---

## 1. Domain Description

A **Deal** is a **sales opportunity** — a potential unit of revenue in some
stage of the pipeline. Deals link to one Company (required) and optionally
one Contact at that Company. They carry a monetary value and progress through
pipeline stages.

**Why Deal matters to the study**: without a Deal entity the CRM cannot
support pipeline reporting, revenue forecasting, deal-stage automation, or
company health scoring (`T1_minimal.md §3`). All downstream experimental
tasks (L2 state machine, L3 health score, L4 sequence) depend on Deal being a
first-class entity.

**Baseline-v1 posture on `stage`**: `stage` is a **free string** with default
`'lead'`. **No state machine is implemented in the baseline.** L2 introduces
the state machine (`lead → qualified → proposal → negotiation →
closed-won | closed-lost` with preconditions); if the baseline pre-implements
it, L2 loses its experimental content (`CRM_Scope §4.2`, `T1_minimal.md §4`,
[cross-entity.md X-5](./cross-entity.md#x-5-dealstage-state-machine)).

---

## 2. Entity Schema (baseline v1)

| Field               | Type                               | Constraints                   | Mutability                 | Semantics                                             |
| ------------------- | ---------------------------------- | ----------------------------- | -------------------------- | ----------------------------------------------------- |
| `id`                | `string` (UUID v4)                 | server-generated              | read-only                  | Primary key                                           |
| `title`             | `string`                           | 1..200, non-empty after trim  | read-write                 | Deal name                                             |
| `value`             | `number`                           | ≥ 0, 2 decimals               | read-write                 | Monetary value in the Company's implicit currency     |
| `stage`             | `string`                           | free string, default `'lead'` | read-write                 | See §4                                                |
| `companyId`         | `string` (UUID v4)                 | required, FK → Company        | **immutable after create** | The seller sees which Company; changing it = new deal |
| `contactId`         | `string \| null` (UUID v4 or null) | nullable, FK → Contact        | read-write                 | See §5                                                |
| `expectedCloseDate` | `string (YYYY-MM-DD) \| null`      | date-only (not datetime)      | read-write                 | Optional forecast close                               |
| `createdAt`         | `string (ISO 8601)`                | UTC                           | read-only                  | Server-generated                                      |
| `updatedAt`         | `string (ISO 8601)`                | UTC                           | read-only                  | Server-updated                                        |

**Currency**: no `currency` field in v1. All values are in the Company's
implicit currency (in practice, a single-tenant single-currency deployment).
Multi-currency support is a real-world CRM feature but adds implementation
weight orthogonal to architectural conformance (`CRM_Scope §6.2` rationale for
excluded features).

**Deliberately absent in baseline-v1** (introduced later):

- `stageChangedAt` — added in **L2** with the state machine.
- `owner` / `assignedTo` — no ownership in scope.
- `probability` / `weightedValue` — reporting concepts, out of scope.

---

## 3. Endpoints

Endpoints match `T1_minimal.md §4` in substance; method shape follows the v2
POST convention (`principles.md §3.1`) rather than v1's PATCH.

| Method   | Path         | Summary        | Success                     | Error responses     |
| -------- | ------------ | -------------- | --------------------------- | ------------------- |
| `POST`   | `/deals`     | Create a deal  | `201` + `Deal` + `Location` | `400`, `404`, `422` |
| `GET`    | `/deals`     | List deals     | `200` + `DealList`          | `400`               |
| `GET`    | `/deals/:id` | Get one deal   | `200` + `Deal`              | `400`, `404`        |
| `POST`   | `/deals/:id` | Partial update | `200` + `Deal`              | `400`, `404`, `422` |
| `DELETE` | `/deals/:id` | Delete a deal  | `204`                       | `400`, `404`        |

**On the POST double role**: see
[principles.md §3.1](./principles.md#31-the-post-double-role-convention).
`POST /deals` (no `:id`) creates; `POST /deals/:id` updates. `T1_minimal.md`
predates this convention and still shows `PATCH /deals/:id` in its interface
table — the T1 prompt must be re-frozen to `POST /deals/:id` before the next
pilot run (see §12 for the full pre-freeze checklist).

**No child entities in baseline-v1**, so `DELETE /deals/:id` never returns
`409`. (L4.2 adds `Interaction.dealId`; from that point onward, `DELETE
/deals/:id` acquires child-handling semantics — that is an experimental
extension, not baseline.)

---

## 4. `stage` — Free String, With Discipline

The `stage` field is a free string in baseline-v1. This is a **deliberate
weakness** — the point of L2 is to observe whether the agent can refactor
free strings into a state machine cleanly. Two disciplines apply
nonetheless:

1. **Default on create**: if `POST /deals` body omits `stage`, server sets
   `'lead'`.
2. **Non-empty on set**: explicit `stage: ""` → `422 EMPTY_STRING`. Explicit
   `stage: null` → `400 INVALID_TYPE` (stage is required, not nullable).

Baseline **does not** validate `stage` against any enum. `POST /deals {
stage: "martian-invasion" }` is accepted. This is the L2 experimental
starting point ([cross-entity.md X-5](./cross-entity.md#x-5-dealstage-state-machine)).

---

## 5. `contactId` — The Nullable Cross-Reference

`contactId` is nullable and, when present, must satisfy: `Contact.companyId
== Deal.companyId`. This is the **canonical cross-entity mismatch case** and
one of the four T1 behavioural invariants (`T1_minimal.md §4`).

**This is the site where the X-3 rule was first specified** (see
[cross-entity.md X-3](./cross-entity.md#x-3-nullable-contactid-must-belong-to-parent-companyid)).
`Interaction.contactId` (introduced in the same v2 migration; see
[interaction.md §4](./interaction.md#4-the-new-contactid-field-v2-addition))
applies the identical rule at a structurally distinct site. The two
occurrences of X-3 form a matched pair used to probe whether an agent that
correctly implements the rule once (on Deal, in L1) generalises it correctly
a second time (to Interaction, if a later task requires it) — see
[cross-entity.md §4.3](./cross-entity.md#43-x-3-as-a-generalisation-probe-creative-extension).

Behaviour matrix:

| Request state | `contactId` value          | `Contact.companyId` value | Response                                                  |
| ------------- | -------------------------- | ------------------------- | --------------------------------------------------------- |
| POST          | absent                     | —                         | 201, `contactId: null`                                    |
| POST          | `null`                     | —                         | 201, `contactId: null`                                    |
| POST          | valid UUID, Contact exists | == request's `companyId`  | 201, `contactId: <uuid>`                                  |
| POST          | valid UUID, Contact exists | ≠ request's `companyId`   | 422 `CROSS_ENTITY_MISMATCH`                               |
| POST          | valid UUID, Contact absent | —                         | 404 `PARENT_NOT_FOUND` (referencedFrom: `Deal.contactId`) |
| POST          | not a UUID                 | —                         | 400 `INVALID_UUID`                                        |

For `POST /deals/:id` (update):

- Explicitly setting `contactId: null` = "clear the contact".
- Setting `contactId` to a UUID: same matrix as create, cross-check uses the
  **current stored `companyId`** (recall `companyId` is immutable).

**Externalised interaction with `ContactService.remove`**: when a Contact is
deleted, `Deal.contactId` referencing it is nulled by
`DealService.detachContact`, called by `ContactService.remove` alongside the
symmetric call into `InteractionService.detachContact` — see
[cross-entity.md X-6](./cross-entity.md#x-6-delete-contact--null-referencing-fks)
for the full **dual-detach** specification introduced in v2.

---

## 6. DTOs

### 6.1 `CreateDealDto`

```typescript
class CreateDealDto {
  @IsString() @Length(1, 200)
  @Transform(({ value }) => value?.trim())
  title!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value!: number;

  @IsOptional() @IsString() @Length(1, 100)
  stage?: string;   // defaults to 'lead' in service if omitted

  @IsUUID('4')
  companyId!: string;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID('4')
  contactId?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null)
  @IsDateString({ strict: true })   // YYYY-MM-DD
  expectedCloseDate?: string | null;
}
```

### 6.2 `UpdateDealDto`

```typescript
class UpdateDealDto {
  // companyId absent — immutable, see §2 and principles.md §3.1

  @IsOptional() @IsString() @Length(1, 200)
  @Transform(({ value }) => value?.trim())
  title?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  value?: number;

  @IsOptional() @IsString() @Length(1, 100)
  stage?: string;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID('4')
  contactId?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString({ strict: true })
  expectedCloseDate?: string | null;
}
```

`UpdateDealDto` is consumed by the `POST /deals/:id` handler (not a separate
`PATCH` handler — there is only one route per resource-with-id, and its verb
is `POST`).

### 6.3 `DealResponseDto`, `DealListResponseDto`

Mirror the entity and pagination envelope respectively.

---

## 7. Endpoint Details

### 7.1 `POST /deals` (create)

**Request**:

```http
POST /api/v1/deals
Content-Type: application/json

{
  "title": "Acme Enterprise Renewal",
  "value": 25000.00,
  "companyId": "a3f8c1e2-...",
  "contactId": "b4e9d2f3-...",
  "expectedCloseDate": "2026-09-30"
}
```

**Response** (`201`):

```http
HTTP/1.1 201 Created
Location: /api/v1/deals/c5f0e3g4-1234-5678-9abc-def012345678
Content-Type: application/json

{
  "id": "c5f0e3g4-1234-5678-9abc-def012345678",
  "title": "Acme Enterprise Renewal",
  "value": 25000.00,
  "stage": "lead",
  "companyId": "a3f8c1e2-...",
  "contactId": "b4e9d2f3-...",
  "expectedCloseDate": "2026-09-30",
  "createdAt": "2026-07-02T10:30:00.000Z",
  "updatedAt": "2026-07-02T10:30:00.000Z"
}
```

**Errors**:

| Code                    | Trigger                                           | HTTP |
| ----------------------- | ------------------------------------------------- | ---- |
| `MALFORMED_BODY`        | Body not JSON                                     | 400  |
| `INVALID_UUID`          | `companyId` or `contactId` not UUID v4            | 400  |
| `INVALID_TYPE`          | Field of wrong type                               | 400  |
| `INVALID_DATE_FORMAT`   | `expectedCloseDate` not `YYYY-MM-DD`              | 400  |
| `EMPTY_STRING`          | `title` trims to empty                            | 422  |
| `NEGATIVE_VALUE`        | `value < 0`                                       | 422  |
| `PARENT_NOT_FOUND`      | `companyId` valid UUID but Company absent         | 404  |
| `PARENT_NOT_FOUND`      | `contactId` valid UUID but Contact absent         | 404  |
| `CROSS_ENTITY_MISMATCH` | Contact exists but belongs to a different Company | 422  |

### 7.2 `GET /deals`

**Query parameters**:

| Param       | Type   | Default                            | Values                                             |
| ----------- | ------ | ---------------------------------- | -------------------------------------------------- |
| `companyId` | UUID   | (no filter)                        | Filter to one Company's Deals                      |
| `stage`     | string | (no filter)                        | Exact match; free string in baseline-v1            |
| `sort`      | enum   | `createdAt`                        | `title`, `value`, `createdAt`, `expectedCloseDate` |
| `order`     | enum   | `asc` unfiltered / `desc` filtered | see note below                                     |
| `limit`     | int    | `20`                               | 1..100                                             |
| `offset`    | int    | `0`                                | ≥ 0                                                |

**Default order note**: `T1_minimal.md §4` requires "insertion order (by
`createdAt` ascending) unless filtering is applied". The baseline reconciles
this with the general list convention (desc default; see
[principles.md §7](./principles.md#7-pagination-filtering-sorting)) by making
the default sort direction **task-specific**: unfiltered list = `createdAt
ASC` (insertion order), filtered list = `createdAt DESC`
(most-recent-first). This mild inconsistency is intentional and documented;
`T1_minimal.md` specifies the ASC default explicitly.

Sorting by `expectedCloseDate` places `null` values last regardless of order
direction (same rule as `Company.lastContactedAt`; see
[company.md §5.2](./company.md)).

### 7.3 `GET /deals/:id`

Standard. `INVALID_UUID`, `ENTITY_NOT_FOUND`.

### 7.4 `POST /deals/:id` (partial update)

Semantics standard (see [principles.md §3.1](./principles.md#31-the-post-double-role-convention)).

`POST /deals/:id` cannot update `companyId` (immutable, `422
IMMUTABLE_FIELD`). It **can** update `contactId` — either to another valid
Contact of the same Company (`422 CROSS_ENTITY_MISMATCH` otherwise), or to
`null` (clear).

**Partial-update discipline** (from `T1_minimal.md §4`): sending only
`{ "stage": "qualified" }` must not overwrite `title` or `value`. This is a
critical behavioural invariant — several LLM-generated implementations in
pilot studies incorrectly used `save()` on a partial DTO, silently nulling
untouched fields.

### 7.5 `DELETE /deals/:id`

Standard. Returns `204` on success, `404` if absent.

---

## 8. Behavioural Invariants

Numbered `I-D-N`. `T1_minimal.md §4` bullets are the authoritative source;
this table extends them with numbering and testability notes, and marks
which invariants changed under the v2 migration.

| ID       | Invariant                                                                                                                                                                                         | Tested by                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `I-D-1`  | `POST /deals` with non-existent `companyId` → `404 PARENT_NOT_FOUND`                                                                                                                              | Integration              |
| `I-D-2`  | `POST /deals` with `contactId` whose Contact belongs to a different Company → `422 CROSS_ENTITY_MISMATCH`                                                                                         | Integration              |
| `I-D-3`  | `POST /deals` with `contactId: null` (explicit) or `contactId` omitted → 201 with `contactId: null`                                                                                               | Unit                     |
| `I-D-4`  | `POST /deals` with `value: 0` succeeds (low-confidence early deal)                                                                                                                                | Unit                     |
| `I-D-5`  | `POST /deals` with `value: -1` → `422 NEGATIVE_VALUE`                                                                                                                                             | Unit                     |
| `I-D-6`  | `POST /deals` with `value: 25.999` → `400 INVALID_TYPE` (too many decimals)                                                                                                                       | Unit                     |
| `I-D-7`  | `POST /deals` omitting `stage` → 201 with `stage: 'lead'`                                                                                                                                         | Unit                     |
| `I-D-8`  | `POST /deals` with arbitrary `stage: 'martian-invasion'` succeeds in baseline-v1                                                                                                                  | Unit                     |
| `I-D-9`  | `POST /deals/:id` with only `{ stage: 'qualified' }` does not overwrite other fields                                                                                                              | Unit + integration       |
| `I-D-10` | `POST /deals/:id` body containing `companyId` → `422 IMMUTABLE_FIELD`                                                                                                                             | Unit                     |
| `I-D-11` | `GET /deals` with no filter returns deals in `createdAt ASC` order                                                                                                                                | Integration              |
| `I-D-12` | `GET /deals?companyId=<uuid>` returns deals in `createdAt DESC` order by default                                                                                                                  | Integration              |
| `I-D-13` | Sort by `expectedCloseDate` places `null` last in both directions                                                                                                                                 | Integration              |
| `I-D-14` | `DELETE /deals/:id` succeeds and returns 204 with no body                                                                                                                                         | Integration              |
| `I-D-15` | **(v2)** Deleting a Contact nulls `Deal.contactId` values pointing to it **and simultaneously** nulls `Interaction.contactId` values pointing to it (dual-detach, X-6)                            | Integration cross-module |
| `I-D-16` | **(v2)** `POST /deals/:id` on a resource whose only change is a read-only field (e.g. attempting to set `createdAt`) is silently stripped, and if that leaves the body empty → `400 EMPTY_UPDATE` | Unit                     |

---

## 9. Interface Signatures

Adapted from `T1_minimal.md §5` — the agent's tests will target these exact
names. **The v1 prompt still lists `update` under a PATCH framing implicitly
via HTTP-agnostic method names** (`update(id, dto)`), so the TypeScript
signature itself is unaffected by the v2 HTTP-method migration; only the
routing decorator changes (`@Patch()` → `@Post(':id')`).

**Controller** — `src/modules/deal/deal.controller.ts`:

```typescript
@Controller('deals')
class DealController {
  @Post()
  create(dto: CreateDealDto): Promise<DealResponseDto>

  @Get()
  findAll(companyId?: string): Promise<DealResponseDto[]>

  @Get(':id')
  findOne(id: string): Promise<DealResponseDto>

  @Post(':id')                              // v2: was @Patch(':id') in v1
  update(id: string, dto: UpdateDealDto): Promise<DealResponseDto>

  @Delete(':id')
  remove(id: string): Promise<void>
}
```

> **Note on signature style**: `T1_minimal.md` specifies `findAll(companyId?:
> string): Promise<DealResponseDto[]>` — array return, not paginated
> envelope. This is a **deliberate concession to the T1 minimum viable
> task**; the `T1_structured.md` variant may extend it to a paginated
> envelope, and L4/L5 may unify all list endpoints. The baseline-v1
> implementation follows T1 exactly (array return) to serve as the direct
> reference for L2/L3, and the other three entities' paginated envelopes are
> documented deviations. L4.8 ("unified error format across ALL endpoints")
> is a natural moment for the agent to also unify list envelopes — an
> emergent architectural decision the harness observes but does not directly
> score.

**Service** — `src/modules/deal/deal.service.ts`:

```typescript
class DealService {
  create(dto: CreateDealDto): Promise<Deal>
  findAll(filter?: { companyId?: string }): Promise<Deal[]>
  findOne(id: string): Promise<Deal>
  update(id: string, dto: UpdateDealDto): Promise<Deal>
  remove(id: string): Promise<void>

  // Called by ContactService.remove — see cross-entity.md X-6
  detachContact(contactId: string): Promise<void>
}
```

**Repository** — `src/modules/deal/deal.repository.ts`:

```typescript
class DealRepository extends BaseRepository<Deal> {
  findByCompany(companyId: string): Promise<Deal[]>
  findByContact(contactId: string): Promise<Deal[]>
  countByCompany(companyId: string): Promise<number>
}
```

**Entity** — `src/modules/deal/deal.entity.ts`:

```typescript
@Entity('deals')
class Deal {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  value: number;

  @Column({ length: 100, default: 'lead' })
  stage: string;

  @Column('uuid') companyId: string;

  @Column({ type: 'uuid', nullable: true })
  contactId: string | null;

  @Column({ type: 'date', nullable: true })
  expectedCloseDate: string | null;

  @ManyToOne(() => Company, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @ManyToOne(() => Contact, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'contactId' })
  contact: Contact | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
```

Note the ORM-level `onDelete` behaviours: Company → `RESTRICT` mirrors X-1;
Contact → `SET NULL` mirrors X-6. Both are defence-in-depth; the primary
mechanism in both cases is the service layer, so the tests exercise the
service path and treat the DB constraint as a documented fallback rather
than a separately asserted behaviour.

---

## 10. Frontend API Client Contract

`frontend/src/services/api/deal.api.js`:

```javascript
export const dealsApi = {
  list: (params) => Promise<Deal[]>,             // → GET /api/v1/deals
  get: (id) => Promise<Deal>,                     // → GET /api/v1/deals/:id
  create: (dto) => Promise<Deal>,                 // → POST /api/v1/deals
  update: (id, dto) => Promise<Deal>,             // → POST /api/v1/deals/:id
  remove: (id) => Promise<void>,                  // → DELETE /api/v1/deals/:id
};
```

The array return of `list` matches T1's controller signature. This may be
refactored to envelope form in L4.8; the L2 agent should not touch it (its
scope is the state machine, not list-shape).

Types generated from `openapi.yaml`. The `stage` field is typed as `string`
in v1 (free string); L2 changes it to a union enum, and the type update is
part of L2's success criteria. **The `update` function must emit `POST
/deals/:id`**, not `PATCH` — see the frontend-side PATCH detector described
in [company.md §9](./company.md#9-frontend-api-client-contract).

---

## 11. Test Coverage Requirements

For baseline-v1 (human-written) and as reference standard for the L1 agent:

| Layer      | File                      | Minimum cases                                                                                                                                           |
| ---------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository | `deal.repository.spec.ts` | happy, `findByCompany` (with and without matches), `findByContact`, `countByCompany`                                                                    |
| Service    | `deal.service.spec.ts`    | happy per method, `PARENT_NOT_FOUND` for each FK, `CROSS_ENTITY_MISMATCH`, partial update preserves untouched fields, `detachContact` cross-module test |
| Controller | `deal.controller.spec.ts` | 201/200/204, 404, 422 CROSS_ENTITY_MISMATCH, 400 EMPTY_UPDATE, **assert route decorator is `@Post(':id')` not `@Patch(':id')`**                         |
| End-to-end | `deal.e2e-spec.ts`        | full CRUD; POST-then-list ordering (`I-D-11`, `I-D-12`); delete Contact nulls `Deal.contactId` **and** `Interaction.contactId` in the same transaction  |
| Frontend   | `deal.api.spec.js`        | request contracts, `list` returns array, `stage` is `string` in v1, `update` uses POST                                                                  |

The T1 requirements clause (`T1_minimal.md §4`) requires per endpoint: (a) at
least one happy path, (b) at least one edge case, (c) at least one error
case. Baseline test coverage is at or above this floor to serve as the
standard.

---

## 12. Baseline vs. Experimental Task Boundaries

This section catalogues **what the baseline v1 does NOT do**, so that
prompt-file authors and code reviewers can immediately spot pre-emption.

| Concern                                                                                     | Baseline-v1 posture                  | Introduced in                                     |
| ------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------- |
| `stage` as enum with state machine                                                          | Free string only                     | L2 (`CRM_Scope §4.2`)                             |
| Preconditions on stage advance (contact required for `qualified`, value > 0 for `proposal`) | Not enforced                         | L2                                                |
| `stageChangedAt` field                                                                      | Absent                               | L2                                                |
| `Interaction.dealId` FK                                                                     | Absent (Interaction has no `dealId`) | L4.2 (`CRM_Scope §4.4`)                           |
| `POST /deals/:id/notes` reusing Interaction                                                 | Absent                               | L4.5                                              |
| Company `status: 'inactive'` blocks new deal creation                                       | Not enforced                         | L4.6 (X-4)                                        |
| `POST /deals/batch-stage` batch operation                                                   | Absent                               | L4.7                                              |
| Unified `{ error, code, details }` envelope across all endpoints                            | **Already implemented in baseline**  | L4.8 refines drift, not the envelope shape itself |
| Health score involving Deal data (`value > 10000`, non-closed deals)                        | Absent                               | L3                                                |

### 12.1 Pre-freeze checklist (v1 → v2 migration)

Before the next `prompts-frozen-v4` tag, `T1_minimal.md` and
`T1_structured.md` must be updated to reflect:

- [ ] `customerId` → `companyId` throughout Block 3/4/5.
- [ ] Interface table: `update(id, dto)` route changes from implied `PATCH`
  
      to explicit `POST /deals/:id` in any prose that names the HTTP verb.
- [ ] Block 4 requirements: any bullet naming `PATCH /deals/:id` rewritten to
  
      `POST /deals/:id`.
- [ ] SHA-256 hash of Blocks 3+4+5 recomputed (S1 verification per
  
      `prompt_meta_template_v3.md §5`) since content has changed.
- [ ] `Frozen at:` timestamp reset to `[pending]` until re-review.

This checklist is itself a direct consequence of the `PRD_v2 §1.2`
migration reaching a prompt file that predates it — a small-scale
illustration of the "N earlier decisions must be preserved across M later
steps" pressure that L4's Sequence Continuity block (`prompt_meta_template_v3.md`
§2, Block 7.c) is designed to test at a larger scale.

---

## 13. Traceability

| Item                                           | Trace                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Entity fields                                  | `PRD_v2 §2.5`, `CRM_Scope §2.1` Deal row, `T1_minimal.md §4`                                                        |
| Free-string `stage`                            | `CRM_Scope §4.1` real-world imperfection, deliberate weakness                                                       |
| Cross-entity `contactId` validation            | `T1_minimal.md §4`, [cross-entity.md X-3](./cross-entity.md#x-3-nullable-contactid-must-belong-to-parent-companyid) |
| Insertion-order list default                   | `T1_minimal.md §4`                                                                                                  |
| POST-only migration                            | `PRD_v2 §1.2.2`, [principles.md §3.1](./principles.md#31-the-post-double-role-convention)                           |
| Signatures match T1 (method decorator updated) | `T1_minimal.md §5`, §9 above, §12.1 pre-freeze checklist                                                            |
| L2 state-machine pre-emption avoided           | `CRM_Scope §4.2`, §4 above                                                                                          |
| L4.6 inactive-block pre-emption avoided        | `CRM_Scope §4.4 T4.6`, §12 above                                                                                    |
| Dual-detach on Contact delete (v2 change)      | [cross-entity.md X-6](./cross-entity.md#x-6-delete-contact--null-referencing-fks)                                   |
