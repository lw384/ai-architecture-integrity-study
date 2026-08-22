# Chapter 3 — Run-Reality Change-Log (for the Word draft)

**Purpose.** Every edit needed to bring the current Chapter 3 draft (`5712857-0804.pdf` export) into line with (a) how the experiment *actually ran*, verified against the harness source, rulepack files, and the real run artifacts under `reports/experiments/session_*/`, and (b) the internal logical gaps that a reader would trip over. Ordered by the draft's own section numbering so you can edit top-to-bottom in Word.

> ⚠️ **DEPRECATED — §3.1.2 Scope Boundary content below is superseded.** This file's §3.1.2 paste-ready paragraph and its Table 3.0a use the old, incorrect framing ("measures architectural integrity, **not** functional correctness"). That framing is wrong: functional behaviour *is* verified at a coarse pass/fail gate; only the graded **Judgments** layer is unimplemented. Use the corrected §3.1 rewrite and Table 3.1 in **`chapter3-section3.1-rewrite.md`** instead. All *other* entries in this change-log (task count, concern count, model identity, tooling, figure/table fixes) remain valid.

**Two edit types are marked:**
- **[FIX]** — a factual error or internal contradiction; swap the exact text.
- **[GAP]** — a missing paragraph/table the outline already calls for; paste-ready prose is given where it is short.

**Ground-truth sources for every claim below** (so you can re-verify): rule files under `harness/rulepacks/{ts-nestjs-backend,js-react-frontend,cross}/rules/`; metric implementations under `harness/adapters/computed-metrics/implementations/`; `harness/core/contracts/*.schema.json`; session manifests `reports/experiments/session_*/session_manifest.yaml`; `reports/analysis/README.md`; and the harness output schema keys observed in a real `harness_evaluation.json`.

---

## The three global errors that recur across the chapter

Before the section-by-section list, three mistakes appear in *multiple* places and must be fixed everywhere they occur — the section list flags each occurrence, but fix them as a set:

| # | Wrong (draft) | Correct (actual run) | Why |
|---|---|---|---|
| G1 | **Five sprints** (T1–T5, loop `k=1…5`, "five-point trajectory") | **Three scored tasks (T1→T3)** + a **T5 post-hoc self-review** that modifies no code and is not rulepack-scored. **T4 does not exist.** | Every `session_*/` contains `T1 T2 T3 T5` only; baseline + 4×3 = **13 harness evaluations** (`reports/analysis/README.md`). §3.1.1 already says "three" — the rest of the chapter contradicts it. |
| G2 | **"eighteen concerns" / "Backend 8 dimensions" / "20 architectural concerns"** (three different numbers appear) | **Nineteen concerns = 9 backend + 7 frontend + 3 cross-stack** | Rule files: 9 BE concern dirs (structure, dependencies, domain, error, contracts, routes, size, duplication, test), 7 FE (components, states, routes, styles, data, communication, duplication), 3 CROSS (EP, TYPE, PROP). |
| G3 | **"GPT-5.4" · "temperature = 0"** | **GPT-5.3 (`gpt-5.3-codex`, via Codex CLI)** and **Claude Sonnet 4.6 (`claude-sonnet-4-6`, via Claude Code CLI)**; the real control is **reasoning effort = high**, not temperature | Session manifests record `model: gpt-5.3-codex` and `model: claude-sonnet-4-6`. Chapter 4's own working notes state effort = high for both, subagents allowed, no live web retrieval, no user customization. The CLIs do not expose a `temperature=0` knob. |

---

## §3.1.1 Three Coupled Components Overview

**[FIX] Frontend stack contradiction.** Point 1 says the starter codebase comprises "a React/**TypeScript** frontend." §3.2 (correctly) says "the frontend uses plain **JavaScript**." The rulepack is `js-react-frontend`; JavaScript is correct.
- Old: `a NestJS/TypeScript backend and a React/TypeScript frontend`
- New: `a NestJS/TypeScript backend and a React/JavaScript frontend`

**[FIX] Layer-count wording.** Point 3 says the rulepack "organises 19 architectural concerns across **two** measurement layers," but §3.4.1 defines **three** analytical roles (Constraints, Metrics, Judgments), two of them operationalised. Reconcile so the two sentences agree.
- Old: `The rulepack organises 19 architectural concerns across two measurement layers.`
- New: `The rulepack organises nineteen architectural concerns across three measurement layers, two of which — Constraints and Metrics — are operationalised in this study (Judgments is defined but not implemented; see §3.1.2 and §3.4.1).`
- (The "19" here is already right — keep it; the error is downstream in §3.4.2, not here.)

**[FIX] Table 3.1 caption is wrong.** The table under §3.1.1 shows the two-row *measurement-layers* table (Constraints / Metrics), but its caption reads "Summary of Specific Tasks and Targeted Architectural Concerns Across Sprints" — which is actually Table 3.2's subject, and Table 3.2 carries the *same* caption. Re-caption Table 3.1.
- Old caption: `Table 3.1 Summary of Specific Tasks and Targeted Architectural Concerns Across Sprints`
- New caption: `Table 3.1 The Two Operationalised Measurement Layers`
- Also add the missing Judgments row **or** a footnote so the table matches §3.4.1's three-role definition; simplest is a footnote: `Judgments (interpretive layer) is defined in §3.4.1 but not operationalised in this study.`

---

## §3.1.2 Scope Boundary  ⚠️ DEPRECATED — use `chapter3-section3.1-rewrite.md`

> **Do not use the paragraph or Table 3.0a below.** Their framing ("architecture, *not* functional correctness") is incorrect — functional behaviour is verified at a coarse pass/fail gate; only the graded Judgments layer is unimplemented. Also note the structure decision changed: §3.1 is now a **flat** section (no 3.1.1/3.1.2), with the scope boundary as its closing paragraph. The corrected, paste-ready version lives in `chapter3-section3.1-rewrite.md` (§3.1 rewrite + Table 3.1). The text below is retained only as a record of the superseded version.

**[GAP] This subsection is an empty heading** — it jumps straight from `3.1.2 Scope Boundary` to `3.2 Starter Codebase` with no body. This is the single most important logical gap in the chapter: the scope decision (architecture, *not* functional correctness) is currently never stated up front. Paste-ready body:

> This study measures **architectural integrity** — whether the layered client–server structure, its contracts, and its cross-stack consistency survive iterative agent modification. It deliberately does **not** measure functional correctness. The evaluation instrument is designed as three layers (Constraints, Metrics, Judgments; §3.4.1), but only the first two are operationalised here. The Judgments layer — which would grade whether an agent's output satisfies each task's acceptance criteria — was designed as part of the instrument but not implemented, owing to time constraints rather than any methodological objection. Where Chapter 4 reports functional and efficiency outcomes, it does so from the Delivery & Verification Protocol's test-suite pass/fail signal (captured per task as `test_result.json`), not from a graded Judgments layer.

**[GAP] Add Table 3.0a** (3 rows) so the scope boundary is impossible to miss:

| Layer | What it measures | Operationalised in this study? |
|---|---|---|
| Constraints | Binary, mechanically decidable violations | Yes |
| Metrics | Continuous drift signals (ratios/densities) | Yes |
| Judgments | Interpretive quality (business-boundary fit, test intent) | No — see §7 Limitations |

---

## §3.2 Starter Codebase

**[FIX] Keep "plain JavaScript" (this paragraph is correct)** — the fix is in §3.1.1, above. No change to §3.2's tech-stack paragraph beyond confirming it now agrees with §3.1.1.

**[GAP] Baseline-verification evidence (optional but recommended).** §3.2.3 asserts the codebase is "strictly verified against the rulepack … zero constraint violations." Name the artifact so the claim is a measured fact, not an assertion: add one sentence —
> The starter codebase is run through the full rulepack before any condition begins, and the result is archived as `reports/baseline/harness_evaluation.json`, the reference zero-violation baseline against which every subsequent trajectory delta is computed.

---

## §3.3 Sprint Chain Design  ← heaviest edits (G1)

**[FIX] Three principles paragraph names five phases.** Line: "First, the **five sprints** advance through phases … initial entity introduction, schema restructuring, business-rule constraining, **sustained multi-task delivery, and retrospective consolidation**." The last two phases (T4, T5-as-code) are not part of the scored run.
- Old: `First, the five sprints advance through phases characteristic of evolving business systems: initial entity introduction, schema restructuring, business-rule constraining, sustained multi-task delivery, and retrospective consolidation.`
- New: `First, the three tasks advance through phases characteristic of evolving business systems: initial entity introduction (T1), schema restructuring with data migration (T2), and business-rule constraining via a state-machine invariant (T3).`

**[FIX] "the five sprints collectively exercise the … rulepack".**
- Old: `to meet the complex evaluation demands of end-to-end tasks, the five sprints collectively exercise the architectural constraints encoded in the predefined rulepack`
- New: `to meet the complex evaluation demands of end-to-end tasks, the three tasks collectively exercise the architectural constraints encoded in the predefined rulepack`

**[FIX] "all sprints are specified as product-manager tickets".** Wording is fine, but if T5 is now described separately (below), scope it: "all three task specifications are specified as product-manager tickets."

**[FIX] Table 3.2 — remove T4, relocate T5, correct concern IDs, fix the "Sources" column.**
- **Delete the T4 row entirely** (composite five-ticket sprint — not run).
- **Move T5 out of this table** into a new descriptive subsection §3.3.3 (below). Do not leave it as a fifth row implying parity with the scored tasks.
- **Correct the concern IDs** to the shipped vocabulary (retired IDs on the left):
  - `BE-LAYER` → **`BE-DEP`**
  - `BE-FUNC` → **`BE-SIZE`**
  - `CROSS-ENDPOINT` → **`CROSS-EP`**, `CROSS-CONTRACT` → **`CROSS-TYPE`**, `CROSS-CHANGE` → **`CROSS-PROP`**
  - T1 targeted concerns (suggested): `BE-STRUCT, BE-DEP, BE-CONTRACT, BE-ROUTE, CROSS-EP, CROSS-TYPE`
  - T2: `BE-CONTRACT, BE-DOM, BE-DUP, CROSS-TYPE, CROSS-PROP`
  - T3: `BE-DOM, BE-ERR, BE-DUP, CROSS-PROP`
- **Replace the empty "Sources" column** (it has no defined meaning) with a **"Design Rationale"** one-liner per row pointing into the prose (see next item), or drop the column.
- **Re-caption** so Table 3.1 and 3.2 no longer share a caption: `Table 3.2 Task Specifications and Targeted Architectural Concerns (T1–T3)`.

**[GAP] Per-task design rationale is missing.** The draft lists concern IDs per task but never says *why* each task stresses those concerns. Add one clause per task, e.g. for T2:
> T2 requires touching an existing resource from two directions at once (Contact and Deal both gain link-management logic), the exact condition under which duplication (`BE-DUP`, copy-pasted attach/detach logic) and one-sided change propagation (`CROSS-PROP`, one relationship side updated, its counterpart left stale) are expected to concentrate.

**[GAP] Task-entanglement statement.** State explicitly that the three tasks accumulate rather than being independent: "T2 remodels the relationships T1 created; T3's `active`-transition precondition (≥1 linked Contact) depends directly on the many-to-many concept T2 introduced." (Optional Figure 3.A in the outline; a sentence suffices if you are trimming figures.)

**[GAP] New §3.3.3 — T5 Post-Hoc Architectural Self-Review.** Paste-ready:
> After the T1→T3 trajectory completes, the agent is asked to review the resulting workspace and report architecture-consistency findings, explicitly forbidden from modifying files, running migrations, or creating commits. T5 is therefore categorically different from T1–T3: it produces no fourth trajectory point and is not scored by the rulepack. Its findings (archived per session as `T5/review.md`, parsed into `review_findings.csv`) are used only as a complementary probe — whether the agent's own assessment of architectural health agrees with the harness's independent measurement — and are reported separately from the main trajectory, never blended into it.

---

## §3.4 Rulepack

### §3.4.2 Architectural Concerns  ← (G2)

**[FIX] Count and backend dimension list.**
- Old: `these eighteen concerns are systematically partitioned` → New: `these nineteen concerns are systematically partitioned`
- Old: `Backend Concerns (8 dimensions): Structural integrity, dependency direction, domain boundaries, transaction and error handling, data-contract stability, routing conventions, function complexity, and code duplication.`
- New: `Backend Concerns (9 dimensions): structural integrity, dependency direction, domain boundaries, transaction and error handling, data-contract stability, routing conventions, unit complexity, resource/policy duplication, and test-construction discipline.`
- (The missing 9th backend concern is **BE-TEST** / test-construction discipline — the rule files `BE-TEST-C-001` + `BE-TEST-M-001` — absent from the draft's list entirely.)
- Frontend (7) and Cross-stack (3) counts are already correct; only the cross-stack IDs need the EP/TYPE/PROP naming when Table 3.3 is updated.

**[GAP] Cross-stack pruning rationale.** The draft states three cross-stack concerns but never explains why *three*. Paste the pruning narrative already drafted in `chapter3-table3.2-revision.md` §3.4.2 (seven candidates → three retained; the four excluded — method/status alignment, naming consistency, error-code alignment, source-of-truth duplication — with the reason each was cut).

**[GAP] New §3.4.2a — Metric Selection Principle** (minimum covering set; complexity-over-volume). Full paste-ready text already exists in `chapter3-table3.2-revision.md` §3.4.2a — insert it immediately before Table 3.3.

### §3.4.3 Rule Nomenclature and Implementation

**[GAP] Static-analysis tooling paragraph is missing** (needed for reproducibility). Add:
> Dependency-graph rules (`BE-DEP`, `BE-DOM`, `CROSS-EP/TYPE/PROP`) are computed from a dependency-cruiser import graph, with cycles detected via Tarjan's strongly-connected-components algorithm; AST-based rules (`BE-STRUCT`, `BE-CONTRACT`, `BE-ROUTE`, `BE-SIZE`, and the `FE-*` family) are computed by custom AST walkers over the TypeScript/JavaScript parse tree; `BE-DUP` and `FE-DUP` use token-normalised sliding-window clone detection. Test-related signals additionally draw on the Vitest and ESLint adapters.

### Table 3.3 — The Concerns × Layers Matrix  ← full replacement

**[FIX] Replace the entire table** with the corrected 19-row version already in `chapter3-table3.2-revision.md` (all formulas and IDs verified against the shipped rules). Specific corrections the current draft's table needs:
- Add a **BE-TEST row** (constraint: services obtain repositories via DI, tests must not call `new Repository(...)`; metric: mock-per-test-case ratio — a **proxy**).
- `BE-LAYER` → `BE-DEP`; metric = dependency-violation density with Tarjan-based cycle detection.
- `BE-FUNC` → `BE-SIZE`; metric = **cyclomatic-complexity ratio** (V(G)), *not* parameter-count percentage (`BE-SIZE-M-001-cyclomatic-complexity-ratio.mjs`).
- `BE-DUP`: constraint reframed from a line-count threshold to **single-owner / single-authoritative-implementation**; metric = token-normalised clone ratio.
- `BE-ROUTE` metric = violating-endpoint **ratio**, not a raw count.
- `CROSS-ENDPOINT` → `CROSS-EP`; `CROSS-CONTRACT` → `CROSS-TYPE`; `CROSS-CHANGE` → `CROSS-PROP`.
- `CROSS-PROP` metric is **diff-driven** (needs before/after, not a single snapshot) — flag it in the row.
- `FE-INTER` → `FE-COMM`; `FE-REUSE` → `FE-DUP`.
- **FE-DUP metric is now implemented** (`FE-DUP-M-001.mjs` exists) — if `chapter3-table3.2-revision.md` still says "proposed, not yet implemented" for this row, that note is stale; the synced revision doc removes it.

**[GAP] Note on the two proxy metrics.** In the table or a following sentence, mark **BE-TEST** (mock-per-test-case) and **CROSS-PROP** (propagation-incompleteness) as proxies — they correlate with, but do not directly observe, their paired constraint. Cross-reference §7 Limitations.

---

## §3.5 Experimental Setup

### §3.5.1 Controlled Variables  ← (G3)

**[FIX] Model identity.**
- Old: `Claude Sonnet 4.6 (accessed through the Claude Code CLI) and GPT-5.4 (accessed through the Codex CLI)`
- New: `Claude Sonnet 4.6 (model `claude-sonnet-4-6`, accessed through the Claude Code CLI) and GPT-5.3 (model `gpt-5.3-codex`, accessed through the Codex CLI)`

**[GAP] Agent-configuration controls are missing.** The draft claims models are pinned but never states the invocation controls actually used. Add:
> To make the two CLIs as comparable as their differing parameterisations allow, both agents were configured with reasoning **effort set to high**; sub-agent invocation was permitted (to handle the full-stack scope); live web retrieval was disabled; and all account-level personalisation and custom agents were disabled to prevent user-profile preferences from biasing behaviour. Both agents ran autonomously in an isolated Docker sandbox with no human review during execution. The exact CLI invocation commands are listed in Appendix [X].

### §3.5.2 Prompt Design

**[GAP] Joint-IV justification is missing.** Table 3.4 correctly shows API Contract *and* Architectural Guidance both absent under Minimal, both present under Structural — i.e. the two blocks move together as one treatment. The draft never justifies why API-contract detail is not held constant. Add:
> Interface and contract design is itself an architectural decision, not a neutral specification detail. Withholding the API Contract block from the Minimal condition is therefore treatment-consistent rather than a confound: the Minimal condition tests whether an agent can derive a coherent, correct interface autonomously, exactly as it must derive internal structure autonomously.

### §3.5.3 Execution Protocol  ← (G1) + [GAP]

**[FIX] Figure 3.1 labels** (the figure currently encodes the old five-sprint design):
- `loop k = 1 … 5` → `loop k = 1 … 3`
- `workspace persists across all five sprints` → `workspace persists across all three tasks`
- `After T₅ · 5-point erosion trajectory` → `After T₃ · 3-point erosion trajectory`
- Sprint-chain side panel `T1 Genesis … T5 Payoff` → three labels: `T1 · Greenfield entity module`, `T2 · Relational remodel + migration`, `T3 · State-machine invariant`. If T5 is shown at all, place it **outside** the loop as a separate terminal "self-review" box (consistent with new §3.3.3).
- Rulepack box `20 architectural concerns` → `19 architectural concerns`
- Model caption `Claude Sonnet 4.6 or GPT-5.4 · temperature = 0` → `Claude Sonnet 4.6 or GPT-5.3 · reasoning effort = high`

**[FIX] Figure 3.1 caption prose** (the paragraph after the figure):
- Old: `The sprint chain then drives a five-iteration loop … Each of the four conditions is executed once, yielding four independent five-point trajectories.`
- New: `The task chain then drives a three-iteration loop … Each of the four conditions is executed once, yielding four independent three-point trajectories.` *(See replication note below — the design is one run per condition; a second `codex/minimal` session has since been added toward replication.)*

**[GAP] New subsection — Data Capture and Trajectory Schema.** The draft never describes what the harness outputs. Ground it in the real `harness_evaluation.json`:
> Each task iteration produces a structured evaluation record with three layers (constraints, metrics, and an empty judgments layer, per §3.1.2). Metric results carry both a raw value and a delta, and the harness computes **two** delta types that must not be conflated: a **run-local delta** (`deltas.run_local` — this iteration versus the immediately preceding snapshot) and a **trajectory-cumulative delta** (`deltas.trajectory_cumulative` — this iteration versus the original zero-violation baseline). Chapter 5's longitudinal claims are read from the trajectory-cumulative delta; per-task incremental effects from the run-local delta. Two data-handling rules follow: (a) violation counts are always read net-of-baseline, never as raw totals, because §3.2.3 established a verified-clean baseline; (b) each record also carries an `execution_status` (e.g. `complete` / `partial`) and per-metric status, so a metric that returns an error is recorded as a distinct missing-data category and excluded from that iteration's aggregate, never coerced to zero.

---

## §3.6 Threats to Validity

**[FIX] Concern count.** Old: `the eighteen concerns encoded here` → New: `the nineteen concerns encoded here`.

**[FIX] Iteration count** (two places). `beyond five iterations` and any `five-sprint` phrasing → `beyond three iterations` / `three-task`.

**[GAP] Add two acknowledged instrument-maturity threats** under Construct Validity (both are true of the shipped harness):
> Two retained metrics are proxies rather than direct measurements — `BE-TEST`'s mock-per-test-case ratio and `CROSS-PROP`'s propagation-incompleteness ratio (§3.4.3) — and are reported as such. In addition, the cross-stack rulepack ships at `migration_status: experimental` (`harness/rulepacks/cross/manifest.yaml`); its three concerns are treated as directional signals pending further validation.

---

## §3.7 Ethics and Summary

### §3.7.1 Ethical Considerations

**[FIX] Access-channel contradiction.** Says agent invocations were "made through the **Claude API** and the Codex CLI," but §3.5.1 says the Claude agent was accessed through the **Claude Code CLI**. Make consistent.
- Old: `Agent invocations were made through the Claude API and the Codex CLI in compliance with …`
- New: `Agent invocations were made through the Claude Code CLI and the Codex CLI in compliance with …`

### §3.7.2 Summary  ← (G1)

**[FIX] Sprint count.**
- Old: `executing four conditions once through the five-sprint chain`
- New: `executing four conditions once through the three-task chain (T1→T3), plus a non-scored T5 self-review per condition`

**[GAP] Close on the scope boundary.** Add one closing sentence mirroring §3.1.2, so the last thing the chapter says is the same boundary the first thing said:
> As established at the outset (§3.1.2), this apparatus measures architectural integrity, not functional correctness — a boundary carried forward into the interpretation of the results in Chapters 4–5.

---

## Data-count reconciliation (affects the numbers you cite)

- **Design:** 2 agents × 2 prompt strategies = **4 conditions**; each runs **T1→T3** (no reset) **+ T5 self-review**. With the baseline evaluated once: **1 + 4×3 = 13 scored harness evaluations**.
- **Current data is in flux** (do not hard-code a session count that Chapter 4 will contradict): `reports/experiments/` now holds **five** session directories — the fourth condition set plus a **second `codex/minimal` session** (`session_20260817_210911`), i.e. replication of one condition has begun. `reports/analysis/README.md` still describes the pre-replication state ("13 evaluations across 4 sessions"). State the *design* (4 conditions) in Chapter 3 and let Chapter 4 report the actual completed count and any replication.

---

## Items to carry into other chapters (flagged, not fixed here)

1. **§6 Limitations** must pick up the two proxy metrics and the experimental cross-rulepack status (already cross-referenced from §3.4.3 / §3.6 above).
2. **Appendix** must contain the exact CLI invocation commands referenced by the new §3.5.1 paragraph.
3. **Chapter 4** should report the actual completed evaluation count and the replication status, not the design-level "13".
