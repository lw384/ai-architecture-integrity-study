# CRM API — Design Principles

> **Scope**: Cross-cutting conventions shared by all four entity APIs (Company,
> Contact, Interaction, Deal). Entity-specific specs **reference** this
> document; they do not restate its rules.
>
> **Audience**: (a) the baseline implementer, (b) LLM agents in experimental
> conditions, (c) the evaluation harness, (d) external readers of the
> dissertation appendix.
>
> **Version**: `v2.0` — aligned with `PRD_v2.docx`. Changes from v1: Customer
> renamed to Company; PATCH removed in favour of POST for both create and
> partial update.
>
> **Source lineage**: `PRD_v2.docx §1, §4`; `CRM_Scope_v2_Task_Design.docx §2, §3`;
> `Rule_Registry_v0.1.md` (R2 WEB-1..6, R3 STY-5/WEB-7/WEB-8, R4 WEB-9/WEB-10).

---

## 1. Foundational Choices

**Base path**: `/api/v1`. All endpoints live under this prefix. Semantic
versioning is used at the URL level; a breaking change requires `v2`.

**Content negotiation**:

- Request `Content-Type: application/json; charset=utf-8`.
- Missing or non-JSON body on write endpoints → `400 MALFORMED_BODY`.
- Response `Content-Type: application/json; charset=utf-8` on every non-`204`
  response, including error responses.

**Character encoding**: UTF-8 everywhere. Strings are Unicode; length limits
are in **Unicode code points**, not bytes.

**HTTP protocol**: HTTP/1.1 minimum. No assumption of HTTP/2 features.

---

## 2. Error Envelope (R3)

All non-2xx responses use a **single unified envelope**:

```json
{
  "error": {
    "code": "ENTITY_NOT_FOUND",
    "message": "Company with id 'a3f8c1e2-...' not found",
    "details": {
      "resource": "Company",
      "id": "a3f8c1e2-..."
    }
  }
}
```

**Field discipline**:

| Field | Type | Required | Notes |
|---|---|---|---|
| `error.code` | `string` | ✅ | `SCREAMING_SNAKE_CASE` enum; the **frontend switches on this**, not on HTTP status |
| `error.message` | `string` | ✅ | Human-readable, developer-facing (English only, no i18n in v1) |
| `error.details` | `object` | ❌ | Structured extras; must never contain stack traces, SQL, or internal identifiers |

**Rationale for making `code` primary and HTTP status secondary**:
`Rule Registry` R3 requires "domain exceptions from services" with a global
filter mapping to status codes. If the frontend switched on HTTP status alone,
`422 CROSS_ENTITY_MISMATCH` and `422 EMPTY_STRING` would be indistinguishable —
the frontend could not offer meaningful recovery UI. The typed `code` is the
contract; the HTTP status is transport metadata.

**Global registry of error codes** — see [cross-entity.md §5](./cross-entity.md#5-error-code-registry).

---

## 3. HTTP Method Semantics (v2 — POST-only for writes)

**Main point**: writes use `POST`. Reads use `GET`. Deletes use `DELETE`.
There is no `PATCH` and no `PUT` in this API. `POST` is overloaded to express
both create and partial update, disambiguated by URL shape.

### 3.1 The POST double-role convention

| URL shape | Body | Semantics | Response |
|---|---|---|---|
| `POST /resource` | fields to create | **create** | `201 Created` + `Location: /resource/:id` + created entity |
| `POST /resource/:id` | fields to change | **partial update** (unspecified fields unchanged) | `200 OK` + updated entity |
| `POST /resource/:id` | empty `{}` | (rejected) | `400 EMPTY_UPDATE` |
| `POST /resource/:id` | only read-only fields (id, createdAt, updatedAt) | (rejected, after middleware strip leaves empty) | `400 EMPTY_UPDATE` |

**Rationale** (elaborated in `PRD_v2 §1.2.2`):

1. **Experimental focus** — the 400 / 409 / 422 status-code boundary is a
   direct L2 measurement target (`CRM_Scope §4.2`: 'not distinguishing 400 Bad
   Request from 409 Conflict for illegal transitions'). Keeping only one write
   method (POST) removes the orthogonal decision "which method?" from the
   agent's task surface, letting the status-code decision be measured cleanly.

2. **Prior-distribution alignment** — LLM agents trained on public code
   trend toward RPC-style POST usage for state-changing operations; Stripe,
   Shopify Admin, and many enterprise APIs adopt the same pattern. Matching
   this distribution reduces spurious method-choice noise in the experimental
   signal.

3. **The PATCH-as-sensor property** — if an agent spontaneously introduces
   `PATCH` in L1 or L4, that is a measurable "specification gap-filling"
   signal (in the sense of `CRM_Scope §4.5` L5a). The baseline's POST-only
   convention thus turns PATCH itself into an observable: any `PATCH` handler
   the agent writes is evidence of the agent's REST-canonical prior overriding
   the in-context example.

### 3.2 HTTP status code matrix

**Success codes**:

| Code | Meaning | Typical use |
|---|---|---|
| `200 OK` | Success with body | `GET`, `POST /:id` (update) |
| `201 Created` | Resource created | `POST` (create); response includes `Location` header |
| `204 No Content` | Success without body | `DELETE` |

**Client-error codes**:

| Code | Meaning | Boundary rule |
|---|---|---|
| `400 Bad Request` | Malformed input | JSON parse failure, wrong type, missing required field, empty update body |
| `404 Not Found` | Target or FK target absent | Path `:id` or a `parentId` in body does not exist |
| `409 Conflict` | State conflict | Violation of a business invariant on an otherwise-valid input (e.g., illegal state transition, referential integrity block) |
| `422 Unprocessable Entity` | Semantic validation failure | Field-well-formed but semantically invalid across fields or entities |

**Server-error codes**:

- `500 Internal Server Error` — reserved for the global exception filter's
  catch-all. If a service throws a raw `HttpException` with `500`, that is a
  **rule violation** (R3), not a legitimate response.

### 3.3 The 400 vs 422 boundary

Rule of thumb:

- **400**: the request could not be *understood* — parse error, type error,
  missing required field, unknown enum value, empty update body.
- **422**: the request was understood, individual fields are well-formed, but
  the *combination* violates a semantic rule (cross-field, cross-entity, or
  business).

Examples:

| Request | Response |
|---|---|
| `POST /deals` with `value: "not-a-number"` | `400 INVALID_TYPE` |
| `POST /deals` with `value: -1` | `422 NEGATIVE_VALUE` |
| `POST /deals` with `contactId` pointing to a Contact of a different Company | `422 CROSS_ENTITY_MISMATCH` |
| `POST /deals` with `companyId` pointing to a non-existent Company | `404 PARENT_NOT_FOUND` |
| `POST /deals/:id` with `{}` | `400 EMPTY_UPDATE` |
| `POST /deals/:id` with `{ "companyId": "..." }` | `422 IMMUTABLE_FIELD` |

### 3.4 The 409 vs 422 boundary

- **409**: the resource itself is in a state that **conflicts** with the request
  (e.g., trying to advance a `closed-won` deal, deleting a Company that has
  children). The request would be valid *if the resource state were different*.
- **422**: the request's own content is the problem, independent of any
  resource's current state.

---

## 4. URL and Naming Conventions (R2, R5)

**URL structure**:

- Lowercase plural nouns: `/companies`, `/contacts`, `/interactions`, `/deals`.
- Nesting depth ≤ 2 (`R2 WEB-3`). Prefer flat + filter query parameters:
  - ✅ `GET /contacts?companyId=<uuid>`
  - ❌ `GET /companies/<uuid>/contacts` (permitted only for `L4.3` summary and
    `L4.5` deal notes, both of which are experimental features not present in
    baseline).
- No trailing slashes on canonical URLs.
- IDs are always UUID v4 in path parameters (`/companies/{uuid}`), never
  incrementing integers.

**JSON body and query parameters**:

- All keys are `camelCase`: `companyId`, `sortOrder`, `expectedCloseDate`.
- Enum values are lowercase kebab or lowercase words depending on the natural
  form of the term. The baseline pins each entity's enum style explicitly:
  - `Company.status`: `'active' | 'inactive'` (lowercase words)
  - `Interaction.type`: `'call' | 'email' | 'meeting' | 'note'` (lowercase words)
  - `Deal.stage` (baseline-v1, free string; L2 introduces): `'lead' | 'qualified' | 'proposal' | 'negotiation' | 'closed-won' | 'closed-lost'` (lowercase kebab for compound)

---

## 5. Null Semantics

A recurring source of agent bugs (`CRM_Scope §2.2`: 'code must consistently
handle null/undefined values across all layers'). The baseline commits to a
tri-state model:

| Value | Semantic |
|---|---|
| `null` | **Known absence** — the field has been considered and is deliberately not set (e.g., `Deal.expectedCloseDate: null` = "no close date agreed yet") |
| Field omitted from request | **No opinion** — in `POST /:id` update, server does not modify the field; in `POST` create, server applies the default |
| `""` (empty string) | **Not equivalent to null** — string fields require `.trim().length > 0` if present; a submitted `""` → `422 EMPTY_STRING` |
| `undefined` (JS-side) | Never crosses the wire; serialized as omission |

**Rationale for treating `""` as an error rather than a null**: a client that
sends `""` has almost certainly made a form-binding mistake. Silently coercing
to `null` masks the bug and creates data-quality drift. This choice will be
consequential in L5a ("customer information looks wrong") — the agent will be
tempted to "clean" empty strings, and the baseline's explicit rejection of
them becomes a signal.

---

## 6. Timestamps and Identifiers

**Timestamps**:

- All timestamps are **ISO 8601 UTC with milliseconds and `Z` suffix**:
  `2026-07-02T10:30:00.000Z`.
- Server-generated (`createdAt`, `updatedAt`, `stageChangedAt` in L2+); client
  **never** submits them. If a client includes them in `POST` create or
  `POST /:id` update body, they are **silently stripped** by middleware before
  controller entry (not rejected, to accommodate clients that echo back the
  full entity on update).
- **Exception**: `Deal.expectedCloseDate` and `Interaction.occurredAt` are
  client-submitted:
  - `expectedCloseDate` uses **date-only** format `YYYY-MM-DD` (business day granularity, no time).
  - `occurredAt` uses full ISO 8601 UTC (may be past; future rejected with 60s tolerance — see interaction spec).

**Identifiers**:

- All primary keys are UUID v4, server-generated on `POST` create.
- Client-submitted `id` in `POST` create body is **silently stripped**.
- Client-submitted `id` in `POST /:id` update body is also silently stripped,
  even if it matches the path parameter.

---

## 7. Pagination, Filtering, Sorting

Every list endpoint (`GET /<resource>`) uses the same shape.

**Query parameters**:

| Param | Type | Default | Constraint |
|---|---|---|---|
| `limit` | integer | `20` | 1..100 |
| `offset` | integer | `0` | ≥ 0 |
| `sort` | string | entity-specific | must be in per-entity whitelist |
| `order` | `'asc' \| 'desc'` | entity-specific | |
| entity filters | various | absent = no filter | see entity spec |

**Response envelope**:

```json
{
  "items": [ /* array of resource */ ],
  "pagination": {
    "total": 142,
    "limit": 20,
    "offset": 0
  }
}
```

**Discipline**:

- `total` is the **filtered** count, not the global count.
- Unknown query parameters are **silently ignored**, not rejected. This is
  deliberate: L5a ("improve the company list page") will observe how the
  agent extends filter capabilities. Strict rejection would either force the
  agent into a permissive change first, or produce false failures during
  exploratory improvement.
- Sort field must be in the per-entity whitelist; unknown sort field →
  `400 INVALID_SORT_FIELD`.

---

## 8. Idempotency (R2 WEB-1)

| Method | Idempotent | Safe (no state change) |
|---|---|---|
| `GET` | ✅ | ✅ |
| `POST` (create) | ❌ | ❌ |
| `POST` (update) | ❌ | ❌ |
| `DELETE` | ✅ | ❌ |

**On POST-for-update non-idempotency**: sending the same `POST /companies/:id`
twice may produce different results if the update body includes a value
computed from the current state (rare in practice, but possible). This is a
weaker guarantee than `PATCH`, which is also non-idempotent by RFC but often
treated as idempotent-in-practice for scalar assignments. The baseline
acknowledges this weakening and does not attempt to compensate with
idempotency keys or `If-Match` headers — those add complexity orthogonal to
the research question. Retries are the client's responsibility.

**`DELETE` idempotency** means a second `DELETE` on an already-deleted
resource returns `404 ENTITY_NOT_FOUND`, not `204`. The choice is documented
here so agents modifying delete semantics in L4.8 (unified error format) do
not inadvertently regress it.

---

## 9. Referential Integrity (Cross-Entity Preview)

Three rules apply globally; details in [cross-entity.md](./cross-entity.md):

1. **Deleting a parent with existing children** → `409 REFERENTIAL_INTEGRITY_VIOLATION`.
   The response `details` enumerates blocking child counts.
2. **Creating/updating a child with a non-existent parent** → `404 PARENT_NOT_FOUND`.
3. **A cross-reference (e.g., `Deal.contactId`, `Interaction.contactId`) whose
   value exists but is associated with the wrong parent** →
   `422 CROSS_ENTITY_MISMATCH`.

**Design commitment**: the baseline does **not** implement soft-delete or
cascade-delete anywhere. This is a research-instrument choice — L5b probes
whether the agent proposes soft-delete when asked to "let users delete records
to keep the database clean". If the baseline shipped soft-delete, L5b would
degenerate.

---

## 10. Validation Discipline (R4)

- Every write endpoint (`POST`, `POST /:id`) accepts a **`class-validator`
  DTO**. Direct `req.body` access in controllers is forbidden.
- DTOs live in `src/modules/<feature>/dto/`.
- The global `ValidationPipe` runs with:
  ```typescript
  new ValidationPipe({
    whitelist: true,               // strip unknown fields
    forbidNonWhitelisted: false,   // do not reject unknown fields, strip silently
    transform: true,               // auto-coerce path/query types
    forbidUnknownValues: true,     // safety against prototype pollution
  })
  ```

**On `forbidNonWhitelisted: false`**: contrary to `Rule Registry` R4 default
(`forbidNonWhitelisted: true`), the baseline uses `false`. Justification: L5a
observes agent behaviour under vague instructions; strict rejection of unknown
fields creates false-signal failures when the agent tentatively adds a new
field. The whitelist still strips silently, so no data reaches the service.
This is documented as a deliberate deviation from R4 default, and the agent's
own R4-compliant additions may re-enable strict rejection without penalty.

---

## 11. Authentication and Authorization

**Out of scope for baseline v0 and v1.** All endpoints are effectively
anonymous. `CRM_Scope §6.2` excludes "Authentication / authorisation / roles"
with the rationale: 'Adds security complexity orthogonal to architectural
conformance; would dominate implementation effort'.

**Implication for prompt design**: prompts must not ask the agent to
"authorize" or "restrict" endpoints. If they do, the agent will either invent
a mechanism (adding measurement noise) or ask a clarifying question (breaking
the autonomous-run assumption).

---

## 12. Rate Limiting, Caching, Compression

None in baseline. Not enforced, not documented as headers. Deferred to future
work; would add noise without measurement value in the current experimental
design.

---

## 13. OpenAPI Contract

The machine-readable single source of truth is `backend/openapi.yaml`,
generated from and kept in sync with these documents. The frontend consumes it
via `openapi-typescript` to produce `frontend/src/services/api/types/generated.ts`
(checked-in).

**Discipline**:

- If a change lands in an entity spec, `openapi.yaml` **must** be updated in
  the same commit. Enforced by a pre-commit hook (see
  `harness/scripts/pre-commit-check-openapi.mjs`).
- The frontend API client (`frontend/src/services/api/*.api.js`) is
  **hand-written**, not generated. Only the *types* are generated. Rationale:
  L2's "API contract consistency" metric compares hand-written client method
  signatures against generated types; if the client were also generated, the
  metric would be trivially satisfied.

---

## 14. Traceability to Rule Registry

| Section | Rule IDs | Harness enforcement |
|---|---|---|
| §2 Error envelope | R3 STY-5, WEB-7, WEB-8 | Manual review; L2/L4.8 focus |
| §3 HTTP method & status | R2 WEB-1..6 | Manual review + integration tests; **PATCH detection** as sensor |
| §4 URL naming | R2 WEB-3 | Manual review; regex-detectable |
| §5 Null semantics | R7 LLM-1, LLM-2 | Unit tests per entity |
| §6 Timestamps/IDs | (implicit) | Middleware unit test |
| §7 Pagination | R2 WEB-4 | Integration test |
| §8 Idempotency | R2 WEB-1 | Integration test |
| §9 Referential integrity | R2 WEB-5, BIZ-1..3 | Integration test |
| §10 Validation | R4 WEB-9, WEB-10, SEC-3 | Unit test + `class-validator` metadata scan |

Every principle traces to a measurable outcome. The **PATCH sensor** in §3 is
a new v2 metric: harness detects any `@Patch()` decorator or `PATCH` in
generated frontend clients, and reports it as a specification-gap-filling
event.

---

## Appendix A — Example Error Responses

```json
// 400 MALFORMED_BODY
{
  "error": {
    "code": "MALFORMED_BODY",
    "message": "Request body is not valid JSON",
    "details": { "parseError": "Unexpected token } in JSON at position 42" }
  }
}
```

```json
// 400 INVALID_TYPE
{
  "error": {
    "code": "INVALID_TYPE",
    "message": "Field 'value' must be a number",
    "details": { "field": "value", "received": "string" }
  }
}
```

```json
// 400 EMPTY_UPDATE
{
  "error": {
    "code": "EMPTY_UPDATE",
    "message": "Update request body must contain at least one modifiable field",
    "details": { "resource": "Company", "id": "a3f8..." }
  }
}
```

```json
// 404 ENTITY_NOT_FOUND
{
  "error": {
    "code": "ENTITY_NOT_FOUND",
    "message": "Company with id 'a3f8c1e2-1234-5678-9abc-def012345678' not found",
    "details": { "resource": "Company", "id": "a3f8c1e2-1234-5678-9abc-def012345678" }
  }
}
```

```json
// 404 PARENT_NOT_FOUND
{
  "error": {
    "code": "PARENT_NOT_FOUND",
    "message": "Referenced Company does not exist",
    "details": { "parent": "Company", "parentId": "a3f8...", "referencedFrom": "Deal.companyId" }
  }
}
```

```json
// 409 REFERENTIAL_INTEGRITY_VIOLATION
{
  "error": {
    "code": "REFERENTIAL_INTEGRITY_VIOLATION",
    "message": "Cannot delete Company with existing children",
    "details": {
      "resource": "Company",
      "id": "a3f8...",
      "blockingChildren": { "contacts": 3, "interactions": 12, "deals": 1 }
    }
  }
}
```

```json
// 422 CROSS_ENTITY_MISMATCH (applies to both Deal.contactId and Interaction.contactId)
{
  "error": {
    "code": "CROSS_ENTITY_MISMATCH",
    "message": "Contact does not belong to the specified Company",
    "details": {
      "field": "contactId",
      "expected": { "companyId": "a3f8..." },
      "actual":   { "companyId": "b4e9..." }
    }
  }
}
```

```json
// 422 EMPTY_STRING
{
  "error": {
    "code": "EMPTY_STRING",
    "message": "Field 'name' must not be empty",
    "details": { "field": "name" }
  }
}
```

```json
// 422 IMMUTABLE_FIELD
{
  "error": {
    "code": "IMMUTABLE_FIELD",
    "message": "Field 'companyId' cannot be modified after creation",
    "details": { "field": "companyId" }
  }
}
```

---

## Appendix B — Change Log

| Version | Date | Change |
|---|---|---|
| `v1.0` | 2026-07-02 | Initial freeze (Customer naming, PATCH-based updates) |
| `v2.0` | 2026-07-03 | Customer → Company; PATCH removed in favour of POST /:id; PATCH-as-sensor added to §3, §14 |
