# Prompt Design Meta-Template V1

**Purpose**: Define the structural framework from which all task-specific prompts are derived, so that the experimental independent variable `prompt_strategy ∈ {structured, minimal}` has a well-defined operational form.

**Status**: V1 draft. Freeze target: before Phase A pilot runs begin.

**Scope**: Covers 5 task classes (Experiment1–Experiment5) × 2 prompt variants (structured, minimal) = ~18–20 concrete prompt files derived from this meta-template.

---

## 0. Design Rationale

The experiment's independent variable `prompt_strategy` must be operationalised as more than "long prompt vs short prompt". Following Wohlin et al. (2012) §5.2 on treatment definition, all instances of a treatment must share the same operational form. This meta-template makes the operational form explicit: the two variants differ by which of 14 named components are enabled, not by unstructured stylistic variation.

Every component in this template maps to one or more rules in Rule Registry V0.1 whose D3 classification is "prompt-fixable" or "mixed". This mapping enables post-hoc analysis of the form: "rule X was violated under minimal but not under structured; therefore component Cn of the structured prompt is likely responsible for the improvement". Without this mapping, the recommendation section of the dissertation cannot make component-level claims.

The three design principles:

1. **Compositional, not narrative**. The prompt is assembled from named components, not written as free prose. This enables automated verification that each prompt file contains exactly the components it should.
2. **Rule-traceable**. Each component in the structured variant traces to a specific set of rules in the registry. Comment blocks in each prompt file explicitly list the rule IDs each component addresses.
3. **Task-independent structure, task-specific content**. The 14 components are the same across all 5 tasks. Only the content that fills specific slots (C3 task requirement, C13 codebase orientation, and C14 sequence reminder for L4) varies by task.

---

## 1. The 14 Components

Each component has an ID (C1–C14), a purpose, an operational definition (what to write), a length constraint (to prevent uncontrolled variation), and a rule-coverage annotation.

### C1 — Role Framing

**Purpose**: Establish the agent's role and the codebase context type.
**Structured length**: 40–80 words.
**Minimal length**: 20–40 words.
**Rules covered**: none directly (framing only).
**Content template**:

> Structured: "You are a senior backend/full-stack engineer working on the CRM codebase, a production-grade multi-tenant CRM system built with NestJS (backend), React with MUI (frontend), TypeScript throughout, and TypeORM with PostgreSQL. The codebase follows strict layered architecture: controllers depend on services, services depend on repositories, and lower layers never import from higher layers."
>
> Minimal: "You are a full-stack engineer working on a CRM application using NestJS, React, and TypeScript."

### C2 — Product Context (Mini-PRD Excerpt)

**Purpose**: Provide domain understanding sufficient for the agent to make sensible business decisions.
**Structured length**: 200–400 words.
**Minimal length**: 60–120 words.
**Rules covered**: L-5 business invariants (BIZ-1, BIZ-2, BIZ-3, BIZ-4, BIZ-5) when the task touches domain rules.
**Structured content**: Copied from `prd_v1.md` — the sections relevant to the current task's entities (Customer / Deal / Contact / Interaction / User).
**Minimal content**: A 2–3 sentence entity summary. E.g.: "A Deal represents a sales opportunity linked to a Customer. Deals progress through pipeline stages. Customers may be active or inactive."

### C3 — Task Requirement

**Purpose**: State what the agent must do.
**Structured length**: 100–300 words.
**Minimal length**: 40–120 words.
**Rules covered**: none directly (task definition only).
**Content**: Copied from `CRM_Scope_v2_Task_Design.docx` section corresponding to the task (§4.1 for L1, §4.2 for L2, etc.). Both variants share the same core task statement; the structured variant may append clarifying acceptance criteria.

**Filling rule**: The core sentence stating "what to build" must be identical between structured and minimal. Structured may add elaboration; it must not change the goal.

### C4 — Architectural Constraints (Layered Architecture)

**Purpose**: State the layer-dependency constraints the agent must respect.
**Structured length**: 100–200 words.
**Minimal**: DISABLED.
**Rules covered**: ARCH-1, ARCH-2, ARCH-3, ARCH-4, ARCH-5.
**Content template**:

> "The codebase enforces a strict layered architecture:
>
> - Controllers ONLY orchestrate: they may receive HTTP requests, invoke a single service method, map the result to a response, and translate exceptions to HTTP status codes. Controllers MUST NOT contain business logic, database queries, or direct repository access.
> - Services contain all business logic. They may inject and use repositories, other services, and framework utilities.
> - Repositories are the only layer permitted to access the database via TypeORM.
> - No cross-layer upward imports: services must not import controllers; repositories must not import services or controllers.
> - No circular dependencies between modules.
> - The frontend must consume the backend only through the typed API client at `src/services/api/`. Components MUST NOT call `fetch()` or `axios` directly against backend URLs."

### C5 — HTTP and REST Conventions

**Purpose**: State the RFC 9110 and REST conventions the agent must respect.
**Structured length**: 120–250 words.
**Minimal**: DISABLED.
**Rules covered**: WEB-1, WEB-2, WEB-3, WEB-4, WEB-5, WEB-6.
**Content template**:

> "HTTP method semantics (per RFC 9110):
>
> - GET is safe and idempotent. GET handlers MUST NOT modify server state; they MUST NOT call repository methods that create, update, or delete data.
> - POST is used for resource creation and for non-idempotent operations.
> - PUT replaces a resource in full; it is idempotent.
> - PATCH modifies a resource partially.
> - DELETE removes a resource; it is idempotent (a second DELETE returns 204 or 200, not an error).
>
> URL structure:
>
> - Resources use plural nouns: `/customers`, `/deals`, `/contacts` — never verbs.
> - Nesting depth ≤ 2 levels: `/customers/:id/deals` is allowed; `/customers/:id/deals/:dealId/contacts` is not — expose top-level `/deals/:dealId/contacts` instead.
>
> Status codes:
>
> - 4xx for client errors and business-rule violations.
> - 5xx only for uncaught infrastructure errors.
> - 400 for malformed input, 404 for missing resource, 409 for state conflict, 422 for semantic validation failure."

### C6 — Error Handling Convention

**Purpose**: Enforce consistent error-response construction.
**Structured length**: 100–180 words.
**Minimal**: DISABLED.
**Rules covered**: STY-5, WEB-7, WEB-8.
**Content template**:

> "Error handling:
>
> - Throw exceptions from services; do not return error objects.
> - Use the business exception classes in `src/common/exceptions/` (e.g., `EntityNotFoundException`, `InvalidStateTransitionException`, `BusinessRuleViolationException`) rather than raw `HttpException`.
> - The global `HttpExceptionFilter` at `src/common/filters/http-exception.filter.ts` maps each business exception to a specific HTTP status code. Do not throw `HttpException` directly from controllers or services — this bypasses centralised mapping and produces inconsistent responses.
> - All error responses follow the envelope shape: `{ error: { code: string, message: string, details?: object } }`. This shape is enforced by the exception filter; do not construct error responses manually."

### C7 — DTO Validation Contract

**Purpose**: Enforce input validation at the HTTP boundary.
**Structured length**: 80–150 words.
**Minimal**: DISABLED.
**Rules covered**: WEB-9, WEB-10, SEC-3.
**Content template**:

> "Input validation:
>
> - Every POST, PUT, and PATCH endpoint MUST accept a DTO class decorated with `class-validator` decorators. Raw `req.body` access is forbidden.
> - The DTO class lives in the same feature module as the controller, in a `dto/` subdirectory.
> - Global `ValidationPipe` with `{ whitelist: true, forbidNonWhitelisted: true }` is active — undeclared fields will be rejected.
> - The corresponding TypeScript type on the frontend API client MUST match the backend DTO field-for-field. Manually redefined types on the frontend that drift from the backend DTO are a defect."

### C8 — Naming and Style Rules

**Purpose**: Prevent stylistic oscillation within a task's output.
**Structured length**: 60–120 words.
**Minimal**: DISABLED.
**Rules covered**: STY-3, LLM-7.
**Content template**:

> "Style conventions:
>
> - TypeScript strict mode is enabled globally; do NOT use `any`. If a type genuinely cannot be inferred, use `unknown` and narrow with a type guard.
> - camelCase for variables, functions, and class properties; PascalCase for classes, interfaces, and types; SCREAMING_SNAKE for constants.
> - Prefer `interface` over `type` for object shapes with methods; use `type` for unions and utility types.
> - Consistent import ordering: framework/library imports first, then internal-module imports, then relative imports. Within each group, sort alphabetically."

### C9 — Anti-Shortcut Warning

**Purpose**: Reduce shortcut-taking under complexity temptation.
**Structured length**: 50–100 words.
**Minimal**: DISABLED.
**Rules covered**: ARCH-1, BIZ-4, LLM-6.
**Content template**:

> "If a task appears to require aggregating data from multiple entities, DO NOT bypass the repository layer by writing a cross-table SQL query, EntityManager query, or raw QueryBuilder chain in the service. Even if this is functionally equivalent and faster to write, it violates the architectural contract. Instead: inject each entity's repository, fetch what you need, and aggregate in memory in the service. If the performance is unacceptable, that is a separate refactor that must go through architectural review — not a licence to shortcut."

### C10 — Completeness Requirement

**Purpose**: Prevent stub-and-claim and happy-path-only patterns.
**Structured length**: 80–140 words.
**Minimal**: DISABLED.
**Rules covered**: LLM-1, LLM-2.
**Content template**:

> "Completeness requirements before declaring the task done:
>
> - No method may have an empty body or `throw new Error('Not implemented')`. Every declared method must have a real implementation.
> - Handle all input variants explicitly: null / undefined / empty arrays / boundary values. Do not assume inputs are well-formed even after DTO validation, because service methods may be called from other services with programmatically constructed inputs.
> - Every code path must handle error responses from dependencies (repository calls, external services). Silent try-catch that swallows errors is forbidden.
> - Include at least one unit test per new service method covering: the happy path, one boundary case, and one error case."

### C11 — Testing Expectation

**Purpose**: State the testing requirement.
**Structured length**: 60–120 words.
**Minimal length**: 20–40 words.
**Rules covered**: indirectly LLM-2.
**Structured**: "Write Vitest tests co-located with the modified files. Cover: (a) the happy path with realistic data; (b) at least one edge case (empty input, null field, boundary value); (c) at least one error case (invalid input, downstream failure). Use existing test utilities in `test/utils/`. Do NOT modify existing tests unless the requirement explicitly requires it."
**Minimal**: "Add tests where appropriate."

### C12 — Output Format Specification

**Purpose**: Constrain the shape of the agent's output for consistent parsing.
**Structured length**: 40–80 words.
**Minimal length**: 20–40 words.
**Rules covered**: none directly (procedural).
**Content template**:

> Structured: "When done, list every file you created or modified with its full path relative to the repository root. Do not add commit messages, changelogs, or explanatory prose about your design decisions — the harness reads code changes, not narrative."
>
> Minimal: "List the files you changed when done."

### C13 — Codebase Orientation Pointer

**Purpose**: Reduce the agent's context-window burn on directory navigation.
**Structured length**: 60–150 words.
**Minimal length**: 40–100 words.
**Rules covered**: none directly (efficiency only).
**Content**: Task-specific. Point to (a) the module or feature folder to modify or extend; (b) 1–2 reference files that exemplify the expected pattern; (c) the location of shared utilities that will likely be needed.

**Filling rule**: Both variants must point to the same locations. The difference is that structured elaborates why each pointer is relevant; minimal only lists them.

### C14 — Sequence-Continuity Reminder (L4 only)

**Purpose**: Force convention preservation across L4's multi-step sequence.
**Structured length**: 80–150 words.
**Minimal**: DISABLED.
**Rules covered**: LLM-4, LLM-5, LLM-8.
**Applies to**: L4 steps 2, 3, 4 (not step 1).
**Content template**:

> "This is step N of a multi-step task. Steps 1 through N-1 established conventions in the codebase that you MUST preserve unless the current step explicitly requires changing them:
>
> - The naming pattern used in earlier steps.
> - The error response envelope shape used in earlier steps.
> - The layer boundaries followed in earlier steps.
> - Any DTO base types or shared exception classes introduced in earlier steps.
>   If completing this step would require revising an earlier decision, DO NOT silently work around it. Explicitly identify what earlier decision is now suboptimal and propose the refactor before implementing this step."

---

## 2. Component Selection by Variant

| Component                        | Structured            | Minimal              |
| -------------------------------- | --------------------- | -------------------- |
| C1 Role framing                  | ✅ full                | ✅ short              |
| C2 Product context               | ✅ full (200–400 w)    | ✅ short (60–120 w)   |
| C3 Task requirement              | ✅ full                | ✅ core sentence only |
| C4 Architectural constraints     | ✅                     | ❌                    |
| C5 HTTP / REST conventions       | ✅                     | ❌                    |
| C6 Error handling convention     | ✅                     | ❌                    |
| C7 DTO validation contract       | ✅                     | ❌                    |
| C8 Naming and style rules        | ✅                     | ❌                    |
| C9 Anti-shortcut warning         | ✅                     | ❌                    |
| C10 Completeness requirement     | ✅                     | ❌                    |
| C11 Testing expectation          | ✅ full                | ✅ weak               |
| C12 Output format                | ✅                     | ✅                    |
| C13 Codebase orientation         | ✅ full                | ✅ short              |
| C14 Sequence-continuity reminder | ✅ (L4 only, steps 2+) | ❌                    |

**Structured total length**: approximately 1200–2400 words per prompt.
**Minimal total length**: approximately 200–500 words per prompt.

The 4–8× length difference is the surface manifestation, but the substantive difference is the 8 components (C4, C5, C6, C7, C8, C9, C10, C14) that are entirely absent from minimal — each of which targets a specific set of rules whose D3 classification includes "prompt-fixable".

---

## 3. Rule-Component Mapping (for Post-Hoc Analysis)

The following table lets you answer: "if rule X was violated more under minimal than under structured, which component's absence is likely responsible?"

| Rule ID                                               | Component providing explicit constraint in structured                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| ARCH-1 (no layer skipping)                            | C4, C9                                                                         |
| ARCH-2 (no upward dependencies)                       | C4                                                                             |
| ARCH-3 (no circular dependencies)                     | C4 (implicit)                                                                  |
| ARCH-4 (business logic in service)                    | C4                                                                             |
| ARCH-5 (FE via typed client)                          | C4                                                                             |
| WEB-1 (GET doesn't write)                             | C5                                                                             |
| WEB-2 (state changes via POST/PUT/PATCH/DELETE)       | C5                                                                             |
| WEB-3 (idempotency)                                   | C5                                                                             |
| WEB-4 (plural noun URLs)                              | C5                                                                             |
| WEB-5 (nesting depth ≤ 2)                             | C5                                                                             |
| WEB-6 (4xx vs 5xx)                                    | C5, C6                                                                         |
| WEB-7 (consistent status per error type)              | C6                                                                             |
| WEB-8 (consistent error envelope)                     | C6                                                                             |
| WEB-9 (DTO validation)                                | C7                                                                             |
| WEB-10 (FE-BE type sync)                              | C7                                                                             |
| QLY-1 to QLY-6                                        | none (tool-required rules; prompt cannot state numeric thresholds effectively) |
| STY-1 (DI)                                            | C4 (implicit)                                                                  |
| STY-2 (Rules of Hooks)                                | none (tool-required)                                                           |
| STY-3 (no unjustified any)                            | C8                                                                             |
| STY-4 (nullable consistency)                          | C7                                                                             |
| STY-5 (consistent error pattern)                      | C6                                                                             |
| BIZ-1 to BIZ-5                                        | C2 (mini-PRD covers domain rules)                                              |
| SEC-1 to SEC-3                                        | none (tool-required)                                                           |
| SEC-4 (sensitive ops not via GET)                     | C5                                                                             |
| LLM-1 (no stub-and-claim)                             | C10                                                                            |
| LLM-2 (no happy-path-only)                            | C10, C11                                                                       |
| LLM-3 (no hallucinated deps)                          | none (tool-required; TS compiler catches it)                                   |
| LLM-4 (convention preservation)                       | C14                                                                            |
| LLM-5 (no global drift on local fix)                  | C14                                                                            |
| LLM-6 (respect constraints under shortcut temptation) | C9                                                                             |
| LLM-7 (no oscillation in one file)                    | C8                                                                             |
| LLM-8 (revisit early decisions)                       | C14                                                                            |

**Key observation**: 6 rules (QLY-1 to QLY-6, STY-2, SEC-1, SEC-2, SEC-3, LLM-3) are covered by NO component. These are the rules classified in Rule Registry V0.1 as "tool-required" — their D3 classification predicts that prompt strategy will NOT improve them. If experimental data confirms that these rules show equivalent violation counts under structured and minimal, this validates the D3 classification. If they show a difference, this challenges D3 and becomes a Discussion finding.

---

## 4. Task-Specific Filling Rules

For each of the 5 task classes, the following table specifies what to put in the task-specific slots (C2, C3, C13, and C14 for L4).

| Task                                                    | C2 source                                                        | C3 source                                                          | C13 source                                                                                                                           | C14 enabled         |
| ------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| **T1 (new feature extension)**                          | Mini-PRD sections for entities the new feature touches           | CRM_Scope_v2 §4.1                                                  | Points to `packages/twenty-server/src/modules/<related-feature>/` as pattern reference; points to `src/common/` for shared utilities | No                  |
| **T2 (existing code modification)**                     | Mini-PRD sections for entities the modified code touches         | §4.2                                                               | Lists specific files to modify (from task doc); points to related tests in `test/`                                                   | No                  |
| **T3 (cross-module collaboration; e.g., health score)** | Mini-PRD sections for Customer, Deal, Contact, Interaction (all) | §4.3                                                               | Points to each involved repository and the service module where aggregation should live                                              | No                  |
| **T4 (multi-step evolution)**                           | Mini-PRD sections for the feature under development              | §4.4 (subsection per step)                                         | Step 1: points to baseline structure; steps 2+: point to previous step's output                                                      | Yes (steps 2, 3, 4) |
| **T5a (ambiguous requirement)**                         | Mini-PRD for relevant entities                                   | §4.5a (deliberately ambiguous — do NOT clarify)                    | Standard pointers                                                                                                                    | No                  |
| **T5b (conflicting requirements)**                      | Mini-PRD for relevant entities                                   | §4.5b (contains internal contradiction — do NOT resolve in prompt) | Standard pointers                                                                                                                    | No                  |

**Ambiguity preservation rule for L5**: In L5 tasks, the ambiguity or conflict IS the treatment. The prompt must NOT resolve it. If the structured variant appears to resolve ambiguity, that is a design defect in the prompt. Both variants of L5 tasks must present the same ambiguous or conflicting requirement text verbatim.

---

## 5. File Inventory and Naming Convention

The full set of prompt files derived from this meta-template:

```
prompts/
├── prompt_meta_template_v1.md    # this document
├── T1_structured.md
├── T1_minimal.md
├── T2_structured.md
├── T2_minimal.md
├── T3_structured.md
├── T3_minimal.md
├── T4-step1_structured.md
├── T4-step1_minimal.md
├── T4-step2_structured.md
├── T4-step2_minimal.md
├── T4-step3_structured.md
├── T4-step3_minimal.md
├── T4-step4_structured.md
├── T4-step4_minimal.md
├── T5a_structured.md
├── T5a_minimal.md
├── T5b_structured.md
└── T5b_minimal.md
```

**Total**: 18 prompt files + 1 meta-template = 19 files.

**Filename anatomy**: `<task_id>_<variant>.md`. Task ID matches the identifiers in CRM_Scope_v2_Task_Design.docx.

**File header convention**: Every prompt file begins with a comment block listing (a) the task ID, (b) the variant, (c) the enabled components, (d) the rule IDs targeted, (e) the meta-template version it derives from. Example:

```markdown
<!--
Task: T2 (existing code modification)
Variant: structured
Enabled components: C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11, C12, C13
Rules targeted (D3=prompt-fixable subset): ARCH-1, ARCH-4, WEB-1, WEB-2,
  WEB-6, WEB-7, WEB-8, WEB-9, STY-3, LLM-1, LLM-2, LLM-6
Derived from: prompt_meta_template_v1.md
Frozen at: [pending — will be set at freeze commit]
-->
```

This header enables automated verification (a Python script can parse it and assert against the meta-template).

---

## 6. Freeze Checklist

Before the `prompts-frozen-v1` git tag is applied, verify:

- [ ] All 18 prompt files exist and parse.
- [ ] Every file's header lists exactly the components appropriate for its variant.
- [ ] Length constraints per component are respected (word count within specified ranges).
- [ ] The core sentence in C3 is identical between structured and minimal for the same task.
- [ ] L5 ambiguity/conflict text is verbatim identical between structured and minimal.
- [ ] L4 step k+1 references the output of step k in C13 (not the baseline).
- [ ] L4 steps 2, 3, 4 include C14; step 1 does not.
- [ ] No prompt contains a specific numeric threshold from the rule registry (e.g., "keep functions under 50 lines" is forbidden; the tool detects that).
- [ ] No prompt contains implementation details that would be considered "leaking the solution" (this borders on measuring the agent's ability to follow instructions rather than to solve problems).
- [ ] Supervisor has reviewed at least the meta-template and 2 sample prompts.

After the checklist is green, commit and tag:

```bash
git add prompts/
git commit -m "Freeze prompt set V1 for Phase A pilot"
git tag prompts-frozen-v1
```

From this point, any modification requires a new tag (`prompts-frozen-v2`), all affected runs must be re-executed, and the dissertation methodology chapter must explicitly document the change and its rationale.

---

## 7. What This Meta-Template Does Not Cover

For methodological transparency, the following are explicitly outside this meta-template's scope:

- **System prompts vs user prompts**: Depending on the LLM interface (Claude Code, API, GPT web), the framework of "system" vs "user" prompt differs. This meta-template treats the entire prompt as the "task specification handed to the agent". The system-level framing (e.g., "you are a helpful coding assistant") is set once per agent tool and is not a treatment variable.
- **Multi-turn interaction protocol**: How the researcher responds to agent questions during a run is governed by the separate `human_intervention_protocol.md`, not this template.
- **Retrieval-augmented context**: If the agent tool auto-injects file contents into context, that behavior is a tool property, not a prompt property. The meta-template controls what the researcher explicitly writes; it does not control what the tool retrieves.
- **Temperature and other sampling parameters**: These are experimental controls set outside the prompt, in the agent invocation configuration.

---

**End of meta-template.**
