# Contact API

> **Resource**: `/api/v1/contacts`
> 
> **Available in**: `baseline-v0`, `baseline-v1`
> 
> **Prerequisites**: [principles.md](./principles.md), [company.md](./company.md)
> 
> **Source lineage**: `PRD_v2.docx §2.3` (Contact row).
> 
> **Real-world CRM equivalent**: Salesforce Contact, HubSpot Contact,
> Twenty Person.

---

## 1. Domain Description

A **Contact** is a **person** at a Company organisation. It has a many-to-one
relationship with Company (each Contact belongs to exactly one Company; each
Company may have zero or more Contacts).

**Why Contact is separate from Company**: real CRM operations distinguish the
organisation ("Acme Corp") from the people you deal with there ("Alice Chen,
VP Sales"). Deals and Interactions may or may not be pinned to a specific
person at any given lifecycle stage. The `role` field reflects this — CRM
practice tracks decision makers, influencers, gatekeepers, and end-users
separately (`CRM_Scope §2.1`: 'role field reflects real CRM practice of
tracking decision-maker vs. influencer').

**Cardinality**: 1..N under Company. A Contact **cannot exist without a
Company** (unlike Deal.contactId and Interaction.contactId, both of which are
nullable — see [deal.md](./deal.md) and [interaction.md](./interaction.md)).

**Naming note (v2)**: the FK field is `companyId` (v1 called it `customerId`).
See `PRD_v2 §1.2.1`.

---

## 2. Entity Schema

| Field       | Type                | Constraints                  | Mutability                 | Semantics                 |
| ----------- | ------------------- | ---------------------------- | -------------------------- | ------------------------- |
| `id`        | `string` (UUID v4)  | server-generated             | read-only                  | Primary key               |
| `companyId` | `string` (UUID v4)  | required, FK → Company       | **immutable after create** | See §6.2                  |
| `name`      | `string`            | 1..200, non-empty after trim | read-write                 | Person's display name     |
| `email`     | `string \| null`    | RFC 5322, ≤254               | read-write                 | Personal work email       |
| `phone`     | `string \| null`    | 0..50, free format           | read-write                 | Not validated to E.164    |
| `role`      | `string \| null`    | 0..100, free text            | read-write                 | Job title or CRM role tag |
| `createdAt` | `string (ISO 8601)` | UTC                          | read-only                  | Server-generated          |
| `updatedAt` | `string (ISO 8601)` | UTC                          | read-only                  | Server-updated            |

**Deliberate choices**:

- `email` and `phone` are **both nullable**. Real Contact records often have
  one or the other but not both, and sometimes neither. The baseline does
  **not** require at least one to be present; this preserves L5a exploration
  ("some information looks wrong") without pre-empting the agent's judgement.
- `phone` is **not** validated to E.164 or any specific pattern.
- No `title` / `department` fields. The single `role` string absorbs both.

---

## 3. Endpoints

| Method   | Path            | Summary          | Success                        | Error responses     |
| -------- | --------------- | ---------------- | ------------------------------ | ------------------- |
| `POST`   | `/contacts`     | Create a contact | `201` + `Contact` + `Location` | `400`, `404`, `422` |
| `GET`    | `/contacts`     | List contacts    | `200` + `ContactList`          | `400`               |
| `GET`    | `/contacts/:id` | Get one contact  | `200` + `Contact`              | `400`, `404`        |
| `POST`   | `/contacts/:id` | Partial update   | `200` + `Contact`              | `400`, `404`, `422` |
| `DELETE` | `/contacts/:id` | Delete a contact | `204`                          | `400`, `404`        |

**On the POST double role**: see [principles.md §3.1](./principles.md#31-the-post-double-role-convention). `POST /contacts` creates; `POST /contacts/:id` updates.

**Contact has no child entities in baseline**, so `DELETE /contacts/:id`
never returns `409`. Deleting a Contact silently detaches Deal.contactId and
Interaction.contactId references (X-6; see
[cross-entity.md](./cross-entity.md#x-6-delete-contact--null-referencing-fks)).

---

## 4. DTOs

### 4.1 `CreateContactDto`

```typescript
class CreateContactDto {
  @IsUUID('4')
  companyId!: string;

  @IsString() @Length(1, 200)
  @Transform(({ value }) => value?.trim())
  name!: string;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsEmail() @MaxLength(254)
  email?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(50)
  phone?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(100)
  role?: string | null;
}
```

### 4.2 `UpdateContactDto`

```typescript
class UpdateContactDto {
  // companyId is DELIBERATELY absent. See §6.2.

  @IsOptional() @IsString() @Length(1, 200)
  @Transform(({ value }) => value?.trim())
  name?: string;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsEmail() @MaxLength(254)
  email?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(50)
  phone?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(100)
  role?: string | null;
}
```

Note that `companyId` is **not a permitted field**. The `whitelist: true`
setting on the global `ValidationPipe` will strip it silently — but the
controller/service layer then re-checks the raw incoming body for the
presence of `companyId` and rejects it explicitly with `422 IMMUTABLE_FIELD`.
See §6.2.

### 4.3 `ContactResponseDto`, `ContactListResponseDto`

Mirror the entity schema and follow the pagination envelope, respectively.

---

## 5. Endpoint Details

### 5.1 `POST /contacts` (create)

**Request**:

```http
POST /api/v1/contacts
Content-Type: application/json

{
  "companyId": "a3f8c1e2-...",
  "name": "Alice Chen",
  "email": "alice@acme.com",
  "role": "VP Sales"
}
```

**Response** (`201`):

```json
{
  "id": "b4e9d2f3-...",
  "companyId": "a3f8c1e2-...",
  "name": "Alice Chen",
  "email": "alice@acme.com",
  "phone": null,
  "role": "VP Sales",
  "createdAt": "2026-07-03T10:30:00.000Z",
  "updatedAt": "2026-07-03T10:30:00.000Z"
}
```

**Errors**:

| Code               | Trigger                                   | HTTP |
| ------------------ | ----------------------------------------- | ---- |
| `MALFORMED_BODY`   | Body not JSON                             | 400  |
| `INVALID_UUID`     | `companyId` not a UUID v4                 | 400  |
| `INVALID_TYPE`     | Field of wrong type                       | 400  |
| `EMPTY_STRING`     | `name` trims to empty                     | 422  |
| `INVALID_EMAIL`    | `email` fails RFC 5322                    | 422  |
| `PARENT_NOT_FOUND` | `companyId` valid UUID but Company absent | 404  |

### 5.2 `GET /contacts`

**Request**:

```http
GET /api/v1/contacts?companyId=a3f8c1e2-...&sort=name&order=asc
```

**Query parameters**:

| Param       | Type | Default     | Values                           |
| ----------- | ---- | ----------- | -------------------------------- |
| `companyId` | UUID | (no filter) | Filter to one Company's Contacts |
| `sort`      | enum | `createdAt` | `name`, `createdAt`              |
| `order`     | enum | `desc`      | `asc`, `desc`                    |
| `limit`     | int  | `20`        | 1..100                           |
| `offset`    | int  | `0`         | ≥ 0                              |

**Design note on `companyId` filter**: this is the **primary** query pattern —
the frontend Company detail page always calls `GET /contacts?companyId=...`.
The flat filter form is chosen per [principles.md §4](./principles.md#4-url-and-naming-conventions-r2-r5) (nesting depth ≤ 2, prefer filter).

**Response** (`200`): standard `ContactList` shape.

### 5.3 `GET /contacts/:id`

Standard. `INVALID_UUID`, `ENTITY_NOT_FOUND`.

### 5.4 `POST /contacts/:id` (partial update)

**Request**:

```http
POST /api/v1/contacts/b4e9d2f3-...
Content-Type: application/json

{ "role": "Chief Revenue Officer" }
```

**Response** (`200`): the updated `Contact`.

**Errors**:

| Code               | Trigger                              | HTTP |
| ------------------ | ------------------------------------ | ---- |
| `INVALID_UUID`     | `:id` malformed                      | 400  |
| `ENTITY_NOT_FOUND` | Target absent                        | 404  |
| `MALFORMED_BODY`   | Body not JSON                        | 400  |
| `EMPTY_UPDATE`     | Body has no valid fields             | 400  |
| `IMMUTABLE_FIELD`  | Body contains `companyId`            | 422  |
| `EMPTY_STRING`     | Non-null string field trims to empty | 422  |
| `INVALID_EMAIL`    | Email format invalid                 | 422  |

### 5.5 `DELETE /contacts/:id`

**Request**:

```http
DELETE /api/v1/contacts/b4e9d2f3-...
```

**Response** (`204`): empty body.

**Errors**: `INVALID_UUID` (400), `ENTITY_NOT_FOUND` (404).

**Note**: no `409` case in baseline. If a Deal or Interaction has `contactId`
pointing to this Contact, deleting the Contact **sets both `Deal.contactId`
and `Interaction.contactId` to `null` via service-layer orchestration** (not
DB cascade). This is documented in
[cross-entity.md X-6](./cross-entity.md#x-6-delete-contact--null-referencing-fks).

**On the two-target detach (v2)**: v1 only nulled `Deal.contactId`. Because
Interaction now also has a nullable `contactId` (v2 change; see
[interaction.md](./interaction.md)), the detach operation must handle both.
The service-layer orchestration in `ContactService.remove` calls
`dealService.detachContact(id)` **and** `interactionService.detachContact(id)`.
Symmetric handling is architecturally required.

---

## 6. Behavioural Invariants

Numbered `I-Ct-N`.

| ID       | Invariant                                                                                                                                                                               | Tested by                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `I-Ct-1` | `POST /contacts` with `companyId` pointing to a non-existent Company → `404 PARENT_NOT_FOUND` (not 422)                                                                                 | Integration                |
| `I-Ct-2` | `POST /contacts/:id` body containing `companyId` (even if value equals current) → `422 IMMUTABLE_FIELD`                                                                                 | Unit                       |
| `I-Ct-3` | `POST /contacts` with `email` and `phone` both null (or both absent) is allowed                                                                                                         | Integration                |
| `I-Ct-4` | `POST /contacts/:id` accepts explicit `null` for `email`, `phone`, `role` as explicit clear                                                                                             | Unit                       |
| `I-Ct-5` | `DELETE /contacts/:id` succeeds even if Deals or Interactions reference this Contact; **both** `Deal.contactId` and `Interaction.contactId` are set to `null` via service orchestration | Integration (cross-module) |
| `I-Ct-6` | `GET /contacts?companyId=<uuid>` with a non-existent companyId returns `200` with empty items (**not** `404`)                                                                           | Integration                |
| `I-Ct-7` | List sort by `name` uses locale-aware Unicode collation, not byte order                                                                                                                 | Unit                       |

### 6.1 Rationale for `I-Ct-6`

Why does filtering by a non-existent parent return an empty list, not `404`?

The filter is a **query predicate**, not a resource reference. `GET
/contacts?companyId=X` asks "which Contacts satisfy `companyId == X`?" — the
honest answer is "none". Returning `404` would conflate two different
absences (the parent's, the result set's) and force the frontend to
distinguish them for no gain.

Contrast with `POST /contacts { companyId: X }`, where `X` **is** used as a
reference (to link the new Contact) and its absence is a real error.

### 6.2 Rationale for `I-Ct-2` (immutable companyId)

Semantically, changing a Contact's `companyId` is equivalent to **deleting
the Contact from Company A and creating a new one under Company B**. The two
operations have different audit trails (in a future scope with audit logs),
different downstream effects (Deals and Interactions referencing the Contact
become cross-entity-mismatched), and different mental models (you don't
"move" a person, you either update their record or create a new one).

Making `companyId` immutable **at the schema level** rather than deriving the
immutability from R4 whitelisting produces a clear, testable error path. It
also serves as the pedagogical template for L2's state machine constraints
(`Deal.stage` transitions), which enforce a similar "operation not permitted
on this field in this way" pattern.

**On v2 method change**: the `IMMUTABLE_FIELD` error's trigger shifted from
`PATCH /contacts/:id` (v1) to `POST /contacts/:id` (v2). The check itself is
identical; only the HTTP method changed. Test names and error `details`
still refer to the field, not the method.

---

## 7. Interface Signatures

**Controller** — `src/modules/contact/contact.controller.ts`:

```typescript
@Controller('contacts')
class ContactController {
  @Post()
  create(@Body() dto: CreateContactDto): Promise<ContactResponseDto>

  @Get()
  findAll(@Query() query: ContactListQuery): Promise<ContactListResponseDto>

  @Get(':id')
  findOne(@Param('id') id: string): Promise<ContactResponseDto>

  @Post(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContactDto): Promise<ContactResponseDto>

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void>
}
```

**Service** — `src/modules/contact/contact.service.ts`:

```typescript
class ContactService {
  create(dto: CreateContactDto): Promise<Contact>
  findAll(query: ContactListQuery): Promise<{ items: Contact[]; total: number }>
  findOne(id: string): Promise<Contact>
  update(id: string, dto: UpdateContactDto): Promise<Contact>
  remove(id: string): Promise<void>
}
```

The `ContactService.remove` implementation must, before deleting, call **both**:

1. `dealService.detachContact(id)` — nullify `Deal.contactId` references.
2. `interactionService.detachContact(id)` — nullify `Interaction.contactId` references (v2 addition).

These are **service-to-service** dependencies, permitted by R1 (all peer
services; neither is upward-in-layer). The dual-detach is intentionally
present as the template for L4.5 (deal notes) and L4.6 (inactive Company
blocking).

**Repository** — `src/modules/contact/contact.repository.ts`:

```typescript
class ContactRepository extends BaseRepository<Contact> {
  findWithFilter(query: ContactListQuery): Promise<{ items: Contact[]; total: number }>
  findByCompany(companyId: string): Promise<Contact[]>
}
```

**Entity** — `src/modules/contact/contact.entity.ts`:

```typescript
@Entity('contacts')
class Contact {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') companyId: string;
  @Column({ length: 200 }) name: string;
  @Column({ length: 254, nullable: true }) email: string | null;
  @Column({ length: 50, nullable: true }) phone: string | null;
  @Column({ length: 100, nullable: true }) role: string | null;

  @ManyToOne(() => Company, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
```

The `onDelete: 'RESTRICT'` at the ORM level is a safety net; the business
rule is enforced in `CompanyService.remove` via `countChildren`.

---

## 8. Frontend API Client Contract

`frontend/src/services/api/contact.api.js`:

```javascript
export const contactsApi = {
  list: (params) => Promise<ContactList>,
  get: (id) => Promise<Contact>,
  create: (dto) => Promise<Contact>,       // → POST /api/v1/contacts
  update: (id, dto) => Promise<Contact>,   // → POST /api/v1/contacts/:id
  remove: (id) => Promise<void>,
};
```

Types generated from `openapi.yaml`. Note that `UpdateContactDto` in
generated types **does not include** `companyId` — the type system enforces
`I-Ct-2` at compile time on the frontend.

---

## 9. Test Coverage Requirements

| Layer      | File                         | Minimum cases                                                                                                                                            |
| ---------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository | `contact.repository.spec.ts` | happy, filter, `findByCompany`                                                                                                                           |
| Service    | `contact.service.spec.ts`    | happy per method, PARENT_NOT_FOUND, IMMUTABLE_FIELD, **dual-detach on-delete cross-module test**                                                         |
| Controller | `contact.controller.spec.ts` | 201/200/204, 404, 422 IMMUTABLE_FIELD                                                                                                                    |
| End-to-end | `contact.e2e-spec.ts`        | full CRUD flow; create Contact under existing Company; delete Company with Contacts → 409; delete Contact with linked Deal AND Interaction → both nulled |
| Frontend   | `contact.api.spec.js`        | request contracts; assert update uses POST not PATCH                                                                                                     |

---

## 10. Traceability

| Item                                                                                        | Trace                                                                                         |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Entity fields                                                                               | `PRD_v2 §2.3` Contact row                                                                     |
| Immutable `companyId`                                                                       | §6.2, pedagogical template for L2                                                             |
| **Dual detach on delete** (Deal + Interaction)                                              | [cross-entity.md X-6](./cross-entity.md#x-6-delete-contact--null-referencing-fks) — v2 change |
| Empty-list on missing-parent filter                                                         | §6.1                                                                                          |
| Cross-service call chain `contactService → {dealService, interactionService}.detachContact` | §7, template for L4.5, L4.6                                                                   |
| POST double role                                                                            | [principles.md §3.1](./principles.md#31-the-post-double-role-convention)                      |
