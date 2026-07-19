<!--
Task: T2 (Weaving — Contact↔Company and Deal↔Contact become many-to-many)
Variant: structured
Blocks enabled: 1, 2, 3, 4, 5, 6, 7
Rule IDs targeted (partial, per current rulepack draft):
  BE-DEP-C-001, BE-DEP-C-002, BE-DEP-C-003,
  BE-DOM-C-001, BE-DOM-C-002,
  BE-ERR-C-001, BE-ERR-C-002,
  BE-CONTRACT-C-001, BE-CONTRACT-C-002,
  FE-DATA-C-001,
  CROSS-TYPE-C-001, CROSS-EP-C-001, CROSS-ERR-C-001, CROSS-NAME-C-001
Derived from: prompt_meta_template_v2.md
Source documents:
  - CRM_Scope_v2_Task_Design.docx (Sprint 2 — Weaving)
  - architecture-concerns-matrix.docx (BE-DEP, BE-DOM, BE-CONTRACT, CROSS-* rows)
  - API_Interface_Spec.md §3
Content hash (SHA-256 of blocks 3+4+5): [pending — set at freeze commit]
Frozen at: [pending — set at freeze commit]
-->

<!--
Task: T2 (Contact↔Company and Deal↔Contact become many-to-many)
Variant: minimal
Blocks enabled: 1, 2, 3, 4, 5, 7 
Rule IDs targeted: none by design 
Derived from: prompt_meta_template_v2.md
Source documents:
Content hash (SHA-256 of blocks 3+4+5): [pending — must match T2_structured.md]
Frozen at: [pending — set at freeze commit]
--> 

## 1. Agent Role

You are a senior full-stack engineer working on a production-grade multi-tenant CRM built with NestJS using TypeScript (backend), React with MUI using JavaScript (frontend), and TypeORM with PostgreSQL.

## 2. Codebase Orientation

The `deal`, `contact`, and `company` modules exist at `backend/src/module/{deal,contact,company}/`. No link modules currently exist. Migrations are located at `backend/src/database/migrations/`; the seed entry point is `backend/src/database/seed/seed.ts`. Shared infrastructure at `backend/src/common/` includes `database/base.repository.ts` (defines a paginated result shape `{ items, total, page, pageSize }`), `filter/http-exception.filter.ts`, and `exceptions/` (contains an `EntityNotFoundException` introduced in a prior sprint, mapping to HTTP 404 with `code: 'NOT_FOUND'`). Entry points: `main.ts` (global prefix `/api/v1`, global `ValidationPipe`, global `HttpExceptionFilter`), `app.module.ts`. Frontend feature pages live under `frontend/src/pages/{companies,contacts,deals}/`; API clients under `frontend/src/api/`; routes register in `frontend/src/routes/route-registry.js`.

## 3. Problem Statement

### Feature Request: Upgrade Contact–Company and Deal–Contact to many-to-many

### Background

The CRM currently models Contact–Company and Deal–Contact as single-parent relationships: a Contact belongs to exactly one Company, and a Deal points to at most one Contact. This shape reflected the assumption that people work at one company and every deal has one point of contact.

### Current Problem

Two customer complaints in the same week traced to the same modelling assumption. First, a purchasing manager at an enterprise client is the decision-maker for both a parent company and its subsidiary. The current data model forces the sales rep to bind him to one Company only; the other side's account manager sees an empty contact list on their side of the org and effectively goes blind on that relationship. Second, a six-figure deal involves three people on the customer side — a business owner, a legal reviewer, and an IT lead. Only one fits into the current Deal's single Contact slot. The rep has been writing the other two into a free-text note field, and pipeline dashboards cannot count them.

### Desired Outcome

Contact–Company becomes many-to-many; each Contact retains exactly one Company marked as **primary** for display and address-book purposes. Deal–Contact becomes many-to-many, with an optional free-text **role** per link (e.g. "decision-maker", "legal") and an optional **primary** contact per Deal for list-view display. Deal–Company remains one-to-many — a Deal still happens at exactly one Company. All existing data must survive the upgrade: every Contact currently in the database ends up with its former Company as its primary link; every Deal's former Contact becomes a linked contact and is set as that Deal's primary. No data loss. Frontend surfaces are updated so reps can attach multiple contacts to a deal, link a contact to additional companies, and mark primaries.

## 4. Requirements

### Target schema

1. A Contact SHALL support being linked to one or more Companies simultaneously.
2. A Contact SHALL have exactly one linked Company marked as its primary at any point in time.
3. A Deal SHALL support being linked to zero or more Contacts.
4. Each Deal-to-Contact link SHALL carry an optional free-text `role`.
5. A Deal SHALL support recording an optional primary Contact whose id appears among the Deal's linked Contacts.
6. A Deal SHALL continue to reference exactly one Company; the Deal–Company cardinality is unchanged.

### Migration semantics

7. After migration, every Contact that previously referenced a Company SHALL be linked to that same Company with primary = true.
8. After migration, every Deal that previously referenced a Contact SHALL be linked to that same Contact with `role` unset, and that Contact SHALL be set as the Deal's primary Contact.
9. After migration, the previous per-Contact single-Company reference field SHALL no longer appear in Contact API responses.
10. After migration, the previous per-Deal single-Contact reference field SHALL no longer appear in Deal API responses.
11. Re-running the migration against an already-migrated database SHALL succeed without duplicating link rows or raising errors.
12. Rolling back the migration SHALL restore the previous schema shape; data restoration is best-effort.

### Link operations

13. A user SHALL be able to attach an existing Contact to an existing Company as a link, optionally marking that link as the Contact's primary.
14. Attaching a Contact to a new Company with the primary flag SHALL demote the Contact's previous primary link in the same operation.
15. A user SHALL be able to detach a Contact from a Company without deleting the Contact record.
16. Detaching the link that is a Contact's only primary Company SHALL be refused with `code: 'INVALID_LINK_STATE'`.
17. A user SHALL be able to replace the full set of linked Contacts and the primary Contact on a Deal in one atomic operation.

### Modified CRUD

18. Creating a Contact SHALL require the caller to specify one or more Company links with exactly one marked primary.
19. Updating a Contact's Company links SHALL preserve the "exactly one primary" invariant.
20. Fetching a Contact SHALL return the Contact with its linked Companies in an array, primary Company first.
21. Fetching a Deal SHALL return the Deal with its linked Contacts fully expanded and its primary Contact identified.
22. Filtering Contacts by companyId SHALL return every Contact linked to that Company via any link, whether primary or not.
23. Creating a Deal SHALL optionally accept zero or more Contact links and an optional primary Contact.

### Error semantics

24. Creating a Contact with zero Company links SHALL return `code: 'VALIDATION_ERROR'`.
25. Creating or updating a Contact with more or fewer than exactly one primary Company link SHALL return `code: 'VALIDATION_ERROR'`.
26. Setting a Deal's primary Contact to an id not present in the Deal's linked-Contact set SHALL return `code: 'VALIDATION_ERROR'`.
27. Attaching a Contact to an unknown Company SHALL return `code: 'NOT_FOUND'`.
28. Attaching an unknown Contact to a Company SHALL return `code: 'NOT_FOUND'`.
29. Replacing a Deal's Contacts with a list containing any unknown Contact id SHALL return `code: 'NOT_FOUND'` and leave the Deal unchanged.

### Edge cases

30. A Contact linked to exactly one Company (that link being primary) SHALL be a valid state accepted on create, update, and read.
31. A Deal with zero linked Contacts SHALL be a valid state accepted on create, update, and read.
32. A Contact linked to multiple Companies SHALL render on Contact list and detail views without error.
33. A Deal with multiple linked Contacts SHALL render on Deal list and detail views without error.

### UI acceptance

34. Users SHALL be able to attach an existing Contact to a Company from the Company detail page.
35. Users SHALL be able to remove a Contact–Company link from the Company detail page; the confirmation SHALL state that the Contact record itself is not deleted.
36. Users SHALL be able to add or remove multiple Contacts on a Deal and set one of them as primary, from the Deal edit surface.
37. The Contact list SHALL visually indicate when a Contact is linked to more than one Company.
38. UI actions that would violate the "exactly one primary Company per Contact" invariant SHALL either be prevented at submission time or surface the returned `INVALID_LINK_STATE` code as an inline message.

### Data setup

39. After the `demo` seed runs, at least one Contact SHALL be linked to two or more Companies with a clearly marked primary.
40. After the `demo` seed runs, at least one Deal SHALL have three linked Contacts with distinct `role` strings.
41. After the `edge-case` seed runs, at least one Deal SHALL have zero linked Contacts.

## 5. API Contract

External API Contract. The internal architecture, file structure, class names, DTO definitions, and link-table entity design used to satisfy this contract are left to the implementer. All routes are relative to the global prefix `/api/v1`.

### Endpoint 1 — Create Contact (modified)

- **Route:** `POST /contacts`

- **Request body:**
  
  ```json
  {
    "firstName": "string (required, non-empty)",
    "lastName": "string (required, non-empty)",
    "email": "string (optional)",
    "phone": "string (optional)",
    "role": "string (optional)",
    "companyIds": [
      { "id": "uuid", "isPrimary": true }
    ]
  }
  ```
  
  `companyIds` is required, min length 1, exactly one entry with `isPrimary: true`.

- **201 response:** full Contact object including `companies: Company[]` (primary Company first).

- **400** `{ "code": "VALIDATION_ERROR", "error": "<message>" }` — `companyIds` violates min-length, contains ≠ 1 primary, or the body carries unknown fields.

- **404** `{ "code": "NOT_FOUND", "error": "<message>" }` — any id in `companyIds` is unknown.

### Endpoint 2 — Update Contact (modified)

- **Route:** `PATCH /contacts/:id`
- **Request body:** partial of Endpoint 1's body. If `companyIds` is present, it atomically replaces the Contact's link set and must satisfy the "exactly one primary" invariant.
- **200 response:** full Contact with `companies: Company[]`.
- **400** `VALIDATION_ERROR`; **404** `NOT_FOUND`.

### Endpoint 3 — Fetch Contact (response shape changed)

- **Route:** `GET /contacts/:id`
- **200 response:** Contact object with `companies: Company[]` (primary first). The previous single-Company reference field is absent.
- **404** `NOT_FOUND`.

### Endpoint 4 — List Contacts (query semantics changed)

- **Route:** `GET /contacts`
- **Query params:** `page` (int, default 1), `pageSize` (int, default 20, max 100), `companyId` (uuid — matches any link, primary or not), `q` (string), `role` (string).
- **200 response:** `{ "items": Contact[], "total": int, "page": int, "pageSize": int }`.

### Endpoint 5 — Attach Contact to Company (new)

- **Route:** `POST /companies/:id/contacts`
- **Request body:** `{ "contactId": "uuid", "isPrimary": false }`. `isPrimary` optional, default false.
- **201 response:** link summary `{ "companyId", "contactId", "isPrimary", "createdAt" }` or 204 with empty body.
- **404** `NOT_FOUND` — company `:id` or `contactId` unknown.
- **409** `{ "code": "INVALID_LINK_STATE", "error": "<message>" }` — the operation would violate a link invariant.

### Endpoint 6 — Detach Contact from Company (new)

- **Route:** `DELETE /companies/:id/contacts/:contactId`
- **204** on success.
- **404** `NOT_FOUND` — the link does not exist.
- **409** `INVALID_LINK_STATE` — the link is the Contact's only primary; the invariant "exactly one primary per Contact" would be violated.

### Endpoint 7 — Create Deal (modified)

- **Route:** `POST /deals`

- **Request body:**
  
  ```json
  {
    "title": "string (required, non-empty)",
    "value": "number (required, >= 0)",
    "stage": "string (optional, default 'lead')",
    "companyId": "uuid (required)",
    "contacts": [
      { "id": "uuid", "role": "string (optional)" }
    ],
    "primaryContactId": "uuid (optional; if set, must equal one contacts[].id)",
    "expectedCloseDate": "ISO date (optional)"
  }
  ```
  
  `contacts` is optional and may be empty or omitted.

- **201 response:** Deal object with `contacts: Contact[]` (fully expanded) and `primaryContactId`.

- **400** `VALIDATION_ERROR`; **404** `NOT_FOUND` — `companyId` or any `contacts[].id` unknown.

### Endpoint 8 — Update Deal (modified)

- **Route:** `PATCH /deals/:id`
- **Request body:** partial of Endpoint 7. If `contacts` is present, it atomically replaces the Deal's link set. `primaryContactId` must appear in the resulting link set.
- **200 response:** full updated Deal.
- **400** `VALIDATION_ERROR`; **404** `NOT_FOUND`.

### Endpoint 9 — Fetch Deal (response shape changed)

- **Route:** `GET /deals/:id`
- **200 response:** Deal with `contacts: Contact[]` expanded, `primaryContactId`, and `company: { id, name }` embedded (unchanged from prior sprint). The previous single-Contact reference field is absent.
- **404** `NOT_FOUND`.

### Endpoint 10 — Replace Deal Contacts (new)

- **Route:** `PATCH /deals/:id/contacts`
- **Request body:** `{ "contacts": [{ "id": "uuid", "role": "string?" }], "primaryContactId": "uuid?" }`.
- **200 response:** full updated Deal.
- **400** `VALIDATION_ERROR` — `primaryContactId` not present in `contacts`.
- **404** `NOT_FOUND` — Deal id unknown, or any contact id unknown; on 404 the Deal is left unchanged.

## 6. Rules

*Partial rule set — the full rulepack is under construction; only the constraints that carry the highest risk for this sprint are listed. Every rule below maps 1:1 to an entry planned for `rulepacks/`, and every rule is statically verifiable.*

### R1 — Backend

**Layering.** Controllers only orchestrate: they receive HTTP, call one service method, translate exceptions to status codes, and shape the response. Controllers SHALL NOT import repositories or the TypeORM `DataSource`/`EntityManager` directly. Services SHALL NOT import from controllers. Repositories SHALL NOT import from services or controllers. (Rule IDs: `BE-DEP-C-001`, `BE-DEP-C-002`.)

**No circular dependencies.** No import cycle SHALL exist across the `deal`, `contact`, `company`, and any new link modules. Use forward references at the module-wiring layer if necessary; do not close a cycle at the service or repository layer. (Rule ID: `BE-DEP-C-003`.)

**Domain boundaries.** Cross-module data access SHALL go through the target module's service, never its repository. When the deal module needs contact data, it depends on the contact module's service; it does not inject the contact repository. Deep-path imports across modules (e.g. `import { X } from '../contact/repository/...'`) are forbidden. (Rule IDs: `BE-DOM-C-001`, `BE-DOM-C-002`.)

**Link-table ownership.** The two new link tables (Contact–Company link, Deal–Contact link) SHALL be owned by their own dedicated service classes. Contact-side and Company-side services delegate link operations to the link-table service; they do not write to the link table directly. (Consequence of `BE-DEP-C-001` + `BE-DOM-C-001`.)

**Error and transaction handling.** Service methods SHALL NOT throw raw `HttpException`. Domain exceptions from `common/exceptions/` SHALL be used; the global filter is responsible for HTTP translation. The atomic operations required by Requirements 14 and 17 SHALL be wrapped in a database transaction so that partial writes are impossible on failure. (Rule IDs: `BE-ERR-C-001`, `BE-ERR-C-002`.)

**Data contract stability.** Any entity field change SHALL be accompanied by a migration file. Every DTO used at controller boundaries SHALL declare its shape via `class-validator` decorators; direct `req.body` access is forbidden. (Rule IDs: `BE-CONTRACT-C-001`, `BE-CONTRACT-C-002`.)

### R2 — Frontend

**Data-fetching location.** `fetch` and `axios` calls SHALL only appear inside `frontend/src/api/*.js` client files. Components SHALL NOT import `axios` or call `fetch` directly. (Rule ID: `FE-DATA-C-001`.)

### R3 — Cross-Stack

**Type contract consistency.** Fields sent by the frontend request bodies and read from response bodies SHALL match the backend DTOs and response shapes byte-for-byte, including the new `companies[]`, `contacts[]`, `primaryContactId`, `isPrimary`, and `role` fields. No legacy field name (the previous per-Contact single-Company reference, the previous per-Deal single-Contact reference) SHALL survive in any frontend code path after this sprint. (Rule ID: `CROSS-TYPE-C-001`.)

**Endpoint existence.** Every URL called from the frontend SHALL correspond to a route registered on the backend, and vice versa for URLs the frontend expects to hit. The new endpoints introduced in Block 5 (Endpoints 5, 6, 10) SHALL be wired on both sides in this sprint. (Rule ID: `CROSS-EP-C-001`.)

**Error code convention.** Every error code the frontend maps (in its Snackbar / inline-error layer) SHALL correspond to a code returned by the backend, and vice versa. The new code `INVALID_LINK_STATE` introduced in this sprint SHALL be wired on both sides in this sprint. (Rule ID: `CROSS-ERR-C-001`.)

**Resource naming alignment.** The backend routes `/companies/:id/contacts` and `/deals/:id/contacts` and the frontend module folders `pages/companies/`, `pages/contacts/`, `pages/deals/` SHALL use the same lexical stems. (Rule ID: `CROSS-NAME-C-001`.)

## 7. Delivery / Meta

**Delivery & Verification Protocol.**

- **Autonomous Verification.** You MUST write and execute functional tests (`npm run test`) to verify your implementation. You are responsible for fixing any compilation errors or failing tests before concluding.
- **Architecture Blindness.** You are strictly forbidden from running architectural linters, dependency-cruisers, or custom rulepacks. Your task is to fulfill the functional requirements.
- **Output Discipline.** Do NOT print raw source code, diffs, or design rationales. Modify the files directly in the workspace.
- **Termination Signal.** Once your tests pass and the implementation is complete, output exactly `[TASK_COMPLETED]` on a new line and terminate your process immediately.
