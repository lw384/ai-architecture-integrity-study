# Chapter 4–5 — Style Alignment to Zeng et al. (2025) / SWE-EVO (2026)

Companion to `writing-style-guide-reference-papers.md`. Chapters 4–5 already track the reference papers' style closely (numbers-first sentences, bolded takeaway leads, threat-then-mitigation limitations, graded hedging) — this file is scoped to the four remaining gaps the guide's checklist flagged: **RQ header labels (Rule 3), Findings-as-boxes (Rule 5), Table 4.2's missing walk-through (Rule 9), and sensitivity bounds on two headline ratios (Rule 10)**. All edits below are paste-ready against the current text of `chapter4-results-analysis.md` and `chapter5-discussion.md`.

---

## A. Retrofit RQ labels onto §4.x headers, retire "RO3/RO4"

**Precondition:** resolve the RQ/RO naming inconsistency first (see `chapter3-style-alignment.md` §A) — recommend **RQ1–RQ3** as the surviving scheme, matching `thesis-chapter-outline.md` §1.3. Once resolved, retitle section headers reference-paper style (Zeng et al. titles §4.1 as "RQ1: Effectiveness of Evaluation Framework"):

| Current header | Retitled |
|---|---|
| 4.5 Longitudinal Trajectories Across T1→T3 | **4.5 RQ1: Longitudinal Trajectories Across T1→T3** |
| 4.6 Silent Decay: Constraint–Metric Cross-Classification | **4.6 RQ2: Silent Decay — Constraint–Metric Cross-Classification** |
| 4.3 Effect of Prompt Strategy | **4.3 RQ3: Effect of Prompt Strategy** |

§4.1 (data quality), §4.2 (descriptive overview), §4.4 (agent differences), and §4.7 (secondary mechanisms) support all three RQs jointly or are prerequisite/exploratory rather than answering one RQ directly — leave their headers as-is, matching how Zeng et al. also leaves its dataset-validation subsection (§4.1) untitled by RQ while still numbering it before the RQ-titled sections.

**§4.9 fix:** replace every `(RO3)` / `(RO4)` citation with the matching `RQ` number:
- "Architectural integrity degraded in every condition, immediately and specifically (RO3)" → **(RQ1)**
- "Prompt structure produced no statistically defensible improvement (RO4)" → **(RQ3)**

Add one sentence for RQ2, currently un-tagged in §4.9's "silent-decay hypothesis returned a null" paragraph: append **"(RQ2)"** to that paragraph's first sentence, so all three RQs are explicitly closed in the summary, matching how both reference papers end their results chapter with one sentence per RQ.

---

## B. Promote bolded leads to numbered, boxed Findings (Rule 5 — highest-leverage change)

Convert the following bolded lead sentences into set-apart, numbered blocks using the project's existing blockquote convention (as already used for figure captions, e.g. `> **Figure 4.1 — ...**`). Number sequentially through the chapter; §4.9 and Chapter 5 then **cite by number** instead of restating the sentence.

**Finding 1 (insert at end of §4.1, replacing the current unboxed bolded clause):**
> **Finding 1 — Universal constraint-gate failure.** Every agent run, in every condition, at every task, failed the binary constraint gate. No trajectory reached even its first evaluation point with a clean architectural record.

**Finding 2 (insert at end of §4.2):**
> **Finding 2 — Violations concentrate, not diffuse.** Net-new violations concentrate in three rule-level causes — unified exception handling, duplication, and entity-change migrations — each dominated by a single named rule, rather than spreading evenly across the nineteen concerns.

**Finding 3 (insert at end of §4.3, replacing "The honest summary is that..." paragraph's closing sentence):**
> **Finding 3 — Prompt structure is directional, not protective.** Structured prompting reduces violations in five of six agent × task pairs (median −1.5 per task), but the effect is untestable at this sample size (smallest reachable p = 0.25 per agent) and did not prevent constraint failure in any run, Structured or Minimal.

**Finding 4 (insert at end of §4.4):**
> **Finding 4 — Agents differ in profile, not just volume.** Codex's violations are dominated by a single-rule monoculture (unified-exception omission, 62 findings across six evaluations, zero for Claude); Claude's are concentrated instead in layering and complexity drift that Codex never exhibits. Volume alone (Codex two- to four-fold above Claude) understates this difference.

**Finding 5 (insert at end of §4.5, replacing the three separately bolded sub-leads — merge into one box, reference-paper density):**
> **Finding 5 — Trajectory shape is task-driven, not uniformly accumulative.** Degradation tracks task structure: both agents' trajectories spike at T2 (the relational-remodel task designed to stress contract stability) rather than growing at a constant per-task rate. No condition shows the accelerating, convex decay Lehman's law predicts within this three-task horizon. Three of four conditions show net *negative* violation change at T3 — measurable, unprompted self-correction.

**Finding 6 (insert at end of §4.6):**
> **Finding 6 — Silent decay's precondition never occurred.** All twelve evaluations fall into the *constraints-failed* class; the *silent-decay* class (constraints pass, a metric decays) is empty because no run passed the constraint gate to begin with. The metric layer corroborated and graded constraint failures in this sample rather than detecting what constraints missed.

**Finding 7 (insert at end of §4.8's first bolded paragraph):**
> **Finding 7 — Self-reported completion overstates verified delivery.** All twelve runs self-reported success; of the four runs with an independent acceptance suite, three failed it while still reporting completion.

**Finding 8 (insert at end of §4.8's second bolded paragraph):**
> **Finding 8 — Speed and conformance trade off.** Codex completed tasks in roughly half Claude's wall-clock time while accumulating two to four times its violation count.

**§4.9 rewrite:** replace each summary paragraph's restated prose with a one-line pointer to the numbered Finding it summarises, e.g. "**The data are trustworthy** (Finding 1's zero-harness-error precondition; §4.1)." Chapter 5's §5.2 subsections should likewise open by citing the Finding number they interpret (e.g., §5.2.1 currently opens "The erosion literature describes..." — prepend "Finding 2 established that violations concentrate in three named rule failures rather than diffuse quality loss (§4.2). ..." before pivoting to the literature contrast), so the results→discussion link is traceable by number the way SWE-EVO's Conclusion boxes are cited back into its Discussion/Implications section.

---

## C. Fix Table 4.2's missing walk-through (Rule 9)

Current text: *"Table 4.2 shows this debt by category."* — followed immediately by the table, with the explanatory content relegated to a table footnote (*"Note: category means are computed over... The STATE row illustrates the purpose of the correction..."*).

**Fix:** move the STATE-row explanation out of the footnote and into a walk-through sentence after the table, matching how every other table in the chapter is handled (e.g., §4.3's Table 4.3 is followed by three full sentences of interpretation, not a footnote):

> Table 4.2 shows this debt by category. Category means are computed only over the evaluations in which that category appears. The STATE row illustrates why net-new accounting matters: its two baseline findings persist untouched through every trajectory, so the correction correctly attributes zero of them to any agent, whereas a raw-count reading would have credited agents with two violations they never introduced.

(Keep the shortened version as the table's footnote if the project's table-formatting convention requires one, but the full explanation must also appear as running prose per Rule 9 — footnotes are for the reader who skips ahead, not a substitute for the reference papers' habit of narrating every table's key cell in the main text.)

---

## D. Sensitivity bounds on two headline single-run ratios (Rule 10)

Both candidates are already reported as raw ratios computed from n=1-per-cell counts (Table 4.1) and are repeated as headline claims in §4.9 and §5.2.3/§5.2.6 without a stated bound on how much a single differently-classified violation would move them. Add one sentence each, following the §4.3 Wilcoxon-bound paragraph as the in-house template.

**§4.4, after "roughly a two- to four-fold gap depending on condition":**

> Because each cell is a single run, this ratio is sensitive to individual violation counts at the smaller end: at T3, Claude's cumulative net-new count is 8 in both conditions, so a difference of one violation in Claude's count alone would move the reported range from [19/8, 33/8] = [2.4×, 4.1×] to as wide as [19/9, 33/7] = [2.1×, 4.7×] — a swing driven almost entirely by Claude's smaller denominator, not by Codex's count. The direction and order of magnitude of the gap are robust to this; the second decimal place is not, and is not claimed.

**§4.8, after "roughly half Claude's wall-clock time":**

> As with the violation-count ratio above, this speed comparison rests on one run per condition and the Codex CLI's duration figures (9.5–15.5 minutes) versus Claude's (20–26 minutes) do not overlap even at their nearest endpoints, so the qualitative "roughly half" claim is robust to single-run noise in a way the violation-count ratio is not; no equivalent robustness claim is made for the *token/cost* comparison, which is simply unavailable for Codex (§4.8, Table 4.5 note) rather than noisy.

---

## Net effect

A–D add zero new numbers beyond what Table 4.1/4.2/4.3/4.5 already report (the §4.4/§4.8 sensitivity sentences are arithmetic on existing table values, not new measurements) and reformat eight existing claims into the reference papers' call-out-box convention. Apply after any remaining factual corrections to Chapter 4/5 are settled, since B's Finding-box text is quoted verbatim from the current draft's sentences and will need re-quoting if those sentences change.
