# Prompt Design Meta-Template V2

**Purpose**: Define a seven-block structural framework for all task-specific prompts, so the independent variable `prompt_strategy ∈ {structured, minimal}` has an auditable operational form and every prompt fragment traces to (a) a source document and (b) a measurable outcome.

**Status**: V3 draft. Freeze target: before Phase A pilot runs.

**Scope**: 5 task classes (T1–T5) × 2 prompt variants ≈ 18 concrete prompt files.

---

## 0. Framing — Three Organising Principles

**(a) The prompt is an attention economy.** Every block competes for a fixed budget of context-window attention. This template specifies not only *what* each block contains but *where it sits*, because Liu et al. (2024) *Lost in the Middle* §1 report that "performance is often highest when relevant information occurs at the beginning or end of the input context, and significantly degrades when models must access relevant information in the middle". Block Ordering Policy (§6) makes this a design constraint rather than an afterthought.

**(b) The prompt is a chain of provenance.** Every block declares its source document (PRD, CRM_Scope, Rule Registry, evaluation framework). If a prompt fragment cannot be traced to a source, it does not belong in the frozen prompt. This principle enables full regeneration from source — a freeze can be reconstructed byte-for-byte from `PRD_v1.docx + CRM_Scope_v2 + Rule_Registry_v0.1`, giving the dissertation an audit trail no less strict than a data-engineering pipeline's lineage graph.

**(c) The prompt is a test surface.** Every rule mentioned in Block 6 must be measurable by the evaluation harness (test pass rate, dependency-cruiser violations, layer analysis, etc.). Rules that cannot be measured are removed from the prompt regardless of how "correct" they sound. This is a **Chekhov's Gun** principle for prompts — if it is loaded in Block 6 it must fire in the metrics, and if it will not fire it is cut. Traceability runs prompt ↔ Rule Registry ↔ Evaluation Framework.

These three principles are not competing philosophies; they are three lenses on the same freezable artefact: **each block contains information that (a) fits an attention slot, (b) traces to a source, (c) maps to a measurement**.

---

## 1. Structure

Seven blocks, in this fixed order:

| #     | Block                | Purpose (1 line)                                          | Position policy | Variance under `prompt_strategy` |
| ----- | -------------------- | --------------------------------------------------------- | --------------- | -------------------------------- |
| **1** | Agent Role           | Who the agent is                                          | Head            | Length only                      |
| **2** | Codebase Orientation | Where the code lives                                      | Head            | Length only                      |
| **3** | Problem Statement    | What to build, why, and the domain context                | Head–mid        | **Byte-identical**               |
| **4** | Requirements         | Testable "must" statements                                | Mid             | **Byte-identical**               |
| **5** | Interface            | Public signatures for test alignment (task-conditional)   | Mid             | **Byte-identical when enabled**  |
| **6** | Rules                | Cross-cutting conventions the code must respect           | Tail            | **Full ⇄ Absent** (the IV)       |
| **7** | Delivery / Meta      | Output contract, testing expectation, sequence continuity | Tail            | Mixed (see §2 Block 7)           |

**Under `prompt_strategy`**: Only Block 6 fully toggles, and Block 7's behavioural sub-elements moderate. Blocks 1–5 stay stable (Block 3–5 byte-identical, Blocks 1–2 length-adjusted).

**Under `task_class` (T1/T2/T3/T4/T5)**: Blocks 2, 3, 4, 5 vary by content; the rest stay stable in structure.

---

## 2. The Seven Blocks

Each block card contains: **Purpose · Source · Length · Structured example · Minimal example · Variance rule**.

---

### Block 1 — Agent Role

**Purpose**: Declare the agent's role and the stack it operates in. **Source**: Fixed template. **Length**: structured 40–80 w / minimal 20–40 w.

**Structured example**:

> "You are a senior full-stack engineer working on a production-grade multi-tenant CRM built with NestJS (backend), React with MUI (frontend), TypeScript throughout, and TypeORM with PostgreSQL. The codebase enforces strict layered architecture: controllers → services → repositories."

**Minimal example**:

> "You are a full-stack engineer working on a CRM app using NestJS, React, and TypeScript."

**Variance rule**: Both variants declare the same role and stack. Only the length of the descriptor differs. No rule content leaks in — layered-architecture *mention* is permitted (framing), but layered-architecture *enforcement statements* live in Block 6 R1.

---

### Block 2 — Codebase Orientation

**Purpose**: Point to the target module, reference implementations, and shared utilities. Reduce the agent's exploratory cost. **Source**: The current state of the baseline codebase. **Length**: structured 60–150 w / minimal 40–100 w.

**Structured example**:

> "Modify code under `src/modules/deal/`. Follow the pattern in `src/modules/customer/` (controller → service → repository → entity → dto → tests). Shared utilities live in `src/common/`. Existing DTOs use class-validator; existing repositories extend `BaseRepository`."

**Minimal example**:

> Not provided
> 
> or 
> 
> "Modify `src/modules/deal/`. See `src/modules/customer/` for the pattern. Shared utilities in `src/common/`."

**Variance rule**: Both variants point to the same locations. Structured elaborates the pattern; minimal only lists the paths.

---

### Block 3 — Problem Statement (with Domain Context)

**Purpose**: State the task in GitHub-Issue form — what is missing/broken, why it matters, what success looks like — with just enough domain context that the agent can make sensible product decisions. **Source**: `CRM_Scope_v2_Task_Design.docx` §4.x + relevant excerpts from `PRD_v1.docx`. **Length**: 150–400 w. **Structured = Minimal (byte-identical).**

**Rationale for merging domain context in**: SWE-Bench Pro (Deng et al., 2025, §B.1) treats problem statements as "similar to a Github Issue, and includes the same markdown formatting and conventions found in common open-source repositories" — real issues embed domain background inline rather than isolating it. V2's separate mini-PRD block was a methodological artefact, not a real-world convention.

**Example** (T3 Health Score):

> "### Add customer health score to the CRM
> 
> Customers need a computed engagement metric to help sales prioritise follow-ups. Currently the customer detail and list endpoints return raw fields only; there is no signal indicating whether an account is active, at risk, or dormant.
> 
> ### Domain context
> 
> A **Customer** is an organisation in a sales relationship. It has linked **Deals** (opportunities with stages and monetary value), **Contacts** (people at the customer), and **Interactions** (call/email/meeting/note records with timestamps). Health scoring is a standard capability in mature CRMs (Salesforce, HubSpot, Gainsight).
> 
> ### Why
> 
> Without a health score, sales users cannot prioritise which accounts need attention. This affects both retention (dormant accounts silently churn) and expansion (active accounts miss upsell moments).
> 
> ### Success
> 
> `GET /customers/:id` and `GET /customers` return a `healthScore` field computed from recent interactions, active deals, deal value, and contact count."

**Variance rule**: Structured and minimal share this text byte-for-byte. If a Block 3 draft differs between variants, the freeze fails.

---

### Block 4 — Requirements

**Purpose**: Testable "must" statements that the implementation is verified against. **Source**: `CRM_Scope_v2_Task_Design.docx` §4.x task rules + evaluation framework acceptance criteria. **Length**: 150–400 w. **Structured = Minimal (byte-identical).**

**Leak-prevention discipline** (Deng et al., 2025, §B.2): *"Requirements never include specific code implementation and don't leak solutions."* Requirements state observable behaviour, not implementation. Do not name classes to modify, method bodies, or architectural placements — those either belong in Block 5 (Interface, if public signature) or Block 6 (Rules, if architectural).

**Example** (T3 Health Score):

> - `healthScore` is computed on read, never persisted.
> - Scoring rules (additive):
>   - +20 if any interaction in the last 30 days
>   - +30 if any deal with `stage ∈ {'active', 'negotiation'}`
>   - +20 if total deal value > 10000
>   - +10 if contact count ≥ 2
>   - −30 if no interaction in the last 90 days
> - A customer with both recent and 90+-day-old interactions receives both +20 and −30.
> - `GET /customers/:id` returns `healthScore` as a top-level integer field.
> - `GET /customers` returns `healthScore` for every list item.
> - A new customer with no interactions, no deals, one contact returns `healthScore = 0`.
> - The list endpoint's p95 response time must not degrade beyond the baseline p95 for lists of ≤ 500 customers.

**Variance rule**: Byte-identical across variants. Any statement of the form "must be placed in X module" or "must use Y class" is a **leak** — either move it to Interface, or if it is a general convention, move it to Rules.

---

### Block 5 — Interface (task-conditional)

**Purpose**: Declare the public function/class signatures the unit tests will exercise, so naming drift on the agent's side does not produce false-negative test failures (Deng et al., 2025, §B.3: "the interface helps the agent avoid the failure mode where it implements a viable solution, but uses a class name or module path that the unit test is not expecting"). 

**Source**: Golden-patch analysis of the reference implementation. 

**Length**: 60–200 w.

 **Structured = Minimal (byte-identical).** 

**Enabled when**: the task introduces new public methods that tests will call directly (T1 CRUD endpoints, T3 aggregation service, T4 build-phase steps). **Disabled** for T2 unless modification introduces a new public method.

**Example** (T3 Health Score):

> Function: `computeHealthScore` 
> 
> Location: `src/modules/customer/customer.service.ts` 
> 
> Inputs: `customerId: string` 
> 
> Outputs: `Promise<number>` (integer, may be negative)
> Description: Computes the health score for a single customer by aggregating from interaction, deal, and contact repositories.
> 
> 
> 
> Function: `attachHealthScores` Location: `src/modules/customer/customer.service.ts` Inputs: `customers: Customer[]` Outputs: `Promise<(Customer & { healthScore: number })[]>` Description: Batch variant used by the list endpoint.

**Variance rule**: Byte-identical when enabled. If enabled in structured but disabled in minimal, that is a freeze defect — Interface is task-conditional, not variant-conditional.

---

### Block 6 — Rules

**Purpose**: Cross-cutting conventions the code must respect. This is the operational form of `prompt_strategy`. 

**Source**: `Rule Registry V0.1` — the D3="prompt-fixable" and D3="mixed" subsets. **Structured**: All seven sub-blocks (R1–R7) present. **Minimal**: All seven sub-blocks **absent**.

**Discipline**: Every rule statement in R1–R7 must correspond to a Rule ID in the Rule Registry, and that Rule ID must be measurable by the evaluation harness. Rules that do not map to a measurable metric are removed (Chekhov's Gun principle from §0(c)).

Below: seven rule sub-blocks. Each shows purpose · rule IDs covered · structured example. Minimal example is uniformly *(omitted)*.

---

#### R1 — Architectural Constraints

**Purpose**: Layer-dependency rules. **Rule IDs covered**: ARCH-1, ARCH-2, ARCH-3, ARCH-4, ARCH-5. **Length**: 100–200 w.

**Structured example**:

> - Controllers may only orchestrate: receive HTTP, call one service method, map response, translate exceptions to status codes.
> - Business logic lives in services.
> - Only repositories touch the database (TypeORM).
> - No upward imports (services must not import controllers; repositories must not import services or controllers).
> - No circular dependencies between modules.
> - Frontend consumes the backend only through `src/services/api/` — never `fetch()` or `axios` direct.

---

#### R2 — HTTP / REST Conventions

**Purpose**: RFC 9110 semantics and URL conventions. **Rule IDs covered**: WEB-1, WEB-2, WEB-3, WEB-4, WEB-5, WEB-6, SEC-4. **Length**: 120–250 w.

**Structured example**:

> - GET is safe and idempotent; GET handlers must not write.
> - POST for creation and non-idempotent ops. PUT is idempotent full replace. PATCH is partial. DELETE is idempotent.
> - URLs use plural nouns: `/customers`, `/deals`. Nesting depth ≤ 2.
> - Status codes: 4xx for client/business errors; 5xx only for uncaught infra faults. Use 400 (malformed), 404 (missing), 409 (state conflict), 422 (semantic validation).

---

#### R3 — Error Handling

**Purpose**: Consistent error-response construction. **Rule IDs covered**: STY-5, WEB-7, WEB-8. **Length**: 100–180 w.

**Structured example**:

> - Throw domain exceptions from services (`EntityNotFoundException`, `InvalidStateTransitionException`, `BusinessRuleViolationException`) from `src/common/exceptions/`.
> - Do not throw raw `HttpException` from controllers or services — the global `HttpExceptionFilter` maps domain exceptions to status codes.
> - All error responses follow `{ error: { code, message, details? } }`. Do not construct error bodies manually.

---

#### R4 — DTO Validation

**Purpose**: Enforce input validation at the HTTP boundary and FE↔BE type sync. **Rule IDs covered**: WEB-9, WEB-10, SEC-3. **Length**: 80–150 w.

**Structured example**:

> - Every POST/PUT/PATCH accepts a class-validator DTO. Direct `req.body` access is forbidden.
> - DTOs live in `<feature>/dto/`.
> - Global `ValidationPipe` runs with `{ whitelist: true, forbidNonWhitelisted: true }`.
> - The frontend API-client type must match the backend DTO field-for-field.

---

#### R5 — Naming and Style

**Purpose**: Prevent stylistic oscillation within a task's output. **Rule IDs covered**: STY-3, LLM-7. **Length**: 60–120 w.

**Structured example**:

> - TypeScript strict is on; no `any` (use `unknown` + type guard).
> - camelCase for vars/functions/properties; PascalCase for classes/types; SCREAMING_SNAKE for constants.
> - Prefer `interface` for object shapes; `type` for unions.
> - Import order: framework → internal module → relative; alphabetical within each group.

---

#### R6 — Anti-Shortcut Warning

**Purpose**: Suppress shortcut behaviour when the correct architecture feels expensive. **Rule IDs covered**: ARCH-1, BIZ-4, LLM-6. **Length**: 50–100 w.

**Structured example**:

> If a task needs data from multiple entities, do NOT bypass the repository layer with a cross-table SQL or QueryBuilder chain in the service. Inject each entity's repository, fetch, and aggregate in memory in the service. Performance concerns go through refactor review — not shortcut.

---

#### R7 — Completeness

**Purpose**: Block stub-and-claim and happy-path-only patterns. **Rule IDs covered**: LLM-1, LLM-2. **Length**: 80–140 w.

**Structured example**:

> - No empty method bodies or `throw new Error('Not implemented')`.
> - Handle null / undefined / empty arrays / boundary values explicitly. Do not assume DTO-validated inputs are well-formed at service-to-service boundaries.
> - Every code path handles errors from dependencies. Silent try-catch is forbidden.
> - Each new service method has at least one test each for: happy path, one edge case, one error case.

---

### Block 7 — Delivery / Meta

**Purpose**: Constrain the agent's *behaviour* around the code (not the code itself) so the harness can reliably measure outcomes.

**Internal decomposition** — this block splits into two sub-categories with different variance behaviour under `prompt_strategy`:

| Sub-category         | Members                                  | Role                        | Variance under `prompt_strategy`                      |
| -------------------- | ---------------------------------------- | --------------------------- | ----------------------------------------------------- |
| **Meta-Measurement** | Output Format                            | Harness compatibility layer | **Stable** (both variants)                            |
| **Meta-Behavioural** | Testing Expectation, Sequence Continuity | Agent-behaviour nudge       | **Varies** (structured full / minimal weak or absent) |

**Rationale for the split**: Meta-Measurement is treatment-agnostic instrumentation. If it varied by variant, the harness's ability to parse `minimal` runs would be systematically weaker than its ability to parse `structured` runs — the observed effect would then confound treatment with measurement reliability (Wohlin et al., 2012, §8 construct validity). Meta-Behavioural elements, in contrast, are legitimately part of the treatment because they change what the agent does, not how it is measured.

---

#### Meta-Measurement — Output Format

**Purpose**: Guarantee harness-parsable output regardless of variant. **Length**: 40–80 w in both variants.

**Structured example**:

> "When done, list every file created or modified with its full path relative to the repo root. No commit messages, no changelog, no design-rationale prose — the harness reads code, not narration."

**Minimal example** (nearly identical):

> "When done, list every file you changed with its full path relative to the repo root. No commit messages, no explanations."

**Variance rule**: Both variants contain a functionally equivalent format contract. Only phrasing may soften; substance is identical.

---

#### Meta-Behavioural — Testing Expectation

**Purpose**: Anchor the coverage-shape contract; block happy-path-only patterns. **Length**: structured 60–120 w / minimal 20–40 w.

**Structured example**:

> "Write Vitest tests co-located with modified files. Cover: (a) happy path with realistic data; (b) at least one edge case (empty, null, boundary); (c) at least one error case (invalid input, downstream failure). Use utilities in `test/utils/`. Do not modify existing tests unless the requirement explicitly says to."

**Minimal example**:

> "Add tests where appropriate."

**Variance rule**: Structured specifies coverage shape; minimal deliberately does not.

---

#### Meta-Behavioural — Sequence Continuity (T4 only, steps 2+)

**Purpose**: Counter Lost-in-the-Middle drift by re-anchoring earlier decisions at the current prompt's attention-rich zone. **Length**: 80–150 w in structured. **Disabled** in minimal.

**Structured example**:

> "This is step N of a multi-step task. Steps 1..N−1 established conventions you MUST preserve unless this step explicitly overrides them: naming patterns, error envelope shape, layer boundaries, shared DTO base types, shared exception classes. If completing this step requires revising an earlier decision, do not silently work around it — surface the conflict and propose the refactor before implementing."

**Variance rule**: Enabled only for T4 steps ≥ 2. In `minimal`, absent — because minimal is the diagnostic condition that measures whether drift occurs without this compensation.

---

## 3. Variant Selection Matrix

| Block                   | Structured           | Minimal                             | Notes                                 |
| ----------------------- | -------------------- | ----------------------------------- | ------------------------------------- |
| 1. Agent Role           | ✅ full               | ✅ short                             | Length only                           |
| 2. Codebase Orientation | ✅ full               | ✅ short                             | Length only                           |
| 3. Problem Statement    | ✅                    | ✅ (byte-identical)                  | Contains merged domain context        |
| 4. Requirements         | ✅                    | ✅ (byte-identical)                  | Leak-prevention discipline enforced   |
| 5. Interface            | ✅ (task-conditional) | ✅ (byte-identical, same conditions) | Enable for T1, T3, T4 build steps     |
| 6. Rules (R1–R7)        | ✅ all seven          | ❌ all seven absent                  | The operational form of the IV        |
| 7.a Output Format       | ✅                    | ✅                                   | Meta-Measurement — treatment-agnostic |
| 7.b Testing Expectation | ✅ full               | ✅ weak                              | Meta-Behavioural — moderated          |
| 7.c Sequence Continuity | ✅ (T4 steps 2+)      | ❌                                   | Meta-Behavioural — variant-differing  |

**Aggregate length**: structured ≈ 1400–2600 w; minimal ≈ 350–650 w.

---

## 4. Task-Specific Filling Table

| Task                          | Block 3 source         | Block 4 source                         | Block 5 enabled               | Block 7.c enabled |
| ----------------------------- | ---------------------- | -------------------------------------- | ----------------------------- | ----------------- |
| **T1** Deal CRUD              | §4.1 real-world + task | §4.1 rules                             | ✅ (new CRUD endpoints)        | ❌                 |
| **T2** Pipeline state machine | §4.2 real-world + task | §4.2 rules + orphan-reference          | ⚠️ only if new public methods | ❌                 |
| **T3** Health score           | §4.3 real-world + task | §4.3 rules + list-endpoint perf        | ✅ (new aggregation service)   | ❌                 |
| **T4** step 1                 | §4.4 T4.1              | §4.4 T4.1                              | ✅                             | ❌                 |
| **T4** step k (k ≥ 2)         | §4.4 T4.k              | §4.4 T4.k                              | ⚠️ per step                   | ✅                 |
| **T5a** Vague                 | §4.5a verbatim         | §4.5a (empty by design)                | ❌                             | ❌                 |
| **T5b** Conflict              | §4.5b verbatim         | §4.5b (contradiction — do NOT resolve) | ❌                             | ❌                 |

**T5 preservation rule**: The ambiguity or conflict IS the treatment; do not clarify it in either variant. Both variants present the same source text verbatim.

---

## 5. Stability Rules (S1–S3, freeze-verifiable)

**S1 — Task-specification byte-identity.** For the same task, Blocks 3, 4, and 5 in `structured` and `minimal` must `diff`-clean (zero byte difference).

**S2 — Rule-block exclusivity.** Only Block 6 (R1–R7) may appear in `structured` and be absent from `minimal`. Any convention or rule statement appearing inside Blocks 3, 4, or 5 is a **leak defect** — move it to R1–R7 or delete.

**S3 — Cross-variant length ratio.** `length(structured) / length(minimal) ∈ [3, 8]` for the same task. Below 3 → structured under-treated. Above 8 → minimal likely stripped of essential specification (audit S1/S2).

---

## 6. Block Ordering Policy

Blocks appear in the prompt file in this fixed order:

```
1. Agent Role                     (head — anchors identity)
2. Codebase Orientation           (head — reduces exploration)
3. Problem Statement              (head-mid — sets goal)
4. Requirements                   (mid — the contract)
5. Interface (if enabled)         (mid — test alignment)
6. Rules (R1 → R7)                (tail — high-attention zone)
7. Delivery / Meta                (tail — final instructions)
```

---

## 7. File Naming and Header Convention

```
prompts/
├── prompt_meta_template_v3.md
├── T1_structured.md
├── T1_minimal.md
├── T2_structured.md
├── T2_minimal.md
├── T3_structured.md
├── T3_minimal.md
├── T4-step1_structured.md
├── T4-step1_minimal.md
├── ... (T4-step2 … step8)
├── T5a_structured.md
├── T5a_minimal.md
├── T5b_structured.md
└── T5b_minimal.md
```

**Header** (top of every prompt file):

```markdown
<!--
Task: T3 (Health Score)
Variant: structured
Blocks enabled: 1, 2, 3, 4, 5, 6 (R1–R7), 7 (all)
Rule IDs targeted (D3 = prompt-fixable): ARCH-1, ARCH-4, WEB-1, WEB-2, WEB-9, STY-3, BIZ-*, LLM-1, LLM-2, LLM-6
Derived from: prompt_meta_template_v3.md
Source documents: PRD_v1.docx, CRM_Scope_v2_Task_Design.docx §4.3, Rule_Registry_v0.1.md
Content hash (SHA-256 of blocks 3+4+5): [pending — set at freeze commit]
Frozen at: [pending — set at freeze commit]
-->
```

**Content hash rationale**: The SHA-256 of Blocks 3+4+5 lets S1 be verified with a single hash comparison rather than a full `diff`, and allows dissertation appendices to cite the exact prompt content by hash rather than by prose reproduction.

---

## 8. Freeze Checklist

Before applying the `prompts-frozen-v2` git tag:

- [ ] All prompt files exist and parse.
- [ ] Every file's header lists exactly the blocks its variant requires.
- [ ] Length constraints per block are within specified ranges.
- [ ] **S1 verified**: SHA-256 of Blocks 3+4+5 in `<task>_structured.md` equals that in `<task>_minimal.md` for every task.
- [ ] **S2 verified**: no rule statement (ARCH-*, WEB-*, STY-*, SEC-*, BIZ-*, LLM-*) appears inside Blocks 3, 4, or 5 in any file.
- [ ] **S3 verified**: length ratio ∈ [3, 8] for every task pair.
- [ ] Block Ordering Policy respected in every file.
- [ ] T5a/T5b ambiguity/conflict text is verbatim identical between variants.
- [ ] T4 step k+1 references step k's output in Block 2, not the baseline.
- [ ] T4 steps 2+ include Block 7.c; step 1 does not.
- [ ] No numeric threshold from the Rule Registry appears in prose (e.g. "keep functions under 50 lines" — that is tool-detected).
- [ ] No implementation leaks (specific class names to modify, code snippets, method bodies).
- [ ] Supervisor has reviewed this meta-template and at least 2 sample prompts.

```bash
git add prompts/
git commit -m "Freeze prompt set V3 for Phase A pilot"
git tag prompts-frozen-v3
```

Post-tag modification → new tag (`prompts-frozen-v4`), affected runs re-executed, methodology chapter updated with justification.

---

## 9. Out of Scope

- **System vs user prompt boundary** — interface-tool-specific; not a treatment variable.
- **Multi-turn interaction protocol** — governed by `human_intervention_protocol.md`.
- **Retrieval-augmented context** — agent-tool property, not prompt property.
- **Sampling parameters** (temperature, top_p, seed) — set in agent invocation config, not here. Seed choice must be documented independently for reproducibility.
- **Ablation of rule sub-blocks** (leaving R1 in but removing R2, etc.) — reserved for a possible Phase B ablation study, not part of Phase A treatment definition.

---

## 10. Change Log Summary

| Version | Top-level structure          | Rules structure           | Meta structure                           | Key discipline added                                            |
| ------- | ---------------------------- | ------------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| **V1**  | 14 flat components (C1–C14)  | Distributed across C4–C10 | Distributed across C11–C14               | Component-rule mapping                                          |
| **V2**  | 4 tiers × 16 blocks (B1–B16) | Tier III (B7–B13)         | Tier IV (B14–B16)                        | Byte-identity for Tier II                                       |
| **V3**  | **7 top-level blocks**       | **R1–R7 within Block 6**  | **Meta-Measurement vs Meta-Behavioural** | Block ordering policy; provenance chain; hash-verifiable freeze |

---

**End of V2 meta-template.**
