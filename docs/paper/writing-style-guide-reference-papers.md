# Writing Style Guide — Calibrated to Zeng et al. (2025) and Le et al. (2026, SWE-EVO)

Both reference papers are ACM/arXiv empirical-software-engineering papers built around the same house style: benchmark → controlled study → numbered findings. This guide extracts that style as eleven rules, each with **why it matters**, then **a before/after drawn from this thesis's own draft** (not a hypothetical example) so it is directly actionable. It is a companion to `chapter3-writing-guidance.md` (which handles Chapter 3's internal style/logic/table issues) — this file is scoped to **matching the two reference papers specifically**, and applies across Chapters 3–5.

Two chapter-specific application passes follow this guide:
- `chapter3-style-alignment.md` — gap analysis against the methodology outline.
- `chapter4-5-style-alignment.md` — gap analysis against the results/discussion drafts.

---

## 1. Numbers-first sentences, no unquantified adjectives

**Rule.** Every evaluative claim carries its number in the same sentence. Never write "performs poorly" or "a large improvement" — write the percentage, count, or ratio that *is* the claim.

**Reference pattern.**
> "the best model (`gpt-5.4`) resolves only 25% of tasks... `gpt-5.2` drops from 72.80% on SWE-Bench Verified to 22.92% on SWE-EVO"

**This thesis already does this well in Chapter 4** ("Codex ends with 33 ... whereas Claude ... 8"). The gap is in Chapter 5, where interpretation sometimes drifts back to unquantified language.

- Before (§5.2.3): *"Ranked by volume alone, Claude outperformed Codex by a factor of two to four (§4.4)."* — already compliant, keep as the model.
- Before (§5.2.6, weaker): *"Combined with the efficiency data — Codex roughly twice as fast and two to four times as violation-prone — the results reproduce, in miniature, the volume–quality tension..."* — compliant. Watch instead for phrases like "substantial resource overhead" (Zeng's own paper does this once, in prose, but immediately cashes it out with "5.24 million TokensSent... $7.05" in the same sentence — the adjective is always followed by the number in the same breath, never left to stand alone).

**Action:** scan Chapter 5 for any sentence containing "significant/substantial/notable/considerable" without a number in the same sentence; either attach the number or delete the adjective.

---

## 2. Contributions as a numbered, noun-first list at the end of the Introduction

**Reference pattern (Zeng et al., §1):**
> 1. **Benchmark**: A more challenging and dynamically updated benchmark dataset...
> 2. **Evaluation Framework**: A comprehensive evaluation framework...
> 3. **Approach**: A standardized, open-source implementation...
> 4. **Study**: An in-depth empirical study...

Each item leads with a **bold one- or two-word label naming the artefact type**, not a full sentence restating the finding.

**Action for this thesis's Chapter 1** (not yet reviewed in this pass, flagged for the next one): confirm the Introduction closes with a numbered list in this exact shape — e.g., **Benchmark/Instrument** (the rulepack + starter codebase + task chain), **Framework** (the constraint/metric evaluation harness), **Study** (the 2×2 controlled experiment), **Findings** (the erosion/silent-decay/prompt results) — rather than prose paragraphs.

---

## 3. Explicit RQ list, and results sections keyed 1:1 to it

**Reference pattern.** Both papers state RQ1/RQ2/RQ3 verbatim in §3 or §3.3, then title every result subsection after the RQ number: "4.1 RQ1: Effectiveness of Evaluation Framework", "4.2 RQ2: Performance of SDAgents...".

**Gap found in this thesis.** `thesis-chapter-outline.md` states RQ1–RQ3 in §1.3, but `chapter4-results-analysis.md` never cites them — it instead cites **RO3/RO4** ("Architectural integrity degraded in every condition, immediately and specifically (RO3)", §4.9), a naming scheme that appears nowhere else in the reviewed files.

**Action:**
1. Decide the single naming scheme (recommend **RQ1–RQ3**, matching Chapter 1 — "RO" reads as a leftover from an earlier objectives-based outline and is undefined where it's used).
2. Retrofit Chapter 4's section headers to name the RQ each section answers, reference-paper style — e.g., §4.5 (Longitudinal Trajectories) is squarely RQ1; §4.6 (Silent Decay) is RQ2; §4.3 (Prompt Strategy) is RQ3. Currently no section header carries this label; only the §4.9 summary retroactively tags claims with RO-numbers, which is the reverse of the reference papers' structure (RQ stated first, then answered).

---

## 4. Related-work sections argue by *cited limitation*, not by *listing*

**Reference pattern (Zeng et al., §2.2):** three numbered limitations of existing benchmarks — "Insufficient Challenge", "Limited Evaluation Metrics", "Compromised Realism in Evaluation" — each with one or two citations as evidence, immediately followed by "In light of these shortcomings, our research is dedicated to constructing..." Every related-work paragraph ends by pointing at the gap the present paper closes.

**Action (for Chapter 2, not in this pass's file set but flagged):** convert any "prior work has studied X, Y, Z" survey-style paragraph into the numbered-limitation form: name the limitation, cite the work exhibiting it, then close the paragraph with the one-sentence pivot to what this study does about it. Chapter 5's §5.2 subsections already do a compressed version of this correctly (e.g., §5.2.1 cites four erosion papers, then pivots with "The behaviour observed in this study does not match that temporal profile") — use that paragraph as the template when revising Chapter 2.

---

## 5. Findings as call-out boxes, not just bolded lead sentences

**Reference pattern.** Both papers set every major finding in a distinct grey box headed "Conclusion N:", placed immediately after the evidence that supports it, e.g.:
> **Conclusion 4:** The superior performance of the Dev-Test workflow demonstrates that different workflow designs and agent orchestrations can greatly affect overall performance...

This is a **visual, not just typographic** convention — it lets a reader who only skims the boxes reconstruct the whole paper's argument.

**Gap found.** Chapter 4 approximates this with bolded lead sentences inside prose paragraphs (e.g., §4.5: "**Degradation is task-driven, not uniformly accumulative.**") — good instinct, same information, but not visually set apart, and the §4.9 summary re-states them a second time in a different format (further bolded leads). The reference papers never restate a Conclusion box's content in prose elsewhere; the box *is* the canonical statement, cross-referenced by number.

**Action:**
1. In Chapter 4, promote each bolded lead sentence (§4.2, §4.5's three, §4.6) to an actual set-apart block — Markdown convention: a blockquote or a labelled `> **Finding N:** ...` immediately under the relevant subsection, mirroring the "Conclusion N" boxes.
2. Number them sequentially across the whole chapter (Finding 1 … Finding 6), and in §4.9 and Chapter 5, **cite by number** ("Finding 3 established that...") instead of re-deriving the sentence. This is the single highest-leverage change for matching the reference style, because it is the papers' most visible structural signature.

---

## 6. Study/benchmark construction as literal numbered Stages

**Reference pattern (both papers).** Dataset/benchmark construction is never narrated as continuous prose — it is broken into **Stage I / Stage II / Stage III** (SWE-EVO) or a numbered list "1. Source Data Collection... 2. LLM-based Filtering... 3. Execution-based Filtering... 4. Sampling and Requirement Generation" (Zeng et al., §3.1.1), each item stating **what tool is used, what is filtered, what is kept** — written so a reader could reproduce the step from the sentence alone.

**Gap found.** `chapter3-methodology-outline.md` already has strong instincts toward this (§3.3.1's three design principles, §3.4.2's pruning narrative), but the *starter-codebase construction* (§3.2) and *rulepack construction/pruning* (§3.4.2–3.4.4) are currently planned as narrative paragraphs, not enumerated stages.

**Action:** see `chapter3-style-alignment.md` §A for the specific retrofit — recommend converting §3.4.2's cross-stack pruning narrative into an explicit numbered stage list (candidates evaluated → exclusion criterion applied per candidate → retained set), matching Zeng §3.1.1's filtering-stage format exactly, since the underlying content (seven candidates → four excluded → three retained, each with a stated reason) is already the right shape and only needs re-formatting.

---

## 7. Threats/Limitations: one paragraph per validity type, threat-then-mitigation inside each

**Reference pattern (Zeng et al., §6).** Three bolded subheads — **Internal Validity. / External Validity. / Construct Validity.** — each a single paragraph structured as: name the threat → state the mitigation, in that order, no more than 4–5 sentences.

**This thesis already matches this well.** `chapter5-discussion.md` §5.3 uses the four-part Wohlin scheme (construct/internal/external/conclusion validity), each paragraph threat-then-mitigation. This is a superset of the reference papers' three-part scheme (they omit conclusion validity; this thesis's inclusion of it is a legitimate methodological strength, not a deviation to fix) — **no change needed**, this section is already at reference-paper quality.

---

## 8. Confidence hedging is graded, not binary

**Rule.** The reference papers modulate certainty with a small fixed vocabulary rather than either asserting flatly or hedging everything equally: **"we posit"** / **"we hypothesize"** (an unconfirmed explanation offered), **"this suggests"** (one plausible reading among others), **"strongly indicates"** / **"clearly indicate"** (near-certain, evidence-backed), **"we observed"** (a bare fact). Crucially, the same paper uses different levels for different claims in the same paragraph — degrading a "we found X" to "we posit Y accounts for X" the moment the paper moves from data to explanation.

**This thesis already does this competently** (e.g., §5.2.4's "Two readings are compatible with this result, and the data cannot separate them" — an appropriately hedged framing before offering the optimistic/cautious pair). Spot-check for the opposite failure — overclaiming — rather than under-hedging, since Chapter 5 is generally careful; e.g. confirm every "indicates" / "demonstrates" in §5.2 is immediately followed by the qualifying scope clause the surrounding sentence already tends to supply.

---

## 9. Every table/figure gets a one-sentence lead-in and is read aloud, not just referenced

**Reference pattern.** No table or figure appears "cold." The sentence immediately before it states what question it answers ("Table 3 reports results for OpenHands and SWE-agent, alongside each model's SWE-Bench Verified score when available"), and the sentence(s) immediately after walk the reader through the specific cells that matter, by name/number, not by "as shown above."

**Gap found (minor).** Chapter 4 does this consistently well already (e.g., §4.3's "Table 4.3 pairs each agent × task cell..." followed by walking through specific numbers). One exception: Table 4.2 in §4.1 is introduced only by "Table 4.2 shows this debt by category" with no walk-through sentence after it — the STATE-row explanation is relegated to a table footnote rather than integrated into prose the way every other table in the chapter is. `chapter3-methodology-outline.md`'s planned tables (3.0a, 3.0b, 3.2–3.4) should each get an explicit lead-in sentence written into the outline's "Logic" field, not left implicit.

---

## 10. Threats/uncertainty from small sample size get numeric bounds, not just an acknowledgement

**Reference pattern (SWE-EVO, §4.2, highlighted passage):**
> "Because SWE-EVO contains 48 curated instances, one resolved instance changes Resolved Rate by 2.08 percentage points. We therefore report uncertainty and avoid over-interpreting close leaderboard gaps... Representative 95% Wilson confidence intervals over task instances are [14.9, 38.8] for 25.00%..."

This is a stronger move than simply writing "the sample is small" — it quantifies exactly what one additional data point would do to the headline number, then gives explicit interval bounds.

**This thesis already exceeds this bar in one place** (§4.3's Wilcoxon reporting: "with three pairs per agent, the smallest two-sided p-value the Wilcoxon signed-rank test can return is 0.25" — this is precisely the SWE-EVO move, stating the mechanical bound rather than a vague caveat). **Gap:** the same treatment is missing where Chapter 4 reports single-run percentages without stating what one different task outcome would do to them — e.g., §4.4's "roughly a two- to four-fold gap" and §4.7's Gini coefficients are both n=1-per-cell figures without a stated sensitivity bound. Not every number needs this (would be excessive), but the chapter's *headline* comparative claims (the ones repeated in §4.9) are the right candidates.

**Action:** in `chapter4-5-style-alignment.md`, identify the 2–3 headline claims in §4.9 that most need a one-sentence "what would one more/fewer violation change" sensitivity statement, following the §4.3 Wilcoxon paragraph as the in-house template.

---

## 11. Restraint on claimed generality — one exemplar, not a general instrument

**Reference pattern (SWE-EVO, Limitations, §6):** "Third, the benchmark has 48 curated instances and an imbalanced repository distribution... We deliberately prioritize large, execution-validated release transitions over a larger number of shallow tasks, but the current size still limits statistical power for fine-grained comparisons." — the limitation is stated as a **deliberate trade-off with a named cost**, not an apology.

**This thesis already does this correctly** in `chapter5-discussion.md` §5.3 External Validity: "The study is designed as a reusable paradigm demonstrated on an exemplar, not as a general benchmark, and its findings should be generalised only by re-running the paradigm elsewhere." This is the right register — keep it as the house phrasing for any future scope-limitation sentence added elsewhere (e.g., in Chapter 3's new §3.1.2 scope-boundary section, and in Chapter 6's conclusion).

---

## Quick checklist (apply per chapter)

| # | Rule | Ch.3 status | Ch.4 status | Ch.5 status |
|---|---|---|---|---|
| 1 | Numbers-first, no bare adjectives | n/a (outline stage) | ✅ mostly | spot-check "significant/substantial" |
| 2 | Numbered contributions list | Ch.1, not reviewed | — | — |
| 3 | Explicit RQ list, sections keyed to it | should state RQ↔component mapping | **retrofit RQ labels onto §4.x headers; drop undefined "RO3/RO4"** | cite by RQ in §5.2 subheads too |
| 4 | Related-work by cited limitation | Ch.2, not reviewed | — | §5.2 pattern is the template |
| 5 | Findings as numbered call-out boxes | — | **promote bolded leads to boxed, numbered Findings** | cite Findings by number instead of restating |
| 6 | Construction as numbered Stages | **retrofit §3.4.2 pruning narrative + §3.2 into Stage I/II/III** | — | — |
| 7 | Threats: threat→mitigation per type | (inherits from Ch.5 structure) | — | ✅ already reference-quality |
| 8 | Graded hedging vocabulary | apply when drafted | ✅ | ✅ mostly |
| 9 | Every table/figure gets lead-in + walk-through | bake into outline's "Logic" field | fix Table 4.2's missing walk-through | n/a (few tables) |
| 10 | Numeric sensitivity bounds on small-n headlines | n/a | add to 2–3 §4.9 headline claims | inherits from Ch.4 fix |
| 11 | Scope restraint as deliberate trade-off | write into new §3.1.2 | — | ✅ already reference-quality, reuse phrasing |

See `chapter3-style-alignment.md` and `chapter4-5-style-alignment.md` for the line-level edits.
