<!--
Task: T3
Variant: structured
Prompt schema: V2
Rule IDs targeted: BE-CONTRACT-C-001, BE-CONTRACT-C-002, BE-CONTRACT-C-003, BE-CONTRACT-C-004, BE-DEP-C-001, BE-DEP-C-002, BE-DEP-C-003, BE-DEP-C-004, BE-DOM-C-001, BE-DOM-C-002, BE-DUP-C-001, BE-DUP-C-002, BE-DUP-C-003, BE-ERR-C-001, BE-ERR-C-002, BE-ERR-C-003, BE-ROUTE-C-001, BE-SIZE-C-001, BE-STRUCT-C-001, BE-TEST-C-001, CROSS-EP-C-001, CROSS-PROP-C-001, CROSS-TYPE-C-001, FE-COM-C-001, FE-COM-C-002, FE-COMM-C-001, FE-DATA-C-001, FE-DATA-C-002, FE-DUP-C-001, FE-DUP-C-002, FE-ROUTE-C-001, FE-ROUTE-C-002, FE-STATE-C-001, FE-STATE-C-002, FE-STYLE-C-001, FE-STYLE-C-002
-->

## 1. Agent Role

You are a senior full-stack engineer working on a production-grade multi-tenant CRM built with NestJS using TypeScript (backend), React with MUI using JavaScript (frontend), and TypeORM with PostgreSQL.

## 2. Codebase Orientation

The backend CRM modules are under `backend/src/modules/`. Inspect the existing
Deal-related code, including its current API, persistence, validation, and
business behaviour, before making changes.

The frontend feature code is under `frontend/src/`. Inspect the current Deal
create, edit, list, and detail surfaces before extending the application.

Build on the existing implementation and preserve existing externally observable behaviour unless this task explicitly requires a change.

## 3. Problem Statement

###### Feature Request: Constrain Deal stages with a pipeline state machine

### Background

The Deal pipeline is the foundation of CRM forecasting and sales reporting. A
Deal progresses through a defined sales process: an early lead is qualified,
becomes active, enters negotiation, and eventually closes as won or lost.

The controlled pipeline stages are: lead → qualified → active → negotiation → closed_won

At any non-terminal stage, a Deal may instead close as `closed_lost`. A
`closed_lost` Deal may later be reopened to `lead`, while a `closed_won` Deal is
terminal.

### Current Problem

The CRM currently stores a Deal's `stage` as a free-form string. Salespeople
can enter typographical errors such as `quailified`, synonymous values such as
`won` rather than `closed_won`, and legacy values such as `proposal_sent`.
They can also move a Deal arbitrarily between stages, including skipping from
`lead` directly to `closed_won` or silently moving a closed Deal backwards.

As a result, pipeline reports cannot reliably group Deals by stage or represent
their actual progression. Existing Deal records may also contain blank, legacy,
or otherwise invalid stage values that would cause failures if the application
were changed to accept only a controlled vocabulary.

### Desired Outcome

Deal stages become a controlled vocabulary with validated transitions between
them. Users can create a Deal only in `lead` or `qualified`, and subsequent
stage changes follow the permitted pipeline transitions. A Deal may transition
to `active` only when it has at least one linked Contact, and may transition to
`negotiation` only when it has an expected close date.

The backend rejects invalid stage values, invalid transitions, and unmet
transition preconditions with clear API errors. Deal create and edit surfaces
present controlled stage choices rather than free-text input, and show only
valid next-stage choices for an existing Deal.

Existing Deal records are migrated to canonical stage values so the application
continues to load and report on historical data. The current workspace may
contain Deals with zero or more linked Contacts; Deal–Company remains unchanged,
and every Deal continues to belong to exactly one Company.

## 4. Requirements

### Stage vocabulary and initial state

1. A Deal stage SHALL be one of: `lead`, `qualified`, `active`,
   `negotiation`, `closed_won`, or `closed_lost`.

2. A newly created Deal MAY specify only `lead` or `qualified` as its initial
   stage. When omitted, its initial stage SHALL default to `lead`.

3. A create request specifying `active`, `negotiation`, `closed_won`, or
   `closed_lost` as its initial stage SHALL be rejected.

4. Deal API responses SHALL return only canonical stage values.

### Transition matrix

5. From `lead`, a Deal may transition to `qualified` or `closed_lost`.

6. From `qualified`, a Deal may transition to `active` or `closed_lost`.

7. From `active`, a Deal may transition to `negotiation` or `closed_lost`.

8. From `negotiation`, a Deal may transition to `closed_won` or `closed_lost`.

9. `closed_won` is terminal and has no allowed target stage.

10. From `closed_lost`, a Deal may transition only to `lead`.

11. A request whose target stage equals the Deal's current stage SHALL succeed
    without changing the stored stage.

12. Any other stage change SHALL be rejected.

### Transition preconditions

13. Transitioning to `active` requires the Deal to have at least one linked
    Contact.

14. Transitioning to `negotiation` requires the Deal to have a non-null
    `expectedCloseDate`. The date may already be stored on the Deal or be
    supplied in the same generic Deal update request.

15. Transitioning to `closed_won` has no additional preconditions.

16. Transitioning to `closed_lost` has no additional preconditions.

### Existing Deal update behaviour

17. The existing Deal update endpoint SHALL apply the same transition matrix
    and preconditions whenever its request changes `stage`.

18. A Deal update request that does not include `stage` SHALL not modify or
    revalidate the Deal's current stage.

19. A successful stage change through either the existing Deal update endpoint
    or the dedicated stage-transition endpoint SHALL produce the same stored
    stage and the same observable validation behaviour.

### Migration of existing data

20. Existing stage values matching a canonical stage case-insensitively SHALL
    be migrated to that canonical value.

21. Existing `won`, `lost`, `prospect`, and `proposal_sent` values SHALL be
    migrated to `closed_won`, `closed_lost`, `lead`, and `negotiation`,
    respectively.

22. Any other existing stage value, including a blank or null value, SHALL be
    migrated to `lead`.

23. After migration, every stored Deal SHALL have a canonical stage value.

24. The migration SHALL be safe to apply once to an existing database and SHALL
    not create invalid Deal stage values.

### Error semantics

25. An unrecognised requested stage value SHALL return `400` with code
    `UNKNOWN_STAGE`.

26. A create request specifying a disallowed initial stage SHALL return `400`
    with code `INVALID_INITIAL_STAGE`.

27. A stage change that is not allowed by the transition matrix SHALL return
    `422` with code `INVALID_STAGE_TRANSITION`.

28. A stage change whose target preconditions are unmet SHALL return `422` with
    code `TRANSITION_PRECONDITION_UNMET`.

29. A stage update for an unknown Deal id SHALL return `404` with code
    `NOT_FOUND`.

### UI acceptance

30. Deal create and edit surfaces SHALL present stage values as a controlled
    selection rather than a free-text input.

31. The Deal create surface SHALL offer only `lead` and `qualified` as initial
    stage choices, with `lead` selected by default.

32. The Deal edit surface SHALL show only stages allowed from the Deal's current
    stage as selectable transition targets.

33. The Deal edit surface SHALL require an expected close date when the user
    selects `negotiation`.

34. A Deal with no linked Contacts SHALL not offer `active` as a selectable
    transition target.

35. A Deal in `closed_won` SHALL have no selectable stage-transition action.

36. A Deal in `closed_lost` SHALL offer `lead` as its only selectable
    transition target.

37. A stage-transition error returned by the API SHALL be shown inline and
    SHALL leave the displayed Deal stage unchanged.

### Data setup

38. After the `demo` seed runs, at least one Deal SHALL exist in each canonical
    stage.

39. After the `edge-case` seed runs, at least one Deal SHALL have no linked
    Contacts. Attempting to transition that Deal to `active` SHALL fail with
    `TRANSITION_PRECONDITION_UNMET`.

## 5. API Contract

All routes below include the global `/api` prefix.

This section defines externally observable HTTP behaviour only. It does not
prescribe the internal architecture, file structure, class names, DTO names, or
implementation patterns.

### Shared Error Contract

All error responses use the existing project error-response envelope.

| HTTP status | Code                            | Condition                                              |
| ----------- | ------------------------------- | ------------------------------------------------------ |
| `400`       | `UNKNOWN_STAGE`                 | A requested stage is outside the controlled vocabulary |
| `400`       | `INVALID_INITIAL_STAGE`         | Deal creation specifies a disallowed initial stage     |
| `422`       | `INVALID_STAGE_TRANSITION`      | The target stage is not allowed from the current stage |
| `422`       | `TRANSITION_PRECONDITION_UNMET` | A target-stage precondition is not satisfied           |
| `404`       | `NOT_FOUND`                     | The requested Deal does not exist                      |

### Create Deal — Modified

**Route:** `POST /api/deals`
**Content-Type:** `application/json`

The existing Create Deal contract remains in effect. Its optional `stage` field
may contain only `lead` or `qualified`; when omitted, it defaults to `lead`.

```
{
  "name": "Acme Q3 renewal",
  "value": 50000,
  "companyId": "<company-uuid>",
  "stage": "qualified"
}
```

**Success:** `201 Created`

The response is the created Deal with a canonical `stage`.

### Update Deal — Modified

**Route:** `POST /api/deals/:id`
**Content-Type:** `application/json`

The existing partial-update contract remains in effect. If the request includes
`stage`, the requested change follows the transition matrix and preconditions.

A transition to `negotiation` may provide the required date in the same request:

```
{
  "stage": "negotiation",
  "expectedCloseDate": "2026-10-31"
}
```

**Success:** `200 OK`

The response is the updated Deal with a canonical `stage`.

### Transition Deal Stage — New

**Route:** `POST /api/deals/:id/stage`
**Content-Type:** `application/json`

```
{
  "stage": "qualified"
}
```

`stage` must be one of:

```
lead, qualified, active, negotiation, closed_won, closed_lost
```

**Success:** `200 OK`

The response is the updated Deal with its canonical `stage`.

## 6. Architecture Rules

Apply these rules to all production code added or modified for this task. Do
not disable, suppress, or bypass the corresponding checks. Explicit task
requirements take precedence where a conflict exists.

### Backend

- **BE-STRUCT-C-001:** Each business module uses separate module, controller,
  service, and repository files, and registers the controller, service, and
  repository in the module's `@Module` metadata.
- **BE-DEP-C-001:** Dependencies follow Controller → Service → Repository →
  Entity.
- **BE-DEP-C-002:** `src/common/` and `src/core/` must not import business
  implementations from `src/modules/`.
- **BE-DEP-C-003:** Guards, interceptors, and filters must not import
  module-specific entities or repositories.
- **BE-DEP-C-004:** Do not introduce circular imports.
- **BE-DOM-C-001:** Cross-module imports use only the target module's
  `.module.ts` or `index.ts` entry point.
- **BE-DOM-C-002:** Module entry points must not export repositories or
  entities.
- **BE-ERR-C-001:** Services must not throw NestJS `HttpException` classes.
- **BE-ERR-C-002:** Service failures use the project's `AppException`.
- **BE-ERR-C-003:** Catch blocks must handle, wrap, or rethrow errors; no
  silent or log-only catches.
- **BE-CONTRACT-C-001:** Persistent entity or relationship changes require a
  corresponding executable migration.
- **BE-CONTRACT-C-002:** Fields on DTOs bound via `@Body`, `@Query`, `@Param`,
  or `@Headers` declare `class-validator` decorators.
- **BE-CONTRACT-C-003:** Optional request properties must validate supplied
  values; `@IsOptional()` alone is insufficient.
- **BE-CONTRACT-C-004:** Preserve input whitelisting and rejection of unknown
  request fields.
- **BE-TEST-C-001:** Services obtain repositories through dependency
  injection; do not call `new Repository(...)`.
- **BE-ROUTE-C-001:** Resolved public routes use the global `/api` prefix and
  kebab-case resource paths.
- **BE-SIZE-C-001:** Production methods have at most three direct parameters;
  group cohesive inputs in a DTO or parameter object.
- **BE-DUP-C-001:** Each business resource has one backend owner; do not create
  competing modules, controllers, routes, or entity-table owners.
- **BE-DUP-C-002:** Each business policy or invariant has one authoritative
  implementation; all entry points delegate to it.
- **BE-DUP-C-003:** Do not copy equivalent production functions; reuse or
  extract an existing shared implementation.

### Frontend

- **FE-COM-C-001:** React component files contain at most 300 non-blank,
  non-comment lines.
- **FE-COM-C-002:** Each React component has at most three nested render
  decisions and produces at most one depth finding. Pure structural JSX
  nesting, layout wrappers, fragments, list iteration, text fallbacks, and
  non-JSX prop conditions do not count toward the depth.
- **FE-STATE-C-001:** Components inside explicitly configured stateless or
  presentational boundaries must not introduce `useState` or `useReducer`;
  interactive components outside those boundaries may keep local UI state.
- **FE-STATE-C-002:** Context providers appear only at the application root,
  route layouts, `src/providers/`, or `src/contexts/`.
- **FE-ROUTE-C-001:** Route definitions live under `src/routes/`.
- **FE-ROUTE-C-002:** Every route resolves to a page component.
- **FE-STYLE-C-001:** Do not use raw JSX `style`; use MUI or the established
  shared styling abstraction.
- **FE-STYLE-C-002:** Global styles live only under `src/styles/global/`.
- **FE-DATA-C-001:** Direct `fetch` or `axios` calls appear only in approved
  API service or data-hook modules.
- **FE-DATA-C-002:** Every `useEffect` declares all referenced reactive values
  in its dependency array.
- **FE-COMM-C-001:** Do not introduce a global event bus; use props, controlled
  context, or the established state mechanism.
- **FE-DUP-C-001:** Each resource has one frontend feature, route, page, and
  form owner; do not create competing feature directories or UI surfaces.
- **FE-DUP-C-002:** Frontend logic has one authoritative implementation.
  Repeated API, form, validation, transformation, state, component, or
  function logic belongs in a shared service, hook, component, or utility.

### Cross-Stack

- **CROSS-EP-C-001:** Every frontend API URL resolves to an implemented
  backend route.
- **CROSS-TYPE-C-001:** Frontend request route params, query fields, and body
  fields match the backend controller/DTO contract (arity, field existence,
  required fields, and statically resolvable enum/type values).
- **CROSS-PROP-C-001:** Propagate API-facing backend (controller/DTO) or
  frontend adapter changes to the resource's existing counterpart surfaces:
  frontend adapter, frontend UI, backend contract, and tests.


## 7. Delivery and Verification Protocol

- Work directly in the provided workspace. Implement the task by modifying the relevant project files; do not merely describe a proposed solution.

- Add or update focused functional tests for the behaviour introduced or changed
  by this task. Keep those tests in the project's existing test locations and
  run the relevant test suite before concluding.

- Before concluding, run the relevant functional tests and fix any failures, compilation errors, or regressions caused by your changes.

- Do not create Git commits or Git tags. The experiment pipeline manages Git history after this task completes.

- When the implementation is complete and the relevant functional tests pass, respond with exactly `[TASK_COMPLETED]` and nothing else.
