# Chapters 4–5 — Results & Analysis: Full Section-by-Section Outline

Same format as the Chapter 3 outline: for every subsection — **title → question(s) it answers → logic/order → figure/table needed and what it must show**.

## A structural decision this outline makes, stated up front

The current draft's Chapter 4 skeleton already contains genuinely comparative/interpretive content (§4.3 Effect of Prompt Strategy, §4.4 Differences Between Coding Agents) sitting inside a chapter titled "Results," while Chapter 5 ("Analysis") is still an empty template with no real headings. That is a real boundary problem, not just an incomplete draft: as written, "Results" already does half of "Analysis"'s job, leaving Chapter 5 with nothing specific to be *for*.

This outline draws the boundary the way the two chapter titles imply it should be drawn, and moves content across the current draft's chapter boundary accordingly:

- **Chapter 4 (Results) reports what was measured** — data completeness, descriptive violation counts, raw trajectory values, efficiency numbers. No hypothesis testing, no comparison-with-interpretation, no claims about *why*.
- **Chapter 5 (Analysis) answers the research questions** — prompt-strategy comparison, agent comparison, longitudinal trajectory shape, and the chapter's centrepiece: the Silent Decay divergence between constraints and metrics. This maps directly onto Stages 2–4 of the five-stage analysis framework already specified in `docs/methodology/analysis.md`; Chapter 5 is, in effect, that framework's write-up.

This means §4.2–4.4 as currently drafted (Evolution of Architectural Integrity, Effect of Prompt Strategy, Differences Between Coding Agents) are **not** kept in Chapter 4 under those questions — the underlying data collection stays in Ch4, but the comparison/interpretation questions attached to them move to Ch5. If you would rather keep everything in one chapter and drop the Ch4/Ch5 split entirely, say so and this can be re-flattened into a single "Results and Analysis" chapter with the same subsection content, just renumbered.

---

# Chapter 4 — Results

*(target ≈2,400 words per the current draft's own budget line; this is tight once §4.4 is added — see the word-budget note at the end)*

## 4.1 Experimental Runs
*(existing question skeleton — keep, tighten)*

**Answers:** What data actually exists to analyse, and is it trustworthy before any claim is built on it?

**Logic:** Answer the five existing questions in this fixed order, because each depends on the previous one being settled first: (1) how many conditions/trajectories were run (2 agents × 2 prompt strategies = 4 conditions, per §3.5.1) → (2) how many task-level observations resulted (baseline + 4 conditions × 3 tasks = 13, matching the arithmetic already in the draft) → (3) did every agent complete every task (a binary completion check, cheap and load-bearing — an incomplete cell changes every downstream denominator) → (4) were any results affected by harness errors (per the §3.5.3 commitment: error-status metrics are a distinct category, never coerced to zero — report the count here, don't just apply the rule silently) → (5) which results were actually carried into analysis as a result of (2)–(4). This ordering exists so that every subsequent chapter section can cite "§4.1's N=13, of which M were clean" as a fixed reference point instead of re-litigating completeness per section.

**Figure/Table:** *Table 4.1 — Experimental Run Inventory.* Rows = the 13 task-level observations (baseline + 4 conditions × T1–T3); columns = Condition | Task | Completion status | Harness errors (count, by metric) | Included in analysis (Y/N). This table is the single source of truth every later table/figure's sample size should trace back to.

## 4.2 Descriptive Overview of Architectural Violations
*(new — this is the clean, non-comparative home for what §4.2's old "Evolution" content partially tried to do; the interpretive half of that content moves to §5.4)*

**Answers:** Across all included observations, where do violations concentrate — which of the 19 concerns account for most of the signal, and is the distribution roughly even or sharply skewed toward a few categories?

**Logic:** Report raw net-of-baseline violation counts (per the §3.5.3 net-delta rule) aggregated across all conditions and tasks, broken out by concern. State this purely descriptively — no comparison between conditions yet (that is §5.2/§5.3's job) and no claim about trend over time yet (that is §5.4's job). This section exists so a reader has the overall shape of the data before being shown any comparison, the same way a summary-statistics table precedes a hypothesis test in an empirical paper.

**Figure/Table:** *Figure 4.1 — Violation Heatmap.* Rows = 19 concerns (grouped by stack: backend/frontend/cross-stack), columns = the 4 conditions; cell colour intensity = net violation count for that concern in that condition, aggregated across T1–T3. This is the chapter's first and most important descriptive figure — it is what makes "violations are concentrated, not uniform" a visible fact rather than an assertion.

## 4.3 Trajectory-Level Results
*(new — purely presentational; the interpretive "did it get worse" question moves to §5.4)*

**Answers:** For each of the four conditions, what did the raw metric values and constraint pass/fail pattern look like at T1, T2, and T3?

**Logic:** Present the four trajectories as data, in the same tabular/graphical form for all four so they are visually comparable, without yet drawing any conclusion about shape or cause. This is the section a reader (or examiner) checks the raw numbers against before trusting any later interpretive claim in Chapter 5 — keep interpretation out of this section even where it would be tempting to add a one-line comment.

**Figure/Table:** *Figure 4.2 — Raw Trajectories.* Small-multiples: one panel per condition (4 panels), x-axis = T1→T2→T3, y-axis = a representative aggregate metric value (e.g., mean z-scored violation density across the 19 concerns — state the exact aggregation method used, since this single figure design choice determines how §5.4 later reads trend shape). No trend line or annotation yet — that overlay belongs to Figure 5.2 in §5.4, built from the same underlying data.

## 4.4 Functional and Efficiency Outcomes
*(existing roadmap line, currently unwritten — needs explicit scope resolution given the Judgments-layer gap established in §3.1.2)*

**Answers:** What is known about task completion quality and resource cost, given that the Judgments layer (the instrument that would grade functional compliance) was not implemented?

**Logic:** This section must not silently produce "functional outcomes" data that doesn't actually exist. Split it into two halves with different evidentiary status: **(a) Functional outcomes** — state plainly, cross-referencing §3.1.2, that no graded functional-compliance measure exists; report only the coarse, already-available proxy (did the run reach `[TASK_COMPLETED]` / did the harness mark the manifest `completed` vs. `partial`, per the free signal identified during instrument design) and label it explicitly as a completion signal, not a correctness signal. **(b) Efficiency outcomes** — report whatever *is* actually captured by the execution log (wall-clock duration per task, and token/cost figures if the agent CLI exposes them) — this data source is independent of the Judgments gap and should be reported at full confidence. Keeping (a) and (b) visibly separate prevents a reader from assuming the efficiency numbers imply anything about correctness.

**Figure/Table:** *Table 4.2 — Completion and Efficiency Summary.* Rows = 13 task-level observations; columns = Reached `[TASK_COMPLETED]` (Y/N) | Wall-clock duration | Token/cost figures (if available) | *(no "correctness" column — its absence should be visually obvious, not just stated in prose)*.

## 4.5 Summary of Results
*(replaces the current empty "4.4 Summary" heading — kept non-interpretive)*

**Answers:** What has this chapter established, in one paragraph, before Chapter 5 starts interpreting it?

**Logic:** Restate §4.1's completeness figures, §4.2's concentration finding, and §4.3's observation that trajectories exist and differ visibly across conditions (without yet saying how or why) — end with a direct hand-off sentence naming the three questions Chapter 5 will answer with this data (prompt-strategy effect, agent effect, trajectory shape, and the constraint–metric divergence).

**Figure/Table:** None.

---

# Chapter 5 — Analysis

*(target ≈2,400 words; see the word-budget note at the end — this is the tighter of the two chapters relative to how much it needs to carry)*

## 5.1 Analytical Framework
*(new — a short bridging section; without it Chapter 5 has no stated method before it starts producing claims)*

**Answers:** What analytical procedure turns Chapter 4's raw data into the claims that follow, and what data-quality handling from Chapter 3/4 remains in force here?

**Logic:** State directly that this chapter follows the five-stage framework specified in the study's methodology (data cleaning → descriptive → comparative → longitudinal → mechanism-level analysis), and that Stage 0 (cleaning) and Stage 1 (descriptive) were already completed in Chapter 4 §4.1–4.2 — this chapter picks up at the comparative stage. Restate in one sentence that all comparisons below use net-of-baseline, trajectory-cumulative deltas (§3.5.3), never raw counts.

**Figure/Table:** None — this is a one-paragraph method statement, not a results section.

## 5.2 Effect of Prompt Strategy
*(existing question skeleton from the current draft's §4.3 — moved here, now genuinely comparative)*

**Answers:** Did the structured condition produce fewer architectural violations than minimal, was the effect visible at every task, did it change the *rate* of accumulation (not just the endpoint), and — if replication exists — what is the effect size and its uncertainty?

**Logic:** Answer in the existing four-question order (it is already well-sequenced: overall effect → per-task breakdown → rate-of-accumulation → statistical confidence). Given only one run per condition (§3.5.1: four conditions executed once each), the fourth question's honest answer is likely "not estimable from n=1 per cell" — say so directly rather than reporting a spurious effect size; this is a genuine limitation to carry into Chapter 6, not a gap to paper over here.

**Figure/Table:** *Figure 5.1 — Minimal vs. Structured Slope Chart.* One line per task (T1/T2/T3) connecting the minimal-condition value to the structured-condition value, faceted by agent if both agents are compared here. Line direction and magnitude are the evidence; this figure should make it visually immediate whether structured prompting helped, hurt, or made no consistent difference — precisely because that ambiguity, if it exists, is itself a finding (an "explicit rules alone are insufficient" result is a stronger contribution to the field than a clean "structured wins" result would be).

## 5.3 Differences Between Coding Agents
*(existing question skeleton from the current draft's §4.4 — moved here)*

**Answers:** Did the two agents produce different overall violation levels, did they respond to structured prompting the same way, and was the prompt-strategy effect larger for one agent than the other?

**Logic:** Same three-question order as currently drafted. Frame the expected finding correctly going in: the interesting result is very unlikely to be "one agent is simply better" — it is more likely that the two agents have different *violation profiles* (different concerns dominate for each), which is a qualitatively more useful finding for the discussion chapter than a single ranking would be.

**Figure/Table:** *Figure 5.2 — Agent Violation Profile Radar Chart.* One polygon per agent, 9 backend + 7 frontend axes (or a reduced/aggregated axis set if 16 is too dense to read), each axis = that agent's violation rate for that concern. Overlaying both agents' polygons on one chart is what makes "different profile, not different overall quality" visible rather than asserted.

## 5.4 Longitudinal Trajectory Shape Across T1→T3
*(new — this is where §4.3's raw trajectories get interpreted)*

**Answers:** Using the raw trajectories from Chapter 4 §4.3, does architectural degradation accumulate linearly, accelerate, or plateau across the three-task sequence — and which theoretical account does the observed shape support?

**Logic:** Take Figure 4.2's raw per-condition trajectories and fit/annotate the shape: report whether the T1→T2→T3 slope is roughly constant (linear accumulation), increasing (convex — consistent with Lehman's (1980) complexity-increase law, where each task makes the next task's clean implementation harder), or flattening (plateau — the reader's expectation-defying case, worth flagging prominently if observed). Because n=3 points per trajectory is too short for formal curve-fitting to be meaningful, keep this qualitative (visual slope description) rather than reporting a spurious regression statistic on three points.

**Figure/Table:** *Figure 5.3 (extends Figure 4.2).* Same four-panel layout as Figure 4.2, now with a fitted/annotated trend overlay per panel and a one-line shape classification (linear / convex / plateau) printed on each panel.

## 5.5 Silent Decay: Constraint–Metric Divergence
*(new — this is the chapter's centrepiece and should get the largest word allocation of any Chapter 5 subsection)*

**Answers:** Do binary constraints and continuous metrics ever disagree — specifically, are there observations where all constraints pass but at least one metric shows a significant decay — and if so, how often?

**Logic:** This section directly operationalises and reports the study's central hypothesis. Define the four-way classification once (constraints-pass/metrics-improve; constraints-pass/metrics-decay — **this is Silent Decay**; constraints-fail; indeterminate due to error-status data), then classify every one of the 13 observations from Table 4.1 into exactly one bucket, then report the proportion falling into the Silent-Decay bucket as the headline number of the entire empirical chapter. If the Silent-Decay count is zero across only 13 observations, say so plainly and reframe the section around what a null result here would mean (either the phenomenon is real but this sample is too small to catch it, or binary constraints are more sufficient than the study's premise assumed) — do not let this section imply a stronger result than 13 observations can support.

**Figure/Table:** *Figure 5.4 — Silent Decay Classification.* Stacked/grouped bar chart, x-axis = condition or task, bars segmented into the four categories above by colour. This is the figure most likely to be reproduced in the dissertation's abstract/defence slides — it should be legible on its own, with the four category definitions in a compact legend rather than requiring the reader to hold the prose definition in mind.

## 5.6 Secondary Mechanism Analyses
*(new — optional given the word budget; see note below)*

**Answers:** Two smaller, supporting questions: are violations concentrated in a few files or spread across the changeset (spatial concentration), and are the 19 metrics measuring genuinely independent things or largely redundant with each other (correlation structure)?

**Logic:** Include this section only if §5.2–5.5 fit comfortably inside the word budget; if not, state both questions as brief, one-paragraph observations rather than full sub-analyses with dedicated figures, and move the fuller treatment to Chapter 8's future-work list (both are already scoped as Stage 4 analyses in the methodology document and can be picked up post-submission without any framing change).

**Figure/Table (if retained):** *Figure 5.5a — Lorenz curve* of violation concentration across touched files; *Figure 5.5b — correlation heatmap* across the subset of metrics with enough non-missing observations to compute a correlation coefficient meaningfully (likely a small subset, given n=13).

## 5.7 Summary
*(replaces the current empty "5.4 Summary" heading)*

**Answers:** Restated against the three research questions from Chapter 1 — what does this chapter conclude, provisionally, given the sample size?

**Logic:** One paragraph per RQ (architectural degradation observed? prompt-strategy effect observed? constraint–metric divergence observed?), each answer qualified by the actual n behind it (do not let the prose imply more statistical confidence than §5.2's n=1-per-cell and §5.5's n=13 support). Close with a direct hand-off into Chapter 6's discussion of what these provisional answers mean.

**Figure/Table:** None.

---

## Word-budget note

The current draft allocates 2,400 words to each of Chapter 4 and Chapter 5 (4,800 total). Against the subsection load above:

- **Chapter 4** (5 subsections, one new table-heavy §4.4) fits inside 2,400 words if each subsection stays close to 400–500 words — realistic, since most of Ch4's content is tables/figures carrying the weight rather than prose.
- **Chapter 5** is tighter: §5.5 (Silent Decay) is the section that most needs room to breathe, since it is the study's central claim and deserves more than a rushed paragraph. If 2,400 words proves insufficient once drafted, cut §5.6 first (already flagged above as the section to demote to future work), not §5.2–5.5.

If you'd rather rebalance the two chapters' word budgets now rather than discover the squeeze mid-draft, moving 400–600 words from Chapter 4 to Chapter 5 (e.g., 2,000 / 2,800) would better match where the interpretive weight of the outline above actually sits.
