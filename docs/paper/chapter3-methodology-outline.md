# Chapter 3 — Methodology: Full Section-by-Section Outline

Built from the current draft's structure (§3.1–3.7 as already written) plus every correction identified in the two prior revision passes (5-sprint→3-task reality; 8→9 backend concerns; corrected metric formulas; minimum-covering-set principle; cross-stack pruning rationale; explicit architecture-only scope statement; data schema; Block 5+6 joint-IV rationale). No section is renumbered at the top level — §3.1–3.7 stay as they are in the draft's Table of Contents. New subsections are inserted where a gap was identified; existing subsections are kept where their content is already sound and only need factual correction.

For each subsection: **title → question(s) it answers → the order/logic it should follow → figure/table needed (if any) and what it must show**.

---

## 3.1 Research Design

### 3.1.1 Three Coupled Components Overview
*(existing content, minor fix)*

**Answers:** What is the overall apparatus, and why exactly these three parts?

**Logic:** Restate the three gaps identified at the end of Chapter 2 (§2.3) one at a time, then map each gap to the one component that closes it — stack-coverage gap → starter codebase; task-isolation/replay-based-evolution gap → task chain; evaluation-reduction-to-functional-signals gap → rulepack. Keep the existing three-paragraph structure; only correct "five sprints" language wherever the task chain is described (it now closes with three tasks, not five — see §3.3).

**Figure/Table:** None here — this section should verbally point forward to Figure 3.1 (§3.5.4) rather than duplicate a diagram.

### 3.1.2 Scope Boundary: Architectural Integrity, Not Functional Correctness
*(new subsection)*

**Answers:** What does this study measure, and — just as importantly — what does it deliberately not measure?

**Logic:** Introduce the three-layer evaluation model by name (Constraints / Metrics / Judgments) here, ahead of its detailed treatment in §3.4.1, specifically to make the scope decision impossible to miss. State plainly that Judgments — the layer that would grade functional compliance against each task's acceptance criteria — was designed as part of the instrument but not operationalised, and give the reason (time constraint, not a methodological objection). Close by forward-referencing exactly what feeds Chapter 4's "functional and efficiency outcomes" section in its absence (whatever proxy signal is actually used — e.g., test-suite pass/fail from the Delivery & Verification Protocol — must be named explicitly here, not left implicit until Chapter 4).

**Figure/Table:** A small 3-row table — *Table 3.0a: Evaluation Layers and Operationalisation Status* — columns: Layer | What it measures | Operationalised in this study?. Rows: Constraints (Y), Metrics (Y), Judgments (N — see limitation). This single table does more to prevent a reader's confusion in Chapter 4 than a paragraph would.

---

## 3.2 Starter Codebase

### 3.2.1 Business Domain and Architectural Paradigm
*(existing content, keep)*

**Answers:** What business domain was modelled, and why this specific architectural paradigm (decoupled layered client–server over REST)?

**Logic:** Existing two-paragraph structure is sound: cite the diversity of reference architectures in practice to justify narrowing scope to one paradigm, then justify the CRM domain choice by its evolving entity-relationship model (Company/Contact/Deal) forcing genuine layering and DTO discipline rather than allowing a flat, unlayered implementation to pass unnoticed.

**Figure/Table:** None.

### 3.2.2 Technology Stack
*(existing content, one internal contradiction to fix)*

**Answers:** What is the concrete stack, and why the deliberate TypeScript/JavaScript asymmetry between backend and frontend?

**Logic:** Keep existing justification (React's frontend dominance, NestJS's architectural discipline on the backend, asymmetry as a deliberate probe of whether cross-stack contracts survive a type-system boundary). **Fix required:** §3.2 currently states the frontend is "React/TypeScript" while §3.3 states "the frontend uses plain JavaScript" — these contradict each other and only the second is consistent with the actual system and with every task prompt (which specifies "React with MUI using JavaScript"). Correct §3.2's phrasing to match.

**Figure/Table:** None.

### 3.2.3 Rationale for a Bespoke, Zero-Violation Codebase
*(existing content, add one table)*

**Answers:** Why build a codebase from scratch instead of adopting an existing open-source repository, and how is the "zero-violation baseline" claim actually verified rather than merely asserted?

**Logic:** Keep the existing confound argument (mature open-source repositories carry pre-existing technical debt that would contaminate attribution of any observed violation to the agent). Add one sentence naming the verification procedure: the starter codebase is run through the full rulepack (§3.4) before any experimental condition begins, and the result is archived as the reference zero-violation baseline against which every subsequent delta is computed.

**Figure/Table:** *Table 3.0b: Baseline Verification Summary* — one row per concern category (9 backend + 7 frontend + 3 cross-stack), columns: Concern | Constraint status | Metric value. All rows should show a clean pass / zero-or-minimal value. This table is evidentiary, not just descriptive — it is the reader's proof that "zero-violation baseline" is a measured fact, not a claim.

---

## 3.3 Task Chain Design
*(renamed content only where noted — "Sprint Chain" terminology can stay if preferred; the fix is to the count and nature of the tasks, not the label)*

### 3.3.1 Design Principles Governing the Task Sequence
*(existing content, keep the three principles, drop five-task framing)*

**Answers:** What principles governed how the sequence of tasks was designed, independent of what any individual task contains?

**Logic:** Keep the existing three-principle structure — phase progression mirroring real business-system evolution; challenges curated from empirically documented erosion triggers; full rulepack coverage exercised across the sequence — but remove every reference to five phases/sprints and to a "retrospective consolidation" phase, since T4/T5 do not exist as scored, code-modifying tasks in the actual instrument (see §3.3.3).

**Figure/Table:** None here.

### 3.3.2 Task Specifications (T1–T3)
*(existing content restructured around three tasks, not five; this is the subsection that directly answers "how was each task designed and what factors were considered")*

**Answers:** For each of the three tasks — what is the task, what specific architectural challenge does it target, and *why* does that task's content plausibly stress those specific concerns rather than others?

**Logic:** One paragraph per task, each following the same internal order so the three read as a matched set:
1. **Business framing** — the one- or two-sentence product-ticket description as the agent would see it.
2. **Targeted concern(s)** — named from the corrected Table 3.2 vocabulary (§3.4.5).
3. **Design rationale** — the causal argument for why this task's shape plausibly stresses those concerns and not others. E.g., for T2 (Contact–Company and Deal–Contact become many-to-many, with data migration): the task requires touching an existing resource from two directions at once (Contact and Deal both gain new link-management logic), which is precisely the condition under which BE-DUP violations (copy-pasted attach/detach/set-primary logic instead of one shared implementation) and CROSS-PROP violations (one side of the relationship updated, the counterpart left stale) are expected to concentrate — this reasoning is currently entirely absent from the draft, which only lists concern IDs without explaining why each task was expected to produce them.
4. **What entangles this task with the previous one** — T2 remodels the relationships T1 created; T3's "transition to `active` requires ≥1 linked Contact" precondition directly depends on the many-to-many concept T2 introduced. This is the paragraph that establishes the trajectory is a genuine accumulating sequence, not three independent tasks that happen to share a codebase.

**Figure/Table:**
- *Table 3.1 (revised)* — three rows (T1/T2/T3), columns: ID | Task Summary | Primary Architectural Challenge | Targeted Concerns (using corrected IDs: BE-STRUCT/BE-DEP/BE-CONTRACT/BE-ROUTE/CROSS-EP/CROSS-TYPE for T1; BE-CONTRACT/BE-DOM/BE-DUP/CROSS-TYPE/CROSS-PROP for T2; BE-DOM/BE-ERR/BE-DUP/CROSS-PROP for T3) | Design Rationale (one-line pointer into the prose paragraph above — replaces the currently empty "Sources" column, which has no clear purpose as originally drafted).
- *Figure 3.A (new)* — **Task Entanglement Diagram**: three boxes (T1 → T2 → T3) connected by labelled arrows, where each arrow names the specific artefact one task hands to the next (T1→T2: "Deal↔Company/Contact relations"; T2→T3: "linked-Contacts concept, used as a T3 transition precondition"). This is the single most useful new figure in the chapter — it is the only place the "genuinely accumulating trajectory" claim (central to the whole study's premise) is shown rather than asserted.

### 3.3.3 T5: Post-Hoc Architectural Self-Review
*(new subsection — separates out content that the current draft incorrectly folds into the sprint chain as a fifth, code-modifying sprint)*

**Answers:** What is T5, and why is it not part of the scored three-point trajectory?

**Logic:** Describe T5 as a categorically different instrument: after the T1→T3 trajectory completes, the agent is asked to review the resulting workspace and report architecture-consistency findings — explicitly forbidden from modifying files, running migrations, or creating commits. State directly that this produces no fourth or fifth trajectory point and is not evaluated by the rulepack; its value is as a complementary probe (does the agent's own self-assessment of architectural health agree with the harness's independent measurement?), reported separately from the main trajectory results, not blended into it.

**Figure/Table:** None — a single descriptive paragraph suffices; do not give it a table that would visually imply parity with T1–T3.

### 3.3.4 Deliberate Withholding of Internal Architectural Guidance from Task Specifications
*(existing content, keep as-is)*

**Answers:** Why are all task specifications written purely as product-manager tickets, with no internal architectural direction embedded in the functional requirements themselves?

**Logic:** Existing justification is sound (measuring an agent's *true*, unprompted architectural capability requires that the functional specification not leak the answer) — no change needed beyond removing the reference to "all sprints" if T5 is excluded per §3.3.3.

**Figure/Table:** None.

---

## 3.4 Rulepack

### 3.4.1 Measurement Layers
*(existing content, tighten cross-reference to §3.1.2 rather than re-explaining)*

**Answers:** What are the three measurement layers, and how do they differ in what they can express?

**Logic:** Keep the existing Constraints/Metrics/Judgments definitions and examples — they are accurate and well-written. Replace the current soft phrasing around Judgments ("retained for taxonomic completeness") with a one-line cross-reference to the explicit scope statement already made in §3.1.2, so the limitation is stated once, clearly, rather than hinted at twice.

**Figure/Table:** None (Table 3.0a in §3.1.2 already covers this).

### 3.4.2 Architectural Concerns
*(revised per the Table 3.2 rewrite already produced — see `chapter3-table3.2-revision.md`)*

**Answers:** What concerns are measured, how are they distributed across the three stack domains, and — for cross-stack specifically — why these three and not more?

**Logic:** State the corrected count (nineteen, not eighteen: 9 backend + 7 frontend + 3 cross-stack). List each domain's concerns by name. For cross-stack, add the pruning narrative: up to seven candidate dimensions were evaluated (naming consistency, method/status alignment, error-code alignment, and source-of-truth duplication were the four excluded); state the selection logic for the three retained (endpoint existence as the cheapest precondition; type/contract consistency as the deepest silent-failure signal; propagation completeness as the dimension most directly tied to the study's central "agent modifies one side, leaves the other stale" phenomenon) and the reason each excluded dimension was cut (subsumption by a retained dimension, or an expected hit-rate too low at this system's scale to support trend analysis).

**Figure/Table:** None additional — this section is prose; the enumeration itself is delivered in Table 3.2 (§3.4.5).

### 3.4.3 Metric Selection Principle
*(new subsection — the minimum-covering-set / complexity-over-volume principle)*

**Answers:** Where a concern admits more than one candidate metric, how was exactly one chosen as its representative?

**Logic:** State the governing principle directly: prefer the complexity/boundary-type candidate over the volume/count-type candidate wherever both exist, because volume/count metrics are both easier to satisfy through cosmetic restructuring and conflate legitimate growth with decay. Give one worked example (component line-average vs. JSX-depth-average — the latter retained) so the principle is demonstrated, not just asserted. Close by naming the two concerns (BE-TEST; CROSS-PROP's constraint side) where no clean complexity-type candidate exists at all, and stating that their retained metrics are disclosed as proxies rather than direct measurements — with a forward reference to §3.4.6.

**Figure/Table:** None.

### 3.4.4 Rule Nomenclature and Implementation
*(existing content, keep structure, add one paragraph on technical implementation)*

**Answers:** How is each rule identified, and what static-analysis machinery actually computes each constraint/metric value?

**Logic:** Keep the existing `<STACK>-<CONCERN>-<LAYER>-<ID>` nomenclature explanation. Add a short paragraph naming the concrete tooling: dependency-graph-based rules (BE-DEP, BE-DOM, CROSS-EP/TYPE/PROP) are computed from a dependency-cruiser-generated import graph; AST-based rules (BE-STRUCT, BE-CONTRACT, BE-ROUTE, BE-SIZE, FE-*) are computed by custom AST walkers over the TypeScript/JavaScript parse tree; BE-DUP uses token-normalised sliding-window clone detection. This paragraph currently does not exist anywhere in the draft and is needed for reproducibility.

**Figure/Table:** None.

### 3.4.5 The Concerns × Layers Matrix
*(Table 3.2 — already fully rewritten; this subsection is the delivery vehicle for it)*

**Answers:** For every one of the nineteen concerns, precisely what does the constraint check, what does the metric compute, and what literature grounds the choice?

**Logic:** One short lead-in sentence, then the table does the work. No further prose needed per row — keep per-row elaboration for §3.4.2's narrative (why cross-stack was pruned) and §3.4.3 (why this metric over the alternative), not duplicated here.

**Figure/Table:** *Table 3.2 (revised, 19 rows)* — Stack | Concern | Constraint | Metric | Grounding, exactly as drafted in `chapter3-table3.2-revision.md`.

Additionally: *Figure 3.B (new)* — **Concerns × Layers × Status Map**: a compact grid (rows = 19 concerns grouped by stack, one column each for Constraint / Metric) with each cell colour- or symbol-coded by implementation status — *implemented*, *proxy (not a direct measurement)*, *proposed but not yet implemented*. This turns the large table into a single glance-able risk map (it should visibly flag: BE-TEST's metric = proxy; CROSS-PROP's metric = proxy — note FE-DUP's metric is now implemented as `FE-DUP-M-001.mjs`, so it is no longer a proposed-not-implemented case) and is the most efficient way to carry the chapter's honesty about instrument maturity into a form a reader/examiner will actually register, rather than have to reconstruct by reading every row's prose.

### 3.4.6 Known Proxy Metrics and Their Limitations
*(new subsection)*

**Answers:** Which retained metrics do not directly measure their paired constraint, and what is lost as a result?

**Logic:** Name the two cases explicitly (BE-TEST's mock-per-test-case ratio; CROSS-PROP's propagation-incompleteness ratio, which additionally requires diff-driven rather than snapshot-driven computation — flag this a second time here since it has a real implementation-ordering consequence noted in §3.5.4). State in one sentence each what a false negative/positive would look like for each proxy. Close with a forward pointer: "this limitation is revisited in §6.x."

**Figure/Table:** None — this is a compact, two-paragraph disclosure section, not a table.

---

## 3.5 Experimental Setup

### 3.5.1 Controlled Variables
*(existing content — verify the two-agent claim is still current before keeping unchanged)*

**Answers:** What are the manipulated independent variables, and what is held constant?

**Logic:** No structural change identified against this study's prior work; keep as-is, but this subsection now *has* been cross-checked against the run artefacts (`session_*/session_manifest.yaml`) and must be corrected accordingly: the Codex agent ran **`gpt-5.3-codex`** (not "GPT-5.4"), the Claude agent ran **`claude-sonnet-4-6`** (Claude Sonnet 4.6, via the Claude Code CLI), and the real invocation control is **reasoning effort = high** for both (not temperature = 0) — subagents permitted, live web retrieval disabled, all account personalisation/custom agents disabled. Design is 4 conditions (2 agent × 2 strategy), one run each; note a second `codex/minimal` session (`session_20260817_210911`) has since been added toward replication, so Chapter 4 should report the actual completed count rather than the design-level "13".

**Figure/Table:** None.

### 3.5.2 Prompt Block Design
*(existing content and Table 3.3 — accurate as-is; add the missing justification paragraph)*

**Answers:** How is each task delivered to the agent as a structured document, and — critically — *why* are the API Contract block and the Architectural Guidance block bundled together as a single joint treatment rather than held constant across both prompt variants?

**Logic:** Keep the existing seven-block table description unchanged (it already correctly shows API Contract and Architectural Guidance both absent under Minimal and both present under Structured — this matches the actual instrument and needs no factual correction). Add the paragraph that is currently missing: the justification for *why* API-contract detail is not held constant the way Problem Statement and Requirements are. State the argument directly: interface/contract design is itself an architectural decision, not a neutral specification detail, so withholding it from the Minimal condition is treatment-consistent rather than a confound — the Minimal condition tests whether an agent can derive a coherent, correct interface autonomously, exactly as it must derive internal structure autonomously.

**Figure/Table:** *Table 3.3* stays as-is (already correct); no new table needed, only the added prose paragraph.

### 3.5.3 Data Capture and Trajectory Schema
*(new subsection)*

**Answers:** What does the harness actually output after evaluating one task iteration, and how does "trajectory" get represented as data rather than as a narrative concept?

**Logic:** Describe the evaluation artefact structure at the level of detail needed for a reader to understand Chapter 4/5 without guessing: each iteration produces a structured record separating constraint results, metric results (each carrying both a raw value and a delta), and (per §3.1.2) an empty judgments layer. Critically, define the two delta types the instrument actually computes and distinguish their use: a **run-local delta** (this iteration vs. the immediately preceding snapshot) and a **trajectory-cumulative delta** (this iteration vs. the original zero-violation baseline) — state explicitly which of the two is used for which class of analysis in Chapter 5, since conflating them would silently misrepresent the longitudinal claim. Close with the two known data-handling rules the study commits to here so they don't appear unexplained in Chapter 4: (a) violation counts are always read as net-of-baseline (trajectory-cumulative), never as raw totals, precisely because §3.2.3 established a verified-clean baseline rather than assuming one; (b) any metric that returns an error/unavailable status for a given iteration is recorded as a distinct missing-data category and excluded from that iteration's aggregate, never coerced to zero.

**Figure/Table:** *Table 3.4 (new)* — a compact schema reference: Field | Meaning | Used for. Rows: constraint status (pass/fail) | metric value | metric delta (run-local) | metric delta (trajectory-cumulative) | data-quality flag (ok/error/missing). This is a reference table, not a narrative figure — keep it small (5–6 rows) and place it immediately before §3.5.4's process figure so the reader has the vocabulary before watching the process that produces it.

### 3.5.4 Execution Protocol
*(existing content and Figure 3.1 — needs the figure's labels corrected)*

**Answers:** Step by step, what happens from the moment a condition starts to the moment its trajectory is complete?

**Logic:** Keep the existing four-step loop description (read task prompt → agent executes on current workspace → capture workspace snapshot → rulepack evaluation) and the no-reset framing — this is accurate and needs no rewording beyond the count correction below.

**Figure/Table:** *Figure 3.1 (revise existing figure, do not replace)* — same layout (Starter Codebase → Isolated Docker Sandbox loop → Sprint Chain box → Rulepack box), but: (a) the "Sprint Chain" side panel must list three tasks, not five, with short labels matching §3.3.2's actual content (e.g., "T1 · Greenfield module", "T2 · Relational remodel + migration", "T3 · State-machine invariant") in place of the current "T1 Generic … T5 Payoff" labels; (b) the caption's closing line must read "a three-point trajectory" rather than "five-point trajectory"; (c) remove any visual implication that T5 is a fifth loop iteration — if T5 is shown at all, it should sit visibly outside the loop as a separate terminal box, consistent with §3.3.3.

---

## 3.6 Threats to Validity
*(existing four-part structure — Wohlin et al. 2012 — is sound; only factual references inside it need correcting, no restructuring)*

**Answers:** What threatens the construct, internal, external, and conclusion validity of this design, and how is each mitigated or acknowledged?

**Logic:** Keep all four existing paragraphs (Construct / Internal / External / Conclusion Validity) essentially as written; they are already well-reasoned. Two corrections only: (1) "the eighteen concerns encoded here" → "the nineteen concerns encoded here"; (2) any residual "five iterations" / "five-sprint" phrasing → "three iterations" / "three-task". One addition: under Construct Validity, add one sentence explicitly naming the proxy-metric limitation from §3.4.6 (BE-TEST, CROSS-PROP) as a specific instance of the general point already being made there, so the two sections reinforce rather than silently duplicate each other.

**Figure/Table:** None.

## 3.7 Ethics and Summary

### 3.7.1 Ethical Considerations
*(existing content — no changes identified)*

**Answers:** What ethical review applies, given no human participants are involved?

**Logic:** Unchanged — the existing SDA-waiver narrative is complete and accurate as far as this review could determine.

**Figure/Table:** None.

### 3.7.2 Summary
*(existing content, update counts and add the scope-boundary reminder)*

**Answers:** How do the chapter's components fit together as a single apparatus, one paragraph before Chapter 4 begins?

**Logic:** Keep the existing closing-paragraph structure (starter codebase → task chain → rulepack → experimental setup → threats to validity), correcting "five-sprint chain" to "three-task chain." Add one closing sentence restating the §3.1.2 scope boundary (architectural integrity, not functional correctness) immediately before the transition into Chapter 4 — the last thing this chapter says should be the same boundary the first thing it said, so a reader who only reads openings and closings still cannot miss it.

**Figure/Table:** None.

---

## Full figure/table inventory for Chapter 3 (for the List of Figures / List of Tables)

| # | Location | New or revised | What it shows |
|---|---|---|---|
| Table 3.0a | §3.1.2 | New | Constraints/Metrics/Judgments — which layers are actually operationalised |
| Table 3.0b | §3.2.3 | New | Baseline verification: zero violations across all 19 concerns |
| Table 3.1 | §3.3.2 | Revised (5→3 rows) | T1–T3 task summaries, targeted concerns, design rationale |
| Figure 3.A | §3.3.2 | New | Task entanglement diagram: what T2 inherits from T1, what T3 inherits from T2 |
| Table 3.2 | §3.4.5 | Revised (18→19 rows, all formulas/citations corrected) | Full Concerns × Layers matrix |
| Figure 3.B | §3.4.5 | New | Concerns × Layers status map: implemented / proxy / proposed |
| Table 3.3 | §3.5.2 | Unchanged | Prompt block composition, Minimal vs. Structured |
| Table 3.4 | §3.5.3 | New | Evaluation data schema reference (constraint status, metric value/deltas, data-quality flag) |
| Figure 3.1 | §3.5.4 | Revised (labels only) | Experimental workflow: sandbox, task-chain loop, rulepack evaluation |

Nine visuals total for a ~3,000-word chapter is on the dense side — if trimming is needed for length, Table 3.0a and Table 3.0b are the two most mergeable into prose (both are short enough to state as a sentence each), while Figure 3.A, Figure 3.B, and the revised Figure 3.1 carry information that would be materially harder to follow as prose and should be kept.
