<!--
Task: T2 (Pipeline State Machine — L2 Cross-Component Consistency)
Variant: structured
Blocks enabled: 1, 2, 3, 4, 5, 6 (R1–R7), 7 (all sub-elements except 7.c)
Rule IDs targeted (D3 = prompt-fixable): ARCH-1, ARCH-2, ARCH-4, WEB-1, WEB-2, WEB-3, WEB-6, WEB-7, WEB-8, WEB-9, STY-3, STY-4, STY-5, BIZ-2, BIZ-3, LLM-1, LLM-2, LLM-4, LLM-6
Derived from: prompt_meta_template_v3.md
Source documents: PRD_v1.docx §Deal §Pipeline; CRM_Scope_v2_Task_Design.docx §4.2; Rule_Registry_v0.1.md
Content hash (SHA-256 of Blocks 3+4+5): [pending — set at freeze commit]
Frozen at: [pending — set at freeze commit]
-->

## 1. Agent Role

You are a senior full-stack engineer working on a production-grade multi-tenant CRM built with **NestJS (backend)**, **React with MUI (frontend)**, **TypeScript throughout**, and **TypeORM with PostgreSQL**. The codebase enforces strict layered architecture: controllers orchestrate, services hold business logic, repositories are the only layer that touches the database.

## 2. Codebase Orientation

Modify the existing Deal module under `src/modules/deal/`:

- **Primary files to touch**: `deal.entity.ts`, `deal.service.ts`, `deal.controller.ts`, and their `dto/`. Existing tests in `deal.service.spec.ts` and `deal.controller.spec.ts` must continue to pass; you may extend them but must not remove existing assertions.
- **Reference pattern for enums and state machines**: `src/modules/customer/customer.entity.ts` uses a TypeORM enum column for `status ∈ {'active', 'inactive'}` — model the new stage enum the same way.
- **Shared utilities**: business exceptions in `src/common/exceptions/`; the exception filter in `src/common/filters/`; test builders in `test/utils/`.
- **Migration**: TypeORM migrations live in `src/migrations/`. Existing Deals in the database currently have `stage` as free-form strings (from T1). A migration is required to normalise them (see Requirements).
- **Frontend consumer**: if a Deal-stage UI component exists at `src/frontend/features/deal/`, update the typed API client type in `src/services/api/deal.ts` in lockstep with the backend DTO.

## 3. Problem Statement

### Refactor Deal.stage from a free string to a constrained state machine

The Deal entity currently stores `stage` as a free-form string with a default value of `'lead'`. In practice, salespeople have entered anything they wanted — including typos (`'quailified'`), synonyms (`'won'` vs `'closed_won'`), and stale values from older workflows (`'proposal_sent'`). Pipeline reports are unreliable because the same conceptual stage appears under multiple spellings.

### Domain context

The pipeline is the backbone of any CRM's forecasting logic. Standard CRMs (Salesforce Opportunity Stages, HubSpot Deal Stages, Pipedrive stages) enforce a fixed set of stages with **allowed transitions** between them. A Deal cannot skip from `lead` directly to `closed_won` without progressing through the intermediate stages, and cannot silently move backwards. When a stage change is invalid, the system rejects it — it does not fail silently and does not auto-correct.

Real-world imperfection: the existing database contains rows whose `stage` values do not match any element of the new controlled vocabulary. Some are typos, some are legacy names, some are blank. The refactor must decide how to treat each case rather than crash on load.

### Why now

Downstream features — pipeline analytics, health scoring, stage-based automation, forecast reports — all depend on the stage vocabulary being closed and the transitions being auditable. Without this refactor those features cannot be built on trustworthy data.

### Success

`Deal.stage` is a typed enum with a well-defined set of allowed values, transitions between stages are validated at the service layer, and existing data is migrated to a canonical form without loss of history. Existing Deal-CRUD tests continue to pass; new tests cover the transition matrix and migration behaviour.

## 4. Requirements

### Stage vocabulary

- Allowed stages, in canonical order: `lead`, `qualified`, `active`, `negotiation`, `closed_won`, `closed_lost`.
- The enum is stored in `src/modules/deal/deal.entity.ts` as `DealStage`.
- Default stage for a newly created Deal remains `'lead'`.

### Transition matrix

- From `lead`: may transition to `qualified` or `closed_lost`.
- From `qualified`: may transition to `active` or `closed_lost`.
- From `active`: may transition to `negotiation` or `closed_lost`.
- From `negotiation`: may transition to `closed_won` or `closed_lost`.
- From `closed_won`: no transitions allowed (terminal).
- From `closed_lost`: may transition to `lead` (reopen); no other transitions allowed.
- Any transition not listed above is invalid.

### Transition preconditions

- Transitioning to `closed_won` requires a non-null `expectedCloseDate` on the Deal.
- Transitioning to `active` requires the Deal to have a non-null `contactId` (a real person to negotiate with).
- Transitioning from any stage to `closed_lost` has no additional preconditions.

### API surface

- The existing `PATCH /deals/:id` endpoint continues to accept partial updates including `stage`, but a stage change is now validated against the transition matrix and the preconditions above.
- A new endpoint `POST /deals/:id/stage` accepts `{ "stage": "<target_stage>" }` and performs an explicit transition. This endpoint returns 200 with the updated Deal, or a business-error response on rejection.
- Rationale for the dedicated endpoint: stage transitions are semantically distinct from generic field updates and are audited separately in downstream analytics.

### Error responses

- Invalid transition (not in matrix): 422, error code `INVALID_STAGE_TRANSITION`, `details` include `from`, `to`, and the list of allowed targets from the current stage.
- Precondition failure (e.g., closing without `expectedCloseDate`): 422, error code `TRANSITION_PRECONDITION_UNMET`, `details` identify which precondition failed.
- Unknown stage string (not in the enum): 400, error code `UNKNOWN_STAGE`.

### Migration of existing data

- A TypeORM migration in `src/migrations/` must map existing free-form `stage` values to the new enum:
  - Exact matches (case-insensitive) to a canonical stage → the canonical stage.
  - Known synonyms (`'won'` → `'closed_won'`, `'lost'` → `'closed_lost'`, `'prospect'` → `'lead'`, `'proposal_sent'` → `'negotiation'`) → the mapped canonical stage.
  - All other values → `'lead'`, with the original value written to a new nullable column `stagePriorToMigration` on the Deal entity for audit purposes.
- The migration must be reversible (a `down` method must exist), and running it twice must be a no-op after the first run.

### Behavioural invariants

- Attempting to change `stage` via `PATCH /deals/:id` uses the same transition validation as `POST /deals/:id/stage`.
- A `PATCH` that does not include `stage` must not touch `stage` — this includes not accidentally re-validating it.
- Existing `deal.controller.spec.ts` and `deal.service.spec.ts` tests must continue to pass without modification. If any existing test fails, it indicates a regression, not a required rewrite.

## 5. Interface

The following public signatures must be present. Unit tests target these exact names.

**Controller additions** — `src/modules/deal/deal.controller.ts`:

```
class DealController (existing, extended)
  transitionStage(id: string, dto: TransitionStageDto): Promise<DealResponseDto>
```

**Service additions** — `src/modules/deal/deal.service.ts`:

```
class DealService (existing, extended)
  transitionStage(id: string, target: DealStage): Promise<Deal>
```

Internal helper (must exist for testability; may be private if language allows):

```
  isTransitionAllowed(from: DealStage, to: DealStage): boolean
  checkTransitionPreconditions(deal: Deal, target: DealStage): void  // throws on failure
```

**Enum** — `src/modules/deal/deal.entity.ts`:

```
enum DealStage
  Lead = 'lead'
  Qualified = 'qualified'
  Active = 'active'
  Negotiation = 'negotiation'
  ClosedWon = 'closed_won'
  ClosedLost = 'closed_lost'
```

**DTO** — `src/modules/deal/dto/transition-stage.dto.ts`:

```
class TransitionStageDto
  stage: DealStage
```

**Migration** — `src/migrations/<timestamp>-normalise-deal-stage.ts`:

```
class NormaliseDealStage implements MigrationInterface
  up(queryRunner: QueryRunner): Promise<void>
  down(queryRunner: QueryRunner): Promise<void>
```

## 6. Rules

### R1 — Architectural Constraints

- Transition validation and precondition checks live in `DealService`. The controller must not inspect `deal.stage`, `deal.contactId`, or `deal.expectedCloseDate` to make routing decisions.
- The migration file may perform raw SQL through `queryRunner` — this is the sanctioned exception for schema changes. Application code must not.
- No upward imports. No circular dependencies. The frontend consumes the backend only through `src/services/api/deal.ts`.

### R2 — HTTP / REST Conventions

- `POST /deals/:id/stage` is used because a stage transition is a non-idempotent action from a client's perspective (auditing counts each transition). Do not model it as `PATCH` on the `stage` field alone.
- Nesting depth ≤ 2. `/deals/:id/stage` is at the boundary; do not go deeper.
- Status codes: 200 (successful transition), 400 (unknown stage string in body), 404 (Deal not found), 422 (invalid transition or precondition failure).
- GET remains safe and idempotent. Do not add stage-change side effects to any GET route.

### R3 — Error Handling

- Introduce (or use, if already present) `InvalidStageTransitionException` and `TransitionPreconditionException` in `src/common/exceptions/`. They map via the global filter to 422 with the specified error codes.
- Do not throw raw `HttpException`.
- Error response envelope remains `{ error: { code, message, details? } }`. `details` for `INVALID_STAGE_TRANSITION` includes `from`, `to`, and `allowedTargets`.

### R4 — DTO Validation

- `TransitionStageDto` uses class-validator with `@IsEnum(DealStage)`.
- The existing `UpdateDealDto` must be updated so its `stage` field, when present, is also `@IsEnum(DealStage)`. Sending an unknown stage via PATCH returns 400 before reaching the service.
- The frontend API-client type for `TransitionStageDto` and `UpdateDealDto` must match the backend DTOs field-for-field. If drift exists, correct it.

### R5 — Naming and Style

- The enum keys are PascalCase (`Lead`, `ClosedWon`); the values are snake_case string literals (`'lead'`, `'closed_won'`). Do not oscillate between camelCase and snake_case in the value strings — mixed conventions across the codebase are a defect this task must not introduce.
- `DealStage` (not `Stage`, not `DealStageEnum`) — align with the existing naming of `CustomerStatus`.
- No `any`. If a legacy value string cannot be narrowed to `DealStage` at load time, use `unknown` and narrow with an explicit guard function.

### R6 — Anti-Shortcut Warning

Two temptations to resist:

- Do NOT write a single UPDATE statement in the migration that silently coerces every unknown value to `'lead'` without preserving the original. The `stagePriorToMigration` column exists precisely to prevent lossy migration; skipping it is a shortcut, not an optimisation.
- Do NOT inline the transition matrix as a nested switch inside the controller for "clarity". The matrix belongs in the service (or a dedicated `deal-transitions.ts` helper imported by the service). Controller-side switches on business enums are exactly the architectural drift this task's evaluation measures.

### R7 — Completeness

- Every stage in `DealStage` must appear as either a source or a destination in the transition matrix — no orphan enum values.
- The migration's `up` and `down` must both be implemented; a placeholder `down` that throws is not acceptable.
- Handle the edge case of a Deal whose current `stage` (after migration) is `closed_won`: PATCH or POST-transition requests against it must return 422 with a clear error, not crash or succeed silently.
- New tests must cover: (a) at least one successful transition per allowed edge in the matrix; (b) at least one rejected transition per forbidden edge (there are more forbidden edges than allowed — test a representative subset covering each stage); (c) each precondition failure path; (d) the migration on a fixture that includes exact matches, synonyms, and unknown values.

## 7. Delivery / Meta

### Output format

When done, list every file you created or modified with its full path relative to the repository root. Do not include commit messages, changelogs, or design-rationale prose — the evaluation harness reads code changes, not narration.

### Testing expectation

Extend the existing Vitest test files (`deal.service.spec.ts`, `deal.controller.spec.ts`) and add a new test file for the migration (`src/migrations/*.spec.ts`). Existing test cases must not be removed. Cover: (a) happy-path transitions across the matrix; (b) rejected transitions and precondition failures; (c) migration behaviour on a mixed fixture (canonical values, synonyms, unknown values, empty strings). Use `test/utils/` builders. Run the migration against an in-memory database in the test setup, not against the developer's local database.
