# Interaction API

> **Resource**: `/api/v1/interactions`
>
> **Available in**: `baseline-v0`, `baseline-v1`
>
> **Prerequisites**: [principles.md](./principles.md), [company.md](./company.md),
> [contact.md](./contact.md)
>
> **Source lineage**: `PRD_v2.docx §2.4` (Interaction row).
>
> **Real-world CRM equivalent**: Salesforce Activity/Task, HubSpot Engagement,
> Twenty Activity.

---

## 1. Domain Description

An **Interaction** is a record of contact between the user's team and a
Company — a call, an email, a meeting, or a note. Interactions are the raw
telemetry of the sales relationship: they feed `Company.lastContactedAt`
and, in L3, the `healthScore` computation.

**Cardinality**:

- **Required 1..N under Company** (`companyId` FK, non-null, immutable).
- **Optional 0..1 to Contact** (`contactId` FK, nullable) — v2 addition;
  see [§4](#4-the-new-contactid-field-v2-addition).
- L4.2 will add `dealId: string | null` as an experimental task, and L4.5
  will reuse this table for Deal notes (`type = 'note'`). **The baseline must
  not implement `dealId` or note-reuse**, or those experimental tasks lose
  their measurement value (`CRM_Scope §5.1`).

**Naming note (v2)**: v1 used `customerId`; v2 uses `companyId` per
`PRD_v2 §1.2.1`.

---

## 2. Entity Schema (baseline v0 / v1)

| Field | Type | Constraints | Mutability | Semantics |
|---|---|---|---|---|
| `id` | `string` (UUID v4) | server-generated | read-only | Primary key |
| `companyId` | `string` (UUID v4) | required, FK → Company | **immutable after create** | See §5.2 |
| `contactId` | `string \| null` (UUID v4 or null) | nullable, FK → Contact | read-write | **New in v2** — see §4 |
| `type` | `enum` | `'call' \| 'email' \| 'meeting' \| 'note'` | read-write | See §3 |
| `note` | `string \| null` | 0..5000 | read-write | Optional body |
| `occurredAt` | `string (ISO 8601)` | required, past or near-now | read-write | See §5.2 |
| `createdAt` | `string (ISO 8601)` | UTC | read-only | Server-generated |
| `updatedAt` | `string (ISO 8601)` | UTC | read-only | Server-updated |

**Deliberately absent in baseline** (introduced later):

- `dealId: string | null` — added in **L4.2** (`CRM_Scope §4.4 T4.2`).
- Any "note reuse" heuristic (e.g., accepting `dealId` implicitly making
  `type = 'note'`) — added in **L4.5**.
- Attachment support, threading, or reply chains — permanently out of scope
  (`CRM_Scope §6.2`).

---

## 3. `type` Enum

Fixed set: `'call' | 'email' | 'meeting' | 'note'`.

| Value | Semantics | Typical `note` content |
|---|---|---|
| `call` | Voice contact | Summary of what was discussed |
| `email` | Correspondence via email | Subject line or key points |
| `meeting` | Scheduled meeting (in person or video) | Agenda items, decisions |
| `note` | Free-form observation not tied to a specific contact event | Any qualitative remark |

**No enum extension in baseline** (no `sms`, `linkedin_message`, etc.).
Adding values later requires a `v2` migration. This tight enum is deliberate
— L5a ("customer information looks wrong") should not tempt the agent to
extend the enum without an explicit prompt.

---

## 4. The New `contactId` Field (v2 Addition)

**Main point**: `contactId` records **which specific person** at the Company
the interaction was with. Nullable to allow the "called the main switchboard"
or "sent group email" case where no specific individual is identified.

### 4.1 Why it was missing in v1 — and why it matters now

Version 1 of this documentation had Interaction linked only to Company. This
was a modelling gap: a real call log entry naturally records *who* was
called, not just *which company*. When we renamed Customer to Company in v2
(`PRD_v2 §1.2.1`), the semantic distinction between organisation and person
became sharp — and the gap became obvious.

### 4.2 X-3 symmetric application

`Interaction.contactId`, when non-null, must satisfy:
`Contact.companyId == Interaction.companyId`. Violation →
`422 CROSS_ENTITY_MISMATCH`.

This is **structurally identical** to the X-3 rule that governs
`Deal.contactId` (see [deal.md §5](./deal.md#5-contactid--the-nullable-cross-reference)).
The symmetry is an intentional consequence of the v2 change and is registered
in [cross-entity.md X-3](./cross-entity.md#x-3-nullable-contactid-must-belong-to-parent-companyid).

### 4.3 The symmetry as an experimental signal (creative extension)

The X-3 rule now applies at two structurally identical sites (Deal and
Interaction). The baseline implements the rule correctly at both. This
creates two independent experimental signals:

1. **Fragility signal (L2)**: when L2 refactors `Deal.stage` to a state
   machine, does the agent preserve X-3 on both Deal *and* Interaction, or
   does it degrade one while updating the other? A rule applied at two sites
   is a natural fragility test.

2. **Generalisation signal (L4)**: L4.2 introduces `Interaction.dealId`
   (analogous cross-entity reference). Does the agent, when adding
   `dealId`, notice and apply the X-3 pattern by analogy? An agent that
   correctly extends the two-site X-3 pattern to a three-site version
   demonstrates architectural generalisation ability. An agent that adds
   `dealId` without a corresponding cross-entity consistency check exhibits
   failure to generalise from local structural rules — a distinct failure
   mode not currently named in `CRM_Scope`.

This is not a metric the harness computes automatically today, but it is a
useful post-hoc analysis lens: manual review of L4.2 outputs for
"cross-entity consistency check added?" produces a binary flag with clear
theoretical grounding.

---

## 5. DTOs

### 5.1 `CreateInteractionDto`

```typescript
class CreateInteractionDto {
  @IsUUID('4')
  companyId!: string;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID('4')
  contactId?: string | null;

  @IsIn(['call', 'email', 'meeting', 'note'])
  type!: 'call' | 'email' | 'meeting' | 'note';

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(5000)
  note?: string | null;

  @IsISO8601({ strict: true, strictSeparator: true })
  @Validate(NotFutureTimestampValidator)   // custom validator, see §5.2
  occurredAt!: string;
}
```

### 5.2 `occurredAt` — "past or near-now" rule

`occurredAt` may be in the past (arbitrarily; you can log a meeting from last
year) but **not in the future beyond a 60-second clock-skew tolerance**.

Rationale for the tolerance:

- Server clock and client clock disagree at the sub-second level; a strict
  `<= now()` would fail on legitimate near-real-time logging.
- 60 seconds is generous enough to absorb clock skew and slow requests,
  tight enough to reject clearly-future timestamps.

Violation → `422 FUTURE_TIMESTAMP`.

### 5.3 `UpdateInteractionDto`

```typescript
class UpdateInteractionDto {
  // companyId absent — immutable

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID('4')
  contactId?: string | null;

  @IsOptional() @IsIn(['call', 'email', 'meeting', 'note'])
  type?: 'call' | 'email' | 'meeting' | 'note';

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(5000)
  note?: string | null;

  @IsOptional() @IsISO8601({ strict: true, strictSeparator: true })
  @Validate(NotFutureTimestampValidator)
  occurredAt?: string;
}
```

### 5.4 `InteractionResponseDto`, `InteractionListResponseDto`

Mirror the entity and follow the pagination envelope.

---

## 6. Endpoint Details

### 6.1 `POST /interactions` (create)

**Request**:
```http
POST /api/v1/interactions
Content-Type: application/json

{
  "companyId": "a3f8c1e2-...",
  "contactId": "b4e9d2f3-...",
  "type": "call",
  "note": "Discussed pricing for enterprise tier. Alice will circle back next week.",
  "occurredAt": "2026-07-03T14:15:00.000Z"
}
```

**Response** (`201`): the created Interaction.

**Errors**:

| Code | Trigger | HTTP |
|---|---|---|
| `MALFORMED_BODY` | Body not JSON | 400 |
| `INVALID_UUID` | `companyId` or `contactId` not UUID v4 | 400 |
| `INVALID_ENUM` | `type` not in enum | 400 |
| `INVALID_ISO8601` | `occurredAt` not ISO 8601 | 400 |
| `PARENT_NOT_FOUND` | `companyId` valid but Company absent | 404 |
| `PARENT_NOT_FOUND` | `contactId` valid but Contact absent | 404 |
| `CROSS_ENTITY_MISMATCH` | Contact exists but belongs to different Company (X-3) | 422 |
| `FUTURE_TIMESTAMP` | `occurredAt` > now + 60s | 422 |

**Side effect**: `Company.lastContactedAt` is **not** stored — it is derived
at query time (see [company.md §8](./company.md#8-derived-fields-lastcontactedat)).
Creating an Interaction has no direct write to Company.

### 6.2 `GET /interactions`

**Query parameters**:

| Param | Type | Default | Values |
|---|---|---|---|
| `companyId` | UUID | (no filter) | |
| `contactId` | UUID | (no filter) | **v2 addition** — filter by specific contact |
| `type` | enum | (no filter) | `call`, `email`, `meeting`, `note` |
| `sinceDate` | ISO 8601 | (no filter) | Returns `occurredAt >= sinceDate` |
| `untilDate` | ISO 8601 | (no filter) | Returns `occurredAt <= untilDate` |
| `sort` | enum | `occurredAt` | `occurredAt`, `createdAt` |
| `order` | enum | `desc` | `asc`, `desc` |
| `limit` | int | `20` | 1..100 |
| `offset` | int | `0` | ≥ 0 |

**On `contactId` filter (v2)**: since Interactions can now be tagged to a
specific Contact, listing "all interactions with Alice" becomes a legitimate
frontend use case (e.g., in a Contact-specific view or during pre-meeting
prep). The filter is a natural extension of the new field.

Default sort is `occurredAt DESC` — most-recent-first is the operative use
case (activity feed).

`sinceDate` and `untilDate` are inclusive bounds. If both are supplied with
`sinceDate > untilDate` → `400 INVALID_QUERY_RANGE`.

### 6.3 `GET /interactions/:id`

Standard.

### 6.4 `POST /interactions/:id` (partial update)

Semantics as in [company.md §5.4](./company.md#54-post-companiesid-partial-update) —
missing fields unchanged, explicit `null` clears (for `contactId` and `note`;
`type` and `occurredAt` are required and cannot be nulled), empty body →
`400 EMPTY_UPDATE`.

**contactId update semantics**: updating `contactId` to a new value must
re-check the X-3 rule using the (immutable) stored `companyId` and the new
`contactId`. Updating `contactId` to `null` (explicit clear) always succeeds
if the entity exists.

**Edit vs. re-record**: real CRMs debate whether historical interactions
should be editable at all (audit trail concerns). The baseline permits
editing — L5b may later probe this with a "delete interactions to clean the
database" scenario.

### 6.5 `DELETE /interactions/:id`

Standard. Deleting an Interaction has **no cascading effect** on
`Company.lastContactedAt` — the derivation is at query time, so the next
`GET /companies/:id` will naturally see the new latest (or `null`) without
any write.

---

## 7. Behavioural Invariants

Numbered `I-I-N`.

| ID | Invariant | Tested by |
|---|---|---|
| `I-I-1` | `POST /interactions` with `occurredAt` > now + 60s → `422 FUTURE_TIMESTAMP` | Unit |
| `I-I-2` | `POST /interactions` with `occurredAt` up to 60s in the future succeeds | Unit |
| `I-I-3` | `POST /interactions` with `companyId` referring to a non-existent Company → `404 PARENT_NOT_FOUND` | Integration |
| `I-I-4` | `POST /interactions/:id` body with `companyId` → `422 IMMUTABLE_FIELD` | Unit |
| `I-I-5` | `POST /interactions` with `type = 'note'` and `note = null` is permitted (empty note is legal) | Unit |
| `I-I-6` | `DELETE /interactions/:id` never mutates `Company.lastContactedAt` directly; next company fetch reflects the new latest interaction (or null) | Integration |
| `I-I-7` | List default sort is `occurredAt DESC`, not `createdAt DESC` | Integration |
| `I-I-8` | `sinceDate > untilDate` → `400 INVALID_QUERY_RANGE` | Unit |
| `I-I-9` | Enum extension attempts (`type = 'sms'`) → `400 INVALID_ENUM` | Unit |
| `I-I-10` | **(v2)** `POST /interactions` with `contactId` referring to a non-existent Contact → `404 PARENT_NOT_FOUND` | Integration |
| `I-I-11` | **(v2)** `POST /interactions` with `contactId` whose Contact belongs to a different Company → `422 CROSS_ENTITY_MISMATCH` (X-3 symmetric) | Integration |
| `I-I-12` | **(v2)** `POST /interactions` with `contactId: null` or `contactId` omitted → 201 with `contactId: null` | Unit |
| `I-I-13` | **(v2)** `POST /interactions/:id` updating `contactId` to a Contact of a different Company → `422 CROSS_ENTITY_MISMATCH` | Integration |
| `I-I-14` | **(v2)** `DELETE /contacts/:id` sets `Interaction.contactId` to null for all interactions that referenced it (symmetric X-6) | Integration cross-module |

### 7.1 Rationale for `I-I-5` (empty note is legal)

An Interaction with no note is a common real record: "I called Alice at 3pm,
brief chat, will follow up." No detailed content, but the fact of the
contact matters. Requiring a non-empty note would force fake content and
degrade data quality.

This is also consequential for L4.5 (reusing Interaction as deal notes) —
if the baseline required `note` to be non-empty, L4.5 would be forced to
relax the constraint, which would look like a valid architectural change
but actually reduce data quality.

---

## 8. Interface Signatures

**Controller** — `src/modules/interaction/interaction.controller.ts`:

```typescript
@Controller('interactions')
class InteractionController {
  @Post()
  create(@Body() dto: CreateInteractionDto): Promise<InteractionResponseDto>

  @Get()
  findAll(@Query() query: InteractionListQuery): Promise<InteractionListResponseDto>

  @Get(':id')
  findOne(@Param('id') id: string): Promise<InteractionResponseDto>

  @Post(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInteractionDto): Promise<InteractionResponseDto>

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void>
}
```

**Service** — `src/modules/interaction/interaction.service.ts`:

```typescript
class InteractionService {
  create(dto: CreateInteractionDto): Promise<Interaction>
  findAll(query: InteractionListQuery): Promise<{ items: Interaction[]; total: number }>
  findOne(id: string): Promise<Interaction>
  update(id: string, dto: UpdateInteractionDto): Promise<Interaction>
  remove(id: string): Promise<void>

  // Called by ContactService.remove (v2)
  detachContact(contactId: string): Promise<void>
}
```

The `detachContact` method is **new in v2**, symmetric to `DealService.detachContact`.

**Repository** — `src/modules/interaction/interaction.repository.ts`:

```typescript
class InteractionRepository extends BaseRepository<Interaction> {
  findWithFilter(query: InteractionListQuery): Promise<{ items: Interaction[]; total: number }>
  findByCompany(companyId: string): Promise<Interaction[]>
  findByContact(contactId: string): Promise<Interaction[]>  // v2 addition
  findLatestOccurredAtForCompanies(companyIds: string[]): Promise<Map<string, Date | null>>
  countByCompany(companyId: string): Promise<number>
}
```

**On `findLatestOccurredAtForCompanies`**:

This is a **batch-friendly** query returning a map from companyId → latest
`occurredAt`. It is used by `CompanyService.findAll` to attach
`lastContactedAt` to N companies in a single repository call, avoiding N+1.

**On `findByContact` (v2)**:

Exposed because `ContactService.remove` needs to know which Interactions
reference a Contact before detaching (or to short-circuit if none exist).
Pure data query, no business logic.

**Entity** — `src/modules/interaction/interaction.entity.ts`:

```typescript
@Entity('interactions')
class Interaction {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column('uuid') companyId: string;

  @Column({ type: 'uuid', nullable: true })  // v2 addition
  contactId: string | null;

  @Column({ type: 'enum', enum: ['call', 'email', 'meeting', 'note'] })
  type: 'call' | 'email' | 'meeting' | 'note';

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'timestamptz' })
  @Index()   // occurredAt is the primary sort key
  occurredAt: Date;

  @ManyToOne(() => Company, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @ManyToOne(() => Contact, { onDelete: 'SET NULL', nullable: true })  // v2 addition
  @JoinColumn({ name: 'contactId' })
  contact: Contact | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
```

The v2 additions are `contactId` column with `SET NULL` on Contact deletion,
mirroring Deal's Contact FK behaviour.

---

## 9. Frontend API Client Contract

`frontend/src/services/api/interaction.api.js`:

```javascript
export const interactionsApi = {
  list: (params) => Promise<InteractionList>,
  get: (id) => Promise<Interaction>,
  create: (dto) => Promise<Interaction>,       // → POST /api/v1/interactions
  update: (id, dto) => Promise<Interaction>,   // → POST /api/v1/interactions/:id
  remove: (id) => Promise<void>,
};
```

Types generated from `openapi.yaml`. The `type` field's TypeScript union is
generated exactly as `'call' | 'email' | 'meeting' | 'note'`, so any
frontend switch on `type` gets exhaustiveness checking.

**Frontend contactId selector**: the interaction form pre-fetches
`GET /contacts?companyId=<currentCompany>` and shows a dropdown of that
Company's Contacts (plus "None"). The frontend thus enforces X-3 at the UI
layer — a user cannot select a Contact from the wrong Company — providing
defence in depth with the backend's X-3 check.

---

## 10. Test Coverage Requirements

| Layer | File | Minimum cases |
|---|---|---|
| Repository | `interaction.repository.spec.ts` | happy, filter (companyId, contactId, type, date range), `findLatestOccurredAtForCompanies` batch, `countByCompany`, `findByContact` |
| Service | `interaction.service.spec.ts` | happy per method, `FUTURE_TIMESTAMP`, `PARENT_NOT_FOUND` (both companyId and contactId), **CROSS_ENTITY_MISMATCH (X-3 symmetric)**, empty note allowed, `detachContact` sets contactId to null |
| Controller | `interaction.controller.spec.ts` | 201/200/204, 404, 422 (including X-3 CROSS_ENTITY_MISMATCH) |
| End-to-end | `interaction.e2e-spec.ts` | full CRUD; create → Company's `lastContactedAt` reflects it; delete Contact → linked Interactions have contactId nulled; create with mismatched contactId → 422 |
| Frontend | `interaction.api.spec.js` | request contracts; enum exhaustiveness compile-check; update uses POST not PATCH |

---

## 11. Traceability

| Item | Trace |
|---|---|
| Entity fields | `PRD_v2 §2.4` Interaction row |
| `companyId` FK naming (v2) | `PRD_v2 §1.2.1` |
| `contactId` field (v2) | `PRD_v2 §2.4.1`, §4 above |
| X-3 symmetric application | [cross-entity.md X-3](./cross-entity.md#x-3-nullable-contactid-must-belong-to-parent-companyid) |
| Enum tightness | §3, protection against L5a drift |
| `dealId` deliberately absent | `CRM_Scope §5.1` (baseline-v0/v1 rationale) |
| Note reuse for deal notes deliberately absent | `CRM_Scope §4.4 T4.5` (L4 experimental task) |
| Feeds `Company.lastContactedAt` (derivation) | [company.md §8](./company.md#8-derived-fields-lastcontactedat) |
| Feeds L3 `healthScore` computation | `CRM_Scope §4.3` (experimental) |
| POST double role | [principles.md §3.1](./principles.md#31-the-post-double-role-convention) |
| X-3 as generalisation signal (L4.2) | §4.3 (creative extension) |
