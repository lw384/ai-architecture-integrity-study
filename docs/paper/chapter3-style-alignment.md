# Chapter 3 — Style Alignment to Zeng et al. (2025) / SWE-EVO (2026)

Companion to `writing-style-guide-reference-papers.md`. Scoped to the four rules flagged "action needed" for Chapter 3 in that guide's checklist (#3 RQ mapping, #6 numbered Stages, #9 table lead-ins, #11 scope restraint). Does not repeat `chapter3-writing-guidance.md` (style/logic/terminology fixes) or `chapter3-table3.2-revision.md` / `chapter3-section3.1-rewrite.md` (factual/table content, already paste-ready) — this file only reformats material those two already establish into the reference papers' visible structure.

---

## A. §3.1.1 — name the RQ each component closes (Rule 3)

`chapter3-section3.1-rewrite.md`'s paste-ready §3.1 already maps each of the three gaps to one component in prose. The reference papers go one step further: they tie construction decisions back to **named research questions**, not just to literature gaps, so a reader can trace "why does the apparatus look like this" all the way to "which RQ does this let me answer."

Add one clause to the existing paste-ready paragraph (insertion marked `⟵ADD`):

> A bespoke starter codebase, verified free of violations before the experiment (§3.2), removes the confound of inherited technical debt, so that any deviation observed downstream can be attributed to the agent rather than to pre-existing flaws — the precondition for answering **RQ1** (does architectural integrity degrade under iterative agent modification?) without ambiguity about its origin. ⟵ADD A cumulative task chain, executed without resetting the workspace between tasks (§3.3), generates genuine forward evolution... — the structure RQ1 and **RQ2** (do binary constraints and continuous metrics diverge?) both require, since neither question is answerable from isolated, single-shot tasks. ⟵ADD A multi-dimensional rulepack calibrated for the JavaScript/TypeScript stack (§3.4) measures architectural conformance through signals a functional test suite cannot observe, which is what makes RQ2 askable in the first place, and the two-condition prompt design layered on top of this apparatus (§3.5) is what makes **RQ3** (does explicit architectural guidance change the trajectory?) a controlled comparison rather than an anecdote. ⟵ADD

**Terminology fix required before this can be added:** `chapter4-results-analysis.md` currently cites findings against **RO3/RO4**, a scheme not defined anywhere in the reviewed files, while `thesis-chapter-outline.md` §1.3 defines **RQ1–RQ3**. Resolve this in Chapter 1 first (recommend keeping RQ1–RQ3, since it is the scheme the reference papers' convention matches and the one already stated first in the thesis), then this addition and the corresponding Chapter 4 header retrofit (see `chapter4-5-style-alignment.md` §A) become consistent with each other.

---

## B. §3.4.2 — convert the cross-stack pruning narrative into a numbered Stage list (Rule 6)

`chapter3-table3.2-revision.md`'s revised §3.4.2 already contains the right content (seven candidates evaluated → four excluded, each with a named reason → three retained, each with a named reason) but delivers it as one dense paragraph. Zeng et al. §3.1.1 delivers structurally identical content (candidates → filter → retained set, each stage naming its criterion) as a numbered list. Retrofit:

> The cross-stack rulepack was constructed in three stages.
>
> 1. **Candidate identification.** Up to seven candidate dimensions were considered for cross-stack coverage: the three retained below, plus canonical resource naming, HTTP method/status alignment, frontend-handled error-code alignment, and cross-contract source-of-truth duplication.
> 2. **Exclusion.** Four candidates were cut. Method/status alignment was judged substantially subsumed by the endpoint-existence and type-consistency checks; naming consistency and source-of-truth duplication were judged subsumed by propagation completeness; error-code alignment was excluded because it fires only when the frontend explicitly handles a specific business error code, giving it an expected hit-rate too low at this system's scale to support trend analysis.
> 3. **Retention.** Three dimensions were retained, each selected for a distinct role rather than for redundancy with the other two: endpoint existence is the cheapest precondition check (nothing else is evaluable if the call site does not resolve); request/type contract consistency is the deepest silent-failure signal (field-level drift neither stack alone can detect); change-propagation completeness is the dimension most directly tied to this study's central phenomenon of interest — an agent modifying one side of an existing contract while leaving its counterpart surface stale.

This is a reformatting-only change — no fact, count, or rule ID differs from the existing revision. Apply the same three-stage template to §3.2's "why a bespoke codebase, not an existing repository" argument if it is expanded beyond its current two sentences (Stage 1: candidate open-source repositories considered; Stage 2: exclusion criterion — pre-existing technical debt confounds attribution; Stage 3: retained approach — bespoke, verified-clean codebase); at its current length a numbered list would be over-formatting one paragraph, so only do this if that subsection grows.

---

## C. Table lead-ins and walk-throughs (Rule 9)

`chapter3-methodology-outline.md` specifies four new/revised tables (3.0a, 3.0b, 3.1, 3.2) and two new figures (3.A, 3.B) but its "Logic" field does not consistently require a lead-in sentence stating *what question the table answers* before the table, nor a walk-through sentence after it (the reference papers never let a table stand alone — see guide Rule 9). Add this requirement explicitly to each entry when drafting the actual prose:

| Table | Required lead-in (paste-ready) | Required walk-through after |
|---|---|---|
| 3.0a (Layers × Operationalised) | "Table 3.0a records which of the instrument's three measurement layers this study operationalises." | One sentence naming the Judgments row specifically as the scope boundary already stated in prose — do not let the table carry that claim alone. |
| 3.0b (Baseline Verification) | "Table 3.0b reports the starter codebase's verification result against the full rulepack, establishing the zero-violation baseline referenced throughout Chapters 4–5." | One sentence confirming all rows show a clean pass — do not leave the table to imply this by omission. |
| 3.1 (Task Entanglement / T1–T3 summary) | "Table 3.1 gives, for each of the three tasks, the concerns it targets and the design rationale for why that task is expected to stress them." | Point to one concrete cell as illustration (e.g., "T2's BE-DUP/CROSS-PROP pairing, discussed in §3.3.2, is the clearest case"), matching how the reference papers always cash out at least one specific cell rather than leaving the table to speak for the whole. |
| 3.2 (Concerns × Layers matrix, 19 rows) | Already specified in the outline ("Table 3.2 gives, for each of the nineteen concerns...") — keep as-is, it already matches the rule. | None required — the outline correctly defers per-row elaboration to §3.4.2/§3.4.3, matching how Zeng et al. Table 1 is not walked-through row-by-row either (only the aggregate pattern is narrated). |

---

## D. Scope-restraint phrasing for §3.1.2 (Rule 11)

Reuse the phrasing already validated as correct in Chapter 5 (guide Rule 11) rather than composing new scope language for §3.1.2. `chapter3-section3.1-rewrite.md`'s existing scope paragraph is close but can be tightened to match the "deliberate trade-off with a named cost" register exactly:

- Current: *"The Judgments layer... is designed into the instrument and present in its data schema, but is not implemented here; its operationalisation is left to future work."*
- Aligned addition (append one clause): *"...is not implemented here — a deliberate scope decision made to keep the instrument's two operationalised layers (Constraints, Metrics) rigorously verified within the available time, rather than adding a third, less-validated layer; its operationalisation is left to future work (§[7/8])."* This mirrors SWE-EVO's Limitations §6 move of stating a trade-off's cost by name ("we deliberately prioritize... but the current size still limits...") instead of a bare "not implemented" statement.

---

## Net effect

None of A–D changes a fact, a count, or a rule ID already fixed by the two prior revision passes. They are purely structural/presentational retrofits — numbered stages, lead-in sentences, RQ tags, and one phrasing tighten — that make Chapter 3 visually and rhetorically match the two reference papers' construction-and-scope sections. Apply after the factual content in `chapter3-table3.2-revision.md` and `chapter3-section3.1-rewrite.md` is pasted in, not before, since B and C above quote that content directly.
