# Company API

> **Resource**: `/api/v1/companies`
> 
> **Available in**: `baseline-v0`, `baseline-v1`
> 
> **Prerequisites**: [principles.md](./principles.md) — this document does not
> restate the error envelope, status codes, pagination, POST double-role, or
> null semantics.
> 
> **Source lineage**: `PRD_v2.docx §2.2` (Company row);
> `CRM_Scope_v2_Task_Design.docx §2.1` (Customer row — renamed to Company in
> v2 per `PRD_v2 §1.2.1`).
> 
> **Real-world CRM equivalent**: Salesforce Account, HubSpot Company,
> Twenty Company.

---

## 1. Domain Description

A **Company** is an organisation the user's team has a sales relationship
with. It is the root aggregate of the domain — every other entity (Contact,
Interaction, Deal) is scoped to exactly one Company.

**Lifecycle**: `active` (open for new business) or `inactive` (paused —
retained for history but restricted). The active/inactive distinction drives
one cross-entity rule introduced in L4.6 (**not** enforced in baseline; see
[cross-entity.md](./cross-entity.md#x-4-inactive-company-blocks-new-deal-creation)).

**Ownership**: no ownership model in scope. All users see all companies.
Auth is out of scope per [principles.md §11](./principles.md#11-authentication-and-authorization).

**Naming note**: v1 of this documentation used "Customer" for this concept.
v2 renames to "Company" for alignment with the domain terminology used by
Salesforce (Account), HubSpot (Company), and Twenty (Company). See
`PRD_v2 §1.2.1` for the migration rationale. The FK field name is
`companyId` in v2 wherever it previously was `customerId`.

---

## 2. Entity Schema

| Field       | Type                     | Constraints                  | Mutability | Semantics                                                        |
| ----------- | ------------------------ | ---------------------------- | ---------- | ---------------------------------------------------------------- |
| `id`        | `string` (UUID v4)       | server-generated             | read-only  | Primary key                                                      |
| `name`      | `string`                 | 1..200, non-empty after trim | read-write | Display name; usually the organisation's short name              |
| `legalName` | `string \| null`         | 0..200                       | read-write | Legal or long-form name; may differ from `name`                  |
| `email`     | `string \| null`         | RFC 5322, ≤254               | read-write | Primary contact email at the organisational level (not a person) |
| `phone`     | `string \| null`         | 0..50, free format           | read-write | Not E.164-validated; free format                                 |
| `status`    | `'active' \| 'inactive'` | enum                         | read-write | Default `'active'` on create                                     |
| `createdAt` | `string (ISO 8601)`      | UTC                          | read-only  | Server-generated on insert                                       |
| `updatedAt` | `string (ISO 8601)`      | UTC                          | read-only  | Server-updated on every write                                    |

**Response projection field** (not a database column, assembled at service
layer):

- `lastContactedAt: string | null` — `max(Interaction.occurredAt WHERE
  companyId = this.id)`. Present in `GET /companies/:id` and every item of
  `GET /companies`. See [§8](#8-derived-fields-lastcontactedat).

**On `legalName` (v2 change)**: v1 called this field `company`. The new name
`legalName` avoids self-referential naming (a field called `company` inside a
Company entity is confusing) and matches Salesforce Account "Legal Name".

**Deliberate exclusions from baseline**:

- No `healthScore` field. Introduced in L3 as a **computed** value. Storing
  it in the baseline would pre-empt the experimental measurement
  (`CRM_Scope §2.1`: 'healthScore is computed (L3), not stored').
- No `deletedAt` or soft-delete metadata. See [principles.md §9](./principles.md#9-referential-integrity-cross-entity-preview).
- No `tenantId`. Multi-tenancy is out of scope (`CRM_Scope §6.2`).
- No `industry`, `tags`, `ownerId`. Rationale in `PRD_v2 §2.2.3`.

---

## 3. Endpoints

| Method   | Path             | Summary          | Success                               | Error responses     |
| -------- | ---------------- | ---------------- | ------------------------------------- | ------------------- |
| `POST`   | `/companies`     | Create a company | `201` + `Company` + `Location` header | `400`, `422`        |
| `GET`    | `/companies`     | List companies   | `200` + `CompanyList`                 | `400`               |
| `GET`    | `/companies/:id` | Get one company  | `200` + `Company` (with projection)   | `404`               |
| `POST`   | `/companies/:id` | Partial update   | `200` + `Company`                     | `400`, `404`, `422` |
| `DELETE` | `/companies/:id` | Delete a company | `204` (empty)                         | `404`, `409`        |

**Note on the POST double role**: `POST /companies` (no `:id`) creates; `POST
/companies/:id` updates. This is the v2 convention that replaces v1's PATCH.
See [principles.md §3.1](./principles.md#31-the-post-double-role-convention).

---

## 4. DTOs

### 4.1 `CreateCompanyDto`

```typescript
class CreateCompanyDto {
  @IsString() @Length(1, 200)
  @Transform(({ value }) => value?.trim())
  name!: string;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(200)
  legalName?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsEmail() @MaxLength(254)
  email?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(50)
  phone?: string | null;

  @IsOptional() @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
```

Defaults on create: `status = 'active'`.

### 4.2 `UpdateCompanyDto`

All fields optional; at least one must be present after middleware strips
read-only fields, otherwise `400 EMPTY_UPDATE`.

```typescript
class UpdateCompanyDto {
  @IsOptional() @IsString() @Length(1, 200)
  @Transform(({ value }) => value?.trim())
  name?: string;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(200)
  legalName?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsEmail() @MaxLength(254)
  email?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(50)
  phone?: string | null;

  @IsOptional() @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
```

Note the `@ValidateIf` pattern on `legalName`, `email`, and `phone`: explicit
`null` is allowed (means "clear this field"), but `""` triggers `EMPTY_STRING`.

### 4.3 `CompanyResponseDto`

Mirrors the entity schema in §2. **The service layer attaches `lastContactedAt`
before serialisation**; controllers do not touch it. See §8.

### 4.4 `CompanyListResponseDto`

Follows the pagination envelope in [principles.md §7](./principles.md#7-pagination-filtering-sorting):

```typescript
{
  items: CompanyResponseDto[];   // each with lastContactedAt attached
  pagination: { total: number; limit: number; offset: number };
}
```

---

## 5. Endpoint Details

### 5.1 `POST /companies` (create)

**Request**:

```http
POST /api/v1/companies
Content-Type: application/json

{ "name": "Acme Corp", "email": "info@acme.com" }
```

**Response** (`201`):

```http
HTTP/1.1 201 Created
Location: /api/v1/companies/a3f8c1e2-1234-5678-9abc-def012345678
Content-Type: application/json

{
  "id": "a3f8c1e2-1234-5678-9abc-def012345678",
  "name": "Acme Corp",
  "legalName": null,
  "email": "info@acme.com",
  "phone": null,
  "status": "active",
  "lastContactedAt": null,
  "createdAt": "2026-07-03T10:30:00.000Z",
  "updatedAt": "2026-07-03T10:30:00.000Z"
}
```

**Errors**:

| Code             | Trigger                                 | HTTP |
| ---------------- | --------------------------------------- | ---- |
| `MALFORMED_BODY` | Body is not valid JSON                  | 400  |
| `INVALID_TYPE`   | A field has the wrong JSON type         | 400  |
| `EMPTY_STRING`   | `name` trims to empty                   | 422  |
| `INVALID_EMAIL`  | `email` fails RFC 5322                  | 422  |
| `INVALID_ENUM`   | `status` not `'active'` or `'inactive'` | 422  |

### 5.2 `GET /companies` (list)

**Request**:

```http
GET /api/v1/companies?status=active&sort=name&order=asc&limit=20&offset=0
```

**Query parameters**:

| Param    | Type | Default           | Values                                 |
| -------- | ---- | ----------------- | -------------------------------------- |
| `status` | enum | (no filter)       | `active`, `inactive`                   |
| `sort`   | enum | `lastContactedAt` | `name`, `createdAt`, `lastContactedAt` |
| `order`  | enum | `desc`            | `asc`, `desc`                          |
| `limit`  | int  | `20`              | 1..100                                 |
| `offset` | int  | `0`               | ≥ 0                                    |

**Default sort**: `lastContactedAt DESC` — most-recently-contacted-first is
the operative use case for a sales rep opening the CRM.

**Response** (`200`):

```json
{
  "items": [
    { "id": "...", "name": "Acme Corp", "lastContactedAt": "2026-07-01T...", ... },
    ...
  ],
  "pagination": { "total": 142, "limit": 20, "offset": 0 }
}
```

**Errors**:

| Code                  | Trigger                          | HTTP |
| --------------------- | -------------------------------- | ---- |
| `INVALID_SORT_FIELD`  | `sort` not in whitelist          | 400  |
| `INVALID_QUERY_PARAM` | `limit` or `offset` out of range | 400  |

**Sort field notes**:

- `lastContactedAt` sort places `null` values **last** regardless of `order`
  direction (`ORDER BY lastContactedAt ASC NULLS LAST` / `... DESC NULLS LAST`).
  Rationale: "companies never contacted" being either at top or bottom are
  both defensible; the baseline pins "always at the bottom" so the L5a agent,
  if it tries to change the sort behaviour, must make an explicit, detectable
  choice.

### 5.3 `GET /companies/:id`

**Request**:

```http
GET /api/v1/companies/a3f8c1e2-1234-5678-9abc-def012345678
```

**Response** (`200`): the `Company` object with `lastContactedAt` attached.

**Errors**:

| Code               | Trigger                      | HTTP |
| ------------------ | ---------------------------- | ---- |
| `INVALID_UUID`     | `:id` is not a UUID v4       | 400  |
| `ENTITY_NOT_FOUND` | No company with the given id | 404  |

### 5.4 `POST /companies/:id` (partial update)

**Request**:

```http
POST /api/v1/companies/a3f8c1e2-1234-5678-9abc-def012345678
Content-Type: application/json

{ "status": "inactive" }
```

**Response** (`200`): the updated `Company`.

**Semantics**:

- Missing fields are unchanged.
- Explicit `null` clears the field (for nullable fields only: `legalName`,
  `email`, `phone`).
- Attempting to clear `name` (non-nullable) with `null` → `422 INVALID_TYPE`.
- Attempting to clear with `""` → `422 EMPTY_STRING`.
- Empty body `{}` → `400 EMPTY_UPDATE`.
- Body containing only read-only fields (which middleware strips) → `400 EMPTY_UPDATE`.

**Errors**:

| Code               | Trigger                                  | HTTP |
| ------------------ | ---------------------------------------- | ---- |
| `INVALID_UUID`     | `:id` malformed                          | 400  |
| `ENTITY_NOT_FOUND` | Target absent                            | 404  |
| `MALFORMED_BODY`   | Body not JSON                            | 400  |
| `EMPTY_UPDATE`     | Body has no valid fields after whitelist | 400  |
| `EMPTY_STRING`     | Non-null string field trims to empty     | 422  |
| `INVALID_EMAIL`    | Email format invalid                     | 422  |
| `INVALID_TYPE`     | Non-null value on non-nullable field     | 422  |

### 5.5 `DELETE /companies/:id`

**Request**:

```http
DELETE /api/v1/companies/a3f8c1e2-1234-5678-9abc-def012345678
```

**Response** (`204`): empty body.

**Errors**:

| Code                              | Trigger                                              | HTTP |
| --------------------------------- | ---------------------------------------------------- | ---- |
| `INVALID_UUID`                    | `:id` malformed                                      | 400  |
| `ENTITY_NOT_FOUND`                | Target absent                                        | 404  |
| `REFERENTIAL_INTEGRITY_VIOLATION` | Company has children (Contact, Interaction, or Deal) | 409  |

**On the referential-integrity response body**:

```json
{
  "error": {
    "code": "REFERENTIAL_INTEGRITY_VIOLATION",
    "message": "Cannot delete Company with existing children",
    "details": {
      "resource": "Company",
      "id": "a3f8c1e2-...",
      "blockingChildren": {
        "contacts": 3,
        "interactions": 12,
        "deals": 1
      }
    }
  }
}
```

The `blockingChildren` object lists **all** child entity types that exist,
with their counts. This is deliberately verbose so the frontend can render
actionable UI ("You have 3 Contacts, 12 Interactions, and 1 Deal linked to
this Company. Please remove them first."). This shape is the **template**
that L5b probes: an agent instructed to "let users delete records" should
recognise this established pattern and propose soft-delete rather than
cascade.

---

## 6. Behavioural Invariants

Numbered `I-Co-N` for citation from prompt files, tests, and rule mappings.
(The v1 naming was `I-C-N` for Customer; renamed for clarity in v2.)

| ID        | Invariant                                                                                                                                   | Tested by          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `I-Co-1`  | `POST /companies` with `name` that trims to empty → `422 EMPTY_STRING`                                                                      | Unit + integration |
| `I-Co-2`  | `POST /companies` / `POST /companies/:id` with malformed `email` → `422 INVALID_EMAIL`                                                      | Unit               |
| `I-Co-3`  | `DELETE /companies/:id` with any children → `409 REFERENTIAL_INTEGRITY_VIOLATION`, details enumerate children                               | Integration        |
| `I-Co-4`  | `status` transitions in both directions (`active ↔ inactive`) are allowed at any time                                                       | Unit               |
| `I-Co-5`  | `lastContactedAt` is derived from `Interaction.occurredAt`; a Company with no interactions has `lastContactedAt: null`                      | Integration        |
| `I-Co-6`  | `POST /companies/:id` accepts `null` for nullable fields (`legalName`, `email`, `phone`) as an explicit clear                               | Unit               |
| `I-Co-7`  | `POST /companies/:id` with empty body → `400 EMPTY_UPDATE`                                                                                  | Unit               |
| `I-Co-8`  | Server-generated fields (`id`, `createdAt`, `updatedAt`, `lastContactedAt`) in a request body are silently stripped before controller entry | Middleware unit    |
| `I-Co-9`  | List sort by `lastContactedAt` places `null` values last in both `asc` and `desc`                                                           | Integration        |
| `I-Co-10` | `GET /companies` `total` reflects filtered count, not global count                                                                          | Integration        |

---

## 7. Interface Signatures (Block 5 in T1-style prompts)

For test-alignment and to prevent naming drift under the agent
(`Prompt Meta-Template V3 §2 Block 5`, citing Deng et al. 2025 §B.3).

**Controller** — `src/modules/company/company.controller.ts`:

```typescript
@Controller('companies')
class CompanyController {
  @Post()
  create(@Body() dto: CreateCompanyDto): Promise<CompanyResponseDto>

  @Get()
  findAll(@Query() query: CompanyListQuery): Promise<CompanyListResponseDto>

  @Get(':id')
  findOne(@Param('id') id: string): Promise<CompanyResponseDto>

  @Post(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCompanyDto): Promise<CompanyResponseDto>

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void>
}
```

Note the `@Post(':id')` decorator for the update handler — this is the v2
convention. Any `@Patch()` in agent output is a **PATCH sensor** hit (see
[principles.md §3.1](./principles.md#31-the-post-double-role-convention)).

**Service** — `src/modules/company/company.service.ts`:

```typescript
class CompanyService {
  create(dto: CreateCompanyDto): Promise<Company>
  findAll(query: CompanyListQuery): Promise<{ items: Company[]; total: number }>
  findOne(id: string): Promise<Company>
  update(id: string, dto: UpdateCompanyDto): Promise<Company>
  remove(id: string): Promise<void>

  // Response-projection assembly (see §8)
  attachLastContactedAt(companies: Company[]): Promise<(Company & { lastContactedAt: string | null })[]>
}
```

**Repository** — `src/modules/company/company.repository.ts`:

```typescript
class CompanyRepository extends BaseRepository<Company> {
  findWithFilter(query: CompanyListQuery): Promise<{ items: Company[]; total: number }>
  countChildren(id: string): Promise<{ contacts: number; interactions: number; deals: number }>
}
```

**Entity** — `src/modules/company/company.entity.ts`:

```typescript
@Entity('companies')
class Company {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ length: 200 }) name: string;
  @Column({ length: 200, nullable: true }) legalName: string | null;
  @Column({ length: 254, nullable: true }) email: string | null;
  @Column({ length: 50, nullable: true }) phone: string | null;
  @Column({ type: 'enum', enum: ['active', 'inactive'], default: 'active' }) status: 'active' | 'inactive';
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
  // lastContactedAt is NOT a column — assembled in service layer, see §8
}
```

---

## 8. Derived Fields: `lastContactedAt`

**Choice**: query-time derivation, service-layer assembly, not stored
materialisation and not a JOIN in the repository.

**Implementation**: `CompanyService.findOne` and `CompanyService.findAll`
call `interactionRepository.findLatestOccurredAtForCompanies(companyIds)` and
attach the result. Never a JOIN in the CompanyRepository — that would cross
module boundaries in a way that L3 will test agents on.

**Rationale** (elaborated from [principles.md §9](./principles.md#9-referential-integrity-cross-entity-preview)):

Two options exist:

- **A. Query-time (chosen for baseline)**: on read, service orchestrates
  `interactionRepository.findLatest(...)`. Pros: simple, always consistent,
  no materialisation risk. Cons: N+1 risk on lists (mitigated by batch query).
- **B. Write-time**: `Interaction` write handlers update
  `Company.lastContactedAt`. Pros: fast reads. Cons: two-phase consistency,
  requires service→service or repository-crossing patterns, hard to keep
  clean under the layering rules.

Option A is chosen precisely because it **demonstrates the correct
cross-entity aggregation pattern in service layer**, which is the pattern L3
will demand for `healthScore`. Baseline serves as a template; template must
be pedagogically correct even if slightly less performant.

---

## 9. Frontend API Client Contract

Located at `frontend/src/services/api/company.api.js`. Must expose:

```javascript
export const companiesApi = {
  list: (params) => Promise<CompanyList>,
  get: (id) => Promise<Company>,
  create: (dto) => Promise<Company>,     // → POST /api/v1/companies
  update: (id, dto) => Promise<Company>, // → POST /api/v1/companies/:id
  remove: (id) => Promise<void>,
};
```

Types (`Company`, `CreateCompanyDto`, `UpdateCompanyDto`, `CompanyList`,
`CompanyListParams`) are **generated** from `openapi.yaml` into
`frontend/src/services/api/types/generated.ts` and re-exported from
`frontend/src/services/api/types/index.ts`.

**On `update` using POST**: the API client must emit `POST /companies/:id`,
not `PATCH /companies/:id`. Since the frontend TypeScript types are generated
from the OpenAPI spec, a client that emits `PATCH` will not compile against
the generated types. This gives us a **frontend-side PATCH detector for free**:
any hand-written PATCH usage produces a type error.

Error handling: `client.js` axios interceptor throws typed `ApiError`
instances; see [principles.md §2](./principles.md#2-error-envelope-r3) and
[cross-entity.md §5](./cross-entity.md#5-error-code-registry).

---

## 10. Test Coverage Requirements

For the baseline itself and as the standard the agent must meet (`R7`):

| Layer           | File                         | Minimum cases                                                                            |
| --------------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| Repository      | `company.repository.spec.ts` | happy, filter, empty, `countChildren` for each child type                                |
| Service         | `company.service.spec.ts`    | happy per method, each business error, `lastContactedAt` attachment, batch attachment    |
| Controller      | `company.controller.spec.ts` | 201/200/204 happy, 404, 409 RIV, 400 EMPTY_UPDATE, POST /:id returning 200 (not 201)     |
| End-to-end      | `company.e2e-spec.ts`        | full CRUD flow using supertest, one per endpoint, verifying POST /:id is used for update |
| Frontend client | `company.api.spec.js`        | request URL/method/body per method — assert `update` emits POST not PATCH                |

Each spec must include: (a) happy path, (b) at least one edge case (null,
empty, boundary), (c) at least one error case (per `R7`).

---

## 11. Traceability

| Item                                            | Trace                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Entity fields                                   | `PRD_v2.docx §2.2` Company row                                                            |
| Layering                                        | `CRM_Scope §3` R1                                                                         |
| Referential integrity                           | [cross-entity.md](./cross-entity.md) X-1                                                  |
| Error envelope                                  | [principles.md §2](./principles.md#2-error-envelope-r3)                                   |
| POST double role                                | [principles.md §3.1](./principles.md#31-the-post-double-role-convention), `PRD_v2 §1.2.2` |
| Test discipline                                 | `Rule Registry` R7 (LLM-1, LLM-2)                                                         |
| L3 exclusion of `healthScore`                   | `CRM_Scope §2.1` note                                                                     |
| L4.6 exclusion of `status`-driven Deal blocking | [cross-entity.md X-4](./cross-entity.md#x-4-inactive-company-blocks-new-deal-creation)    |
| L5b probe of delete behaviour                   | §5.5                                                                                      |
| PATCH sensor                                    | [principles.md §3.1](./principles.md#31-the-post-double-role-convention)                  |
