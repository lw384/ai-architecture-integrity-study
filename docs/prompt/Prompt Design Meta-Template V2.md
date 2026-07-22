# Prompt Design Meta-Template V2

**Purpose**: Define a seven-block structural framework for all task-specific prompts, so the independent variable `prompt_strategy ∈ {structured, minimal}` has an auditable operational form.

**Status**: V2.

**Scope**: 5 task classes (T1–T5) × 2 prompt variants ≈ 18 concrete prompt files.

---

## 0. Framing

**(a) The prompt is an attention economy.** Every block competes for a fixed budget of context-window attention.

**(b) The prompt is a chain of provenance.** Every block declares its source document (PRD, CRM_Scope, Rule Registry, evaluation framework).

**(c) The prompt is a test surface.** Every rule mentioned in Block 6 must be measurable by the evaluation harness (test pass rate, dependency-cruiser violations, layer analysis, etc.).

---

## 1. Structure

Seven blocks, in this fixed order:

| #     | Block                | Purpose                                                                  | Position policy | Variance under `prompt_strategy` |
| ----- | -------------------- | ------------------------------------------------------------------------ | --------------- | -------------------------------- |
| **1** | Agent Role           | Who the agent is and the tech stack                                      | Head            | Byte-identical                   |
| **2** | Codebase Orientation | Where the target files and reference modules live                        | Head            | Length only                      |
| **3** | Problem Statement    | What to build, why, and the domain context                               | Head–mid        | **Byte-identical**               |
| **4** | Requirements         | Testable "must" statements （Black-box Behavior Acceptance）               | Mid             | **Byte-identical**               |
| **5** | API Contract         | External REST boundaries for black-box test alignment (task-conditional) | Mid             | **Byte-identical when enabled**  |
| **6** | Rules                | Cross-cutting conventions the code must respect                          | Tail            | Full ⇄ Absent                    |
| **7** | Delivery / Meta      | Output contract, testing expectation, sequence continuity                | Tail            | Byte-identical                   |

**Under prompt_strategy**:

Only Block 6 fully toggles, serving as the sole independent variable (IV).

Blocks 1–5 and 7 stay stable (Blocks 3, 4, and 7 are byte-identical; Blocks 1–2 are length-adjusted).

**Under task_class (T1/T2/T3/T4/T5):** Blocks 2, 3, 4 and 5 vary by content to reflect the iterative progression of the CRM features; the rest stay stable in structure.

---

## 2. The Seven Blocks

Each block contains: **Purpose · Source · Length · Structured example · Minimal example · Variance rule**.

---

### Block 1 — Agent Role

**Purpose**: Declare the agent's role and the stack it operates in.

**Source**: Fixed template.

**Length**: structured 40–80 w / minimal 20–40 w.

**Example**:

> You are a senior full-stack engineer working on a production-grade multi-tenant CRM built with NestJS using TypeScript (backend), React with MUI using JavaScript (frontend), and TypeORM with PostgreSQL.

---

### Block 2 — Codebase Orientation

**Purpose**: Point to the target module, reference implementations, and shared utilities. Reduce the agent's exploratory cost. **Source**: The current state of the baseline codebase. **Length**: structured 60–150 w / minimal 40–100 w.

**Example**:

> Modify code under `src/modules/deal/`. Reference implementations can be found in `src/modules/customer/`.Shared utilities are located in `src/common/`.

---

### Block 3 — Problem Statement

**Purpose**: State the task in GitHub-Issue form — what is missing/broken, why it matters, what success looks like — with just enough domain context that the agent can make sensible product decisions.

**Source**: `CRM_Scope_v2_Task_Design.docx` §4.x + relevant excerpts from `PRD_v1.docx`.

**Length**: 150–400 w.

**Structured = Minimal (byte-identical).**

**Example**:

> ### Add customer health score to the CRM
> 
> ### Background
> 
> A Customer in our CRM is an organisation in a sales relationship. It has linked Deals (opportunities with stages and monetary value), Contacts (people at the customer), and Interactions (call/email/meeting/note records with timestamps). Health scoring is a standard capability in mature CRM platforms to evaluate account engagement.
> 
> ### Current Problem
> 
> Currently, the customer detail and list views return raw fields only; there is no signal indicating whether an account is active, at risk, or dormant. Without a health score, sales users cannot prioritise which accounts need attention. This affects both retention (dormant accounts silently churn) and expansion (active accounts miss upsell moments).
> 
> ### Desired Outcome
> 
> The system must dynamically compute and expose a healthScore for each customer based on their recent interactions, active deals, deal value, and contact count. This metric must be readily available to the frontend whenever customer data is requested, providing immediate visibility into account health.

**Variance rule**: Structured and minimal share this text byte-for-byte. If a Block 3 draft differs between variants, the freeze fails.

---

### Block 4 — Requirements

**Purpose**: Testable "must" statements that the implementation is verified against. **Source**: `CRM_Scope_v2_Task_Design.docx` §4.x task rules + evaluation framework acceptance criteria.

**Length**: 150–400 w.

**Structured = Minimal (byte-identical).**

**Example** (Health Score):

> - **Business Rules**: The `healthScore` must be computed dynamically in real-time when customer data is requested; it must NOT be persisted as a static column in the database.
> 
> - **Scoring rules (additive):**
>   
>   - +20 if there is any interaction in the last 30 days.
>   
>   - +30 if there is any deal with `stage ∈ {'active', 'negotiation'}`.
>   
>   - +20 if total deal value > 10000.
>   
>   - +10 if contact count ≥ 2.
>   
>   - −30 if there is no interaction in the last 90 days.
> 
> - **Edge Cases:**
>   
>   - A customer with both recent (< 30 days) and old (> 90 days) interactions must receive both the +20 and −30 modifiers.
>   
>   - A new customer with zero interactions, zero deals, and exactly one contact must return a `healthScore = 0`.
> 
> - **Performance:** The data retrieval response time (p95) for lists of ≤ 500 customers must not degrade beyond the established baseline.

**Variance rule**: Byte-identical across variants. Any statement of the form "must be placed in X module", "must use Y class", or "must be exposed at route Z" is a **leak** — either move it to Block 5 (if it is an API contract) or Block 6 (if it is an architectural convention). **Leak-prevention discipline** (Deng et al., 2025): *"Requirements never include specific code implementation and don't leak solutions."*

---

### Block 5 — API Contact (task-conditional)

**Purpose**: Define external REST boundaries for black-box test alignment.
**Source**: API schema or target test harness endpoints.
**Length**: 0–150 w.
**Variance rule**: Task-conditional.

If the task introduces or modifies public endpoints (e.g., T1, T3), this block is enabled and must be byte-identical across structured and minimal variants.

If the task is purely internal refactoring or state-machine logic enhancement without API changes, this block is explicitly defined as "No changes to existing API contracts are required." or omitted entirely.

**Structured = Minimal (byte-identical).**

### Example A: Enabled

> **External API Contract**
> 
> The following REST endpoints must be updated to fulfill the frontend requirements. The internal architecture, file structure, and DTO definitions used to satisfy this contract are up to you.
> 
> **Endpoint 1: Fetch Customer List**
> 
> - **Route:** `GET /api/customers`
> 
> - **Request Body**: { "customerId": string, "amount": number }
> 
> - **Response:** Each customer object in the returned JSON array must include a new top-level field: `"healthScore": number` (integer).
> 
> **Endpoint 2: Fetch Single Customer**
> 
> - **Route:** `GET /api/customers/:id`
> 
> - **Request Body**: { "customerId": string, "amount": number }
> 
> - **Response:** The returned single customer JSON object must include a new top-level field: `"healthScore": number` (integer).

### Example B: Disabled

> External API Contract
> No changes to the existing public API contracts are required. The frontend will continue to use the current endpoints and payload structures. Ensure your internal logic enhancements do not break the existing REST interfaces.

**Variance rule**: Byte-identical across both variants. If Example A is used in structured, the exact same Example A must be used in minimal. The agent's decision on where and how to implement this contract is left entirely to Block 6 (Rules) in structured or its own autonomy in minimal.

---

### Block 6 — Rules

**Purpose**: Cross-cutting conventions the code must respect. This block acts as the **Sole Independent Variable (IV)** of the experiment. Its contents are strictly mapped 1:1 to the automated evaluation harness (`rulepacks/` directory).

**Source**: The `rulepacks/` directory definitions (specifically YAML configs under `js-react-frontend/rules` , `ts-nestjs-backend/rules`, `cross/rules`).

**Length**: 200–500 w (Structured) / 0 w (Minimal).

**Variance rule**:

- **Structured**: All rule sub-blocks (R1–R3) are fully present.

- **Minimal**: Completely absent. Replaced by a single sentence: *"Please determine the best internal code structure and patterns autonomously to fulfill the requirements."*

Every rule statement in this block MUST trace directly to a measurable configuration in the `rulepacks` tree.

- If a rule is stated in Block 6, there must be a tool actively scanning for it.

- If a constraint exists in `rulepacks/manifest.yaml`, its natural-language equivalent must appear here.

- Unmeasurable guidelines (e.g., "write clean code") are strictly forbidden.

Below are the mapped sub-blocks. Each shows purpose, the corresponding Harness Rule ID, and a structured example.

---

#### R1 — Backend

**Purpose**: Layer-dependency rules.

**Length**: 100–200 w.

**Rule IDs covered**: ARCH-1, ARCH-2, ARCH-3, ARCH-4, ARCH-5.

##### Backend Architecture & Boundaries

##### Dependancy

##### Domain Boundaries

##### Error & Transaction Handling

##### Data Contracts

**Structured example**:

---

#### R2 — Frontend

**Purpose**: RFC 9110 semantics and URL conventions.

**Rule IDs covered**: WEB-1, WEB-2, WEB-3, WEB-4, WEB-5, WEB-6, SEC-4.

**Length**: 120–250 w.

Component Granularity
State Location
Routing Structure
Style Isolation
Data Fetching & Effects
Inter-component Communication

**Structured example**:

---

#### R3 — Cross-Stack Quality & Conventions

**Purpose**: Consistent error-response construction.

**Rule IDs covered**: STY-5, WEB-7, WEB-8.

**Length**: 100–180 w.

Type Contract Consistency
Endpoint Existence
Error Code Convention
Resource Naming Alignment

Change Propagation Completeness

**Structured example**:

---

### Block 7 — Meta

**Purpose**: Constrain the agent's *behaviour* around the code (not the code itself) so the harness can reliably measure outcomes.

**Length**: 150–400 w.

**Structured = Minimal (byte-identical).**

**Example**

> Delivery & Verification Protocol:
> 
> - Autonomous Verification: You MUST write and execute functional tests (npm run test) to verify your implementation. You are responsible for fixing any compilation errors or failing tests before concluding.
> 
> - Architecture Blindness: You are strictly forbidden from running architectural linters, dependency-cruisers, or custom rulepacks. Your task is to fulfill the functional requirements.
> 
> - Output Discipline: Do NOT print raw source code, diffs, or design rationales. Modify the files directly in the workspace.
> 
> - Termination Signal: Once your tests pass and the implementation is complete, output exactly [TASK_COMPLETED] on a new line and terminate your process immediately.

---

## 3. Variant Selection Matrix

| Block                   | Structured           | Minimal              | Notes |
| ----------------------- | -------------------- | -------------------- | ----- |
| 1. Agent Role           | ✅ same               | ✅ same               |       |
| 2. Codebase Orientation | ✅ same               | ✅ same               |       |
| 3. Problem Statement    | ✅                    | ✅                    |       |
| 4. Requirements         | ✅                    | ✅                    |       |
| 5. API Contact          | ✅ (task-conditional) | ✅ (task-conditional) |       |
| 6. Rules (R1-R3)        | ✅ all                | ❌  absent            |       |
| 7. Meta Behaviour       | ✅                    | ✅                    |       |

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

## 5. Block Ordering Policy

Blocks appear in the prompt file in this fixed orde

```
1. Agent Role                     (head — anchors identity)
2. Codebase Orientation           (head — reduces exploration)
3. Problem Statement              (head-mid — sets goal)
4. Requirements                   (mid — the contract)
5. API contact (if enabled)       (mid — test alignment)
6. Rules (R1 → R7)                (tail — high-attention zone)
7. Meta                           (tail — final instructions)
```

---

## 7. File Naming and Header Convention

```
prompts/
├── prompt_meta_template_v2.md
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
Blocks enabled: 1, 2, 3, 4, 5, 6, 7 (all)
Rule IDs targeted: ARCH-1, ARCH-4, WEB-1, WEB-2, WEB-9, STY-3, BIZ-*, LLM-1, LLM-2, LLM-6
Derived from: prompt_meta_template_v3.md
Source documents: PRD_v1.docx, CRM_Scope_v2_Task_Design.docx §4.3, Rule_Registry_v0.1.md
Content hash (SHA-256 of blocks 3+4+5): [pending — set at freeze commit]
Frozen at: [pending — set at freeze commit]
-->
```

**Content hash rationale**: The SHA-256 of Blocks 3+4+5 lets S1 be verified with a single hash comparison rather than a full `diff`, and allows dissertation appendices to cite the exact prompt content by hash rather than by prose reproduction.

---

## 8. Out of Scope

- **System vs user prompt boundary** — interface-tool-specific; not a treatment variable.
- **Multi-turn interaction protocol** — governed by `human_intervention_protocol.md`.
- **Retrieval-augmented context** — agent-tool property, not prompt property.
- **Sampling parameters** (temperature, top_p, seed) — set in agent invocation config, not here. Seed choice must be documented independently for reproducibility.
- **Ablation of rule sub-blocks** (leaving R1 in but removing R2, etc.) — reserved for a possible Phase B ablation study, not part of Phase A treatment definition.