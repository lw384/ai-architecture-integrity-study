<!--
Task: T2 (Pipeline State Machine — L2 Cross-Component Consistency)
Variant: minimal
Blocks enabled: 1, 2, 3, 4, 5, 7 (output format + weak testing expectation)
Blocks omitted: 6 (Rules R1–R7), 7.c (Sequence Continuity — T4 only)
Derived from: prompt_meta_template_v3.md
Source documents: PRD_v1.docx §Deal §Pipeline; CRM_Scope_v2_Task_Design.docx §4.2; Rule_Registry_v0.1.md
Content hash (SHA-256 of Blocks 3+4+5): [pending — MUST equal T2_structured.md hash]
Frozen at: [pending — set at freeze commit]
-->

## 1. Agent Role

You are a full-stack engineer working on a CRM app using NestJS, React, and TypeScript.

## 2. Codebase Orientation

Modify `src/modules/deal/`. See `src/modules/customer/customer.entity.ts` for how an enum column is modelled. Business exceptions live in `src/common/exceptions/`. Migrations live in `src/migrations/`. Test utilities in `test/utils/`. Existing tests in `deal.*.spec.ts` must continue to pass.

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

## 7. Delivery / Meta

### Output format

When done, list every file you changed with its full path relative to the repo root. No commit messages, no explanations.

### Testing expectation

Add tests where appropriate.
