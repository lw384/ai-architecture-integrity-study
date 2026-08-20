# Chapters 4–6 — Final Outline (Results & Analysis / Discussion / Conclusion)

**Status:** grounded in the final dataset — 13 harness evaluations (1 baseline + 4 conditions × T1–T3), regenerated from `reports/analysis/` on 2026-08-18 after the two redundant codex sessions were removed. Every number referenced below traces to a file in `reports/analysis/data/` or `data/derived/`.

**Chapter mapping note（与 Word 模板的对应关系）**：现行草稿模板是 Ch4 Results / Ch5 Analysis / Ch6 Limitations & Future Work / Ch7 Conclusion（2400+2400+1800+1500 词）。本 outline 按用户要求重组为三章：**Ch4 Results and Analysis**（合并原 4+5，≈4,400 词）、**Ch5 Discussion**（含 Limitations + Future Work，≈2,300 词）、**Ch6 Conclusion**（≈1,400 词）。总词量与模板预算一致（≈8,100）。若最终仍需拆回四章，Ch4 的 §4.1–4.2 + §4.8 即原 "Results"，§4.3–4.7 即原 "Analysis"，无需改写内容，只需重新编号。

**Terminology carried over from Chapter 3**: *task* (not sprint), *Minimal/Structured* prompt strategies, *concern* (19 = 9 backend + 7 frontend + 3 cross-stack), *net-new violations* (net of the 5 pre-existing baseline findings), *run-local delta* vs *trajectory-cumulative delta*. Agents: Claude Sonnet 4.6 (Claude Code CLI) and GPT-5.3 (Codex CLI).

---

# Chapter 4 — Results and Analysis (≈4,400 words)

Follows the five-stage analysis framework from `docs/methodology/analysis.md` (Stage 0 cleaning → Stage 1 descriptive → Stage 2 comparative → Stage 3 longitudinal → Stage 4 mechanism), so every section maps to a named, reproducible analysis script in `reports/analysis/src/stages/`.

## 4.1 Experimental Runs and Data Quality  *(Stage 0 · s0_1, s0_2, s0_3)*

**Questions answered:**
1. How many conditions, trajectories, and task-level observations exist? (4 conditions × 3 tasks + 1 baseline = 13 evaluations)
2. Did every agent complete every task under the execution protocol? (Yes — all 12 runs: exit code 0, `[TASK COMPLETED]` marker found, no agent-reported errors)
3. Were any evaluations affected by harness errors? (No — 0 metric errors, 0 scope errors across all 13; metric coverage 100% for agent runs, 95% at baseline because the diff-driven CROSS-PROP metric is undefined on a baseline-only snapshot)
4. What pre-existing debt does the baseline carry, and how is it neutralised? (5 frontend findings — 3 DUP clones, 2 STATE provider placements — subtracted via net-delta accounting; baseline-vs-baseline self-check delta = 0 confirms the pipeline)
5. Which observations enter the analysis? (All 12 agent evaluations)

**Tables/Figures:**
- **Table 4.1 — Run Inventory.** 13 rows (baseline + 4 conditions × T1–T3): condition, task, completion status, constraint result, harness errors, included Y/N. The single source of truth for every later N.
- **Table 4.2 — Baseline Pre-existing Debt by Category.** category | baseline count | mean agent-run absolute count | mean net-new. Anchors the net-delta rule visually.

## 4.2 Descriptive Overview of Architectural Violations  *(Stage 1 · s1_1, s1_2)*

**Questions answered:**
1. Across all 12 runs, which of the 19 concerns absorb the violations — uniform spread or sharp concentration? (Sharp: ERR, DUP, CONTRACT account for the large majority of net-new findings)
2. Which stack layer carries them? (Backend dominates; frontend net-new is small and mostly DUP clones; cross-stack recorded zero constraint findings in every run)
3. Which specific rules dominate? (ERR ← `BE-ERR-C-002` unified-exception rule; CONTRACT ← `BE-CONTRACT-C-001` entity-change-requires-migration; DUP ← clone-detection rules both stacks)

**Tables/Figures:**
- **Figure 4.1 — Violation Heatmap.** Rows = agents, columns = affected categories, cell = mean net-new violations per run (from `derived/violation_rate_matrix.csv`). The chapter's first evidence figure: concentration is visible, not asserted.

## 4.3 Effect of Prompt Strategy  *(Stage 2 · s2_1)*

**Questions answered:**
1. Did Structured prompting produce fewer net-new violations than Minimal? (Directionally yes but weak: overall median paired difference −1.5 violations/task, Wilcoxon p = 0.219)
2. Is the effect consistent per agent? (Claude: median diff −1.0, p = 1.0 — essentially no effect, and Structured T3 was *worse*; Codex: median diff −2.0, p = 0.25 — consistent direction, floor p-value)
3. Can significance be reached at n = 3 pairs per agent? (No — the smallest attainable two-sided Wilcoxon p at n=3 is 0.25; report as directional only)

**Tables/Figures:**
- **Figure 4.2 — Minimal → Structured Slope Chart.** One line per agent × task (6 lines) connecting run-local net-new violation counts. Mixed slopes make the "explicit rules alone are insufficient" reading immediate.
- **Table 4.3 — Paired Comparison and Wilcoxon Results.** Pairs + per-agent and overall statistic/p/median-diff (from `derived/strategy_comparison_test.json`).

## 4.4 Differences Between Coding Agents  *(Stage 2 · s2_2)*

**Questions answered:**
1. Did the agents differ in overall violation volume? (Yes — Codex ≈2–3.5× Claude's cumulative net-new totals at T3: 34/20 vs 9/9)
2. Do they share a violation *profile*? (No — Codex exhibits a category Claude never triggers at all: ERR (`AppException` bypass), mean 7.7 net-new per run vs 0.0; Codex also higher on DUP and CONTRACT; Claude uniquely (marginally) triggers SIZE and DEP)
3. Did they respond to Structured prompting the same way? (No — direction consistent only for Codex; interaction cannot be tested at n=1 per cell but the descriptive contrast is stated)

**Tables/Figures:**
- **Figure 4.3 — Agent Violation Profile Radar Chart.** One polygon per agent over the affected categories (from `derived/agent_profile_matrix.csv`). Shows "different weakness profiles, not just different volume".

## 4.5 Longitudinal Trajectories Across T1→T3  *(Stage 3 · s3_1)*

**Questions answered:**
1. What shape does cumulative net-new violation count take across the task chain? (All four conditions classify as plateau-or-decline by the T2→T3 slope: Claude flat ~9–12 throughout; Codex spikes at T2 — 12→35 minimal, 11→26 structured — then flattens or falls)
2. Where does degradation actually happen? (Task-structure-dependent, not monotonic: T2's relational remodel + migration is the erosion hot-spot, consistent with its design intent from §3.3)
3. Is there any self-correction? (Yes — run-local net change at T3 is negative in 3 of 4 conditions (−3, −1, −1, −6): agents resolved more old violations than they introduced while implementing T3)
4. Does the 3-point trajectory support Lehman-style accelerating decay? (No — no condition shows a convex upward curve; keep qualitative, no curve fitting on 3 points)

**Tables/Figures:**
- **Figure 4.4 — Cumulative Net-New Violation Trajectories.** x = T1→T3, y = trajectory-cumulative net-new count, 4 lines (agent × strategy), shape label per line (from `derived/trajectory_totals.csv` / `trajectory_shapes.csv`).

## 4.6 Silent Decay: Constraint–Metric Cross-Classification  *(Stage 4 · s4_1)*

**Questions answered:**
1. Applying the pre-registered four-way classification (clean / silent-decay / constraints-failed / indeterminate), where do the 12 runs fall? (12/12 constraints-failed; the silent-decay bucket is **empty**)
2. What does this null mean, honestly framed? (Every run tripped at least one binary constraint from T1 onward, so no run ever reached the "looks clean" precondition; with tasks deliberately designed to stress rulepack concerns, constraints saturated before metrics could diverge)
3. Did the metric layer add anything despite the null? (Yes — IQR-outlier decay beyond the Stage-1 bounds appeared in 4 runs alongside the constraint failures — BE-SIZE (Claude minimal T2/T3), FE-DUP (Codex minimal T1), BE-ERR + BE-SIZE (Codex minimal T3) — i.e. metrics corroborated and graded severity rather than diverged)

**Tables/Figures:**
- **Figure 4.5 — Silent Decay Classification.** Stacked bar per condition, segments = 4 classes with compact legend definitions (from `derived/silent_decay_classification.csv`). Deliberately monochrome-dominant here — the emptiness of the silent-decay segment *is* the result.

## 4.7 Secondary Mechanism Analyses  *(Stage 4 · s4_2, s4_3 — brief)*

**Questions answered:**
1. Concentrated or diffuse? (Concentrated: top violating file carries 25–80% of a run's findings, Gini 0.0–0.55; `deal.service.ts` and `contact.service.ts` recur as hot-spots; Codex runs sit at the concentrated end)
2. Are the continuous metrics redundant? (No dominant factor: PCA over the 11 varying metrics → PC1 35%, PC2 21%; a few high pairwise correlations at n=12 are flagged as unstable, not interpreted)

**Tables/Figures:**
- **Table 4.4 — Violation Spatial Concentration.** Per run: files touched, findings, Gini, top file + share (from `derived/file_concentration.csv`). Correlation/PCA reported in one paragraph, no dedicated figure (n too small to justify one).

## 4.8 Functional and Efficiency Outcomes  *(Stage 0.3 side-evidence; scope-bounded per §3.1)*

**Questions answered:**
1. Did self-reported completion match independent verification? (No — all 12 runs self-reported completion, but of the 4 T1 acceptance-suite runs only Claude-Structured passed; the other three failed the backend suite. T2/T3 have no acceptance suites — say so plainly)
2. What did the runs cost? (Claude: 97–171 turns, USD 4.81–6.53, 20–26 min per task; Codex: 10–15.5 min per task, cost/token figures not exposed by the CLI — absence reported, not imputed)
3. Boundary restated: these are completion/effort signals, not graded correctness (Judgments layer unimplemented, §3.1)

**Tables/Figures:**
- **Table 4.5 — Completion, Acceptance and Efficiency Summary.** 12 rows: condition, task, completion marker, acceptance-test result (pass/fail/skipped), duration, turns/cost where available. No "correctness" column — its absence is the point.

## 4.9 Summary of Findings

One paragraph per research objective RO3/RO4 plus the descriptive base: (i) erosion was immediate and mechanism-specific, not gradual; (ii) it concentrates in ERR/DUP/CONTRACT and in few files; (iii) prompt structure produced no statistically defensible reduction; (iv) agents differ in profile more informatively than in volume; (v) the silent-decay bucket was empty while metrics corroborated constraint findings. Hand-off sentence to Chapter 5. No figures.

---

# Chapter 5 — Discussion (≈2,300 words)

## 5.1 Introduction
Half-page: chapter answers "what do these results mean, within what limits, and what next" — in that order.

## 5.2 Interpreting the Principal Findings

**5.2.1 Architectural erosion under agents is immediate and mechanism-specific.**
Q: does the classic gradual-drift picture (Perry and Wolf 1992; Eick et al. 2001; de Silva and Balasubramaniam 2012; Li et al. 2022) describe agent behaviour? A: erosion here is not slow accumulation but instant, repeatable rule-class failures (unified-exception bypass, migration omission, clone introduction) — consistent with the 2025–2026 agent empirics (Zhu, Tsantalis and Rigby 2026; Agarwal, He and Vasilescu 2026; Ehsani et al. 2026; GitClear 2026 as grey-literature context). No figure; argument section.

**5.2.2 Prompt-embedded rules did not secure conformance.**
Q: is architecture guidance in the prompt sufficient? A: no measurable effect at this sample; even the directional Codex improvement leaves 20 cumulative net-new violations. Implication: external enforcement (harness/CI conformance gate — Bucaioni et al. 2024) rather than prompt persuasion; connects to the study's motivating premise and to Jiang et al. (2026) on evaluation blind spots.

**5.2.3 Agent-specific "architectural personalities".**
Q: is one agent simply better? A: volume says Claude, but the more useful reading is profile: Codex's ERR monoculture (62 findings across six evaluations, one rule) vs Claude's zero — reviewer attention should be agent-targeted; duplication is common to both (Juergens et al. 2009 on clones as defect predictors; GitClear 2026 clone-growth trend).

**5.2.4 Degradation follows task structure, with partial self-correction.**
Q: does decay accelerate (Lehman 1980)? A: not within 3 tasks — the T2 spike tracks the task's designed stress (relational remodel), and T3's negative run-local deltas show limited voluntary repair. Frame as: within-horizon behaviour is demand-driven; Lehman-style feedback loops may need longer chains to appear.

**5.2.5 The silent-decay null result.**
Q: does the empty bucket refute the two-layer premise? A: no — it shows binary constraints were sufficient *for stress-designed tasks against a strict rulepack*; the metric layer still contributed severity grading and outlier corroboration. State both live explanations (sample/design saturation vs genuine constraint sufficiency) without choosing.

**5.2.6 Completion claims vs verified outcomes.**
Q: can self-reported completion be trusted? A: 12/12 claimed done; 1/4 verifiable T1 runs passed acceptance. Codex was ~2× faster and ~2–3.5× more violation-prone — echoes the volume–quality tension (Zhu, Tsantalis and Rigby 2026), with the explicit caveat that cost/token data is incomplete.

*(Figures: none in 5.2 — Chapter 4 owns the evidence; this chapter argues from it.)*

## 5.3 Limitations
Grouped by validity type, mirroring §3.6; incorporates the four seeds already in the draft's Ch6 notes:
1. **Construct** — rulepack = one architectural interpretation of one business domain; 19 concerns cannot exhaust "architectural integrity"; two proxy metrics (BE-TEST mock ratio, CROSS-PROP); cross-stack rulepack `experimental` and recorded zero findings — cannot distinguish "agents preserved contracts" from "instrument insensitivity".
2. **Internal** — no ablation of the Structured prompt's blocks (cannot attribute effects to contract vs rules text); baseline carries 5 pre-existing frontend findings (net-delta mitigates but cannot rule out imitation of inherited patterns); the two CLIs are not parameter-identical (effort=high both, but different harness surfaces).
3. **External** — one codebase, one architecture style (layered TS/JS monolith CRM); no claim to microservices etc.; two agents, snapshot models.
4. **Conclusion** — n = 1 session per condition, no replication; Wilcoxon floor p = 0.25; 3-point trajectories; T1-only acceptance suites; unequal task sizes (~24/~40/~39 requirements) confound cross-task comparison; Judgments layer designed but unimplemented.

Figure/Table: none — prose list with forward pointers into 5.4.

## 5.4 Future Work
Ordered by dependency, each item traced to a limitation: (1) replication runs per condition (unlocks inference); (2) implement Judgments layer → architecture × correctness quadrant analysis (`analysis.md` §8); (3) prompt-block ablation; (4) longer chains (T4-class composite tasks) to test Lehman-style acceleration; (5) enforcement-in-the-loop (feed harness findings back to the agent mid-trajectory) — the design implied by 5.2.2; (6) additional rulepacks/architectures and agents; (7) revisit the four pruned cross-stack categories and the agent self-review (T5) calibration probe, which was designed and piloted but not retained in the final dataset.

## 5.5 Summary
One paragraph closing the arc: erosion is real but structured; prompts alone insufficient; enforcement + profile-aware review is the actionable consequence.

---

# Chapter 6 — Conclusion (≈1,400 words)

## 6.1 Summary of the Study
Compressed restatement: gap (functional-only agent evaluation), apparatus (3-layer harness, 19 concerns, 2×2 longitudinal design), execution (13 evaluations).

## 6.2 Answers to the Research Question and Objectives
The RQ answered directly, then RO1–RO5 one short paragraph each: RO1/RO2 delivered as artefacts (framework + instrument, with reliability evidence: zero harness errors); RO3 characterised (immediate, concentrated, task-driven, partially self-correcting); RO4 answered (no defensible effect); RO5 delivered as the practitioner guidance distilled in 5.2 (external gates, agent-profiled review, migration/exception/duplication checklists).

## 6.3 Contributions
Three, stated without inflation: (a) reusable rule-linked constraint+metric conformance harness for TS/JS full-stack; (b) an entangled-task longitudinal design isolating prompt-level architectural guidance; (c) first controlled empirical characterisation of agent architectural erosion profiles under this design.

## 6.4 Closing Remarks
Return to the delegation question from §1.3: current agents deliver plausible completion while accumulating structural debt unless externally checked — measurement, not trust, is the deployment precondition.

*(No figures/tables in Chapter 6.)*

---

## References — additions required beyond the current draft list

In-text citations used by Ch4–6 that are **not yet** in the draft's References (all verified in `docs/methodology/*literature-review*.md`; Harvard entries ready to paste):

- Agarwal, S., He, H. and Vasilescu, B. (2026) 'AI IDEs or autonomous agents? Measuring the impact of coding agents on software development'. arXiv. Available at: https://arxiv.org/abs/2601.13597.
- Ehsani, R., Rawal, S., Cai, Y. and Chatterjee, P. (2026) 'Faster code, deeper debt? A multivocal literature review on technical debt and its early signs in LLM-assisted software development', *ACM Transactions on Software Engineering and Methodology*. Available at: https://doi.org/10.1145/3820165.
- GitClear (2026) *AI Copilot code quality: 2025 look back at 12 months of data*. Available at: https://www.gitclear.com/ai_assistant_code_quality_2025_research. *(grey literature — cite as context only)*
- Juergens, E., Deissenboeck, F., Hummel, B. and Wagner, S. (2009) 'Do code clones matter?', *Proceedings of the 31st International Conference on Software Engineering (ICSE 2009)*, pp. 485–495. Available at: https://doi.org/10.1109/ICSE.2009.5070547.
- Lehman, M.M. (1980) 'Programs, life cycles, and laws of software evolution', *Proceedings of the IEEE*, 68(9), pp. 1060–1076. Available at: https://doi.org/10.1109/PROC.1980.11805.
- Zhu, Y., Tsantalis, N. and Rigby, P.C. (2026) 'AI-generated smells: An analysis of code and architecture in LLM- and agent-driven development'. arXiv. Available at: https://arxiv.org/abs/2605.02741.

Optional (only if 5.2.1 keeps the erosion-causes sentence): van Gurp, J. and Bosch, J. (2002) 'Design erosion: problems and causes', *Journal of Systems and Software*, 61(2), pp. 105–119.

All other citations in Ch4–6 (Perry and Wolf 1992; Eick et al. 2001; de Silva and Balasubramaniam 2012; Li et al. 2022; Li et al. 2014; Bucaioni et al. 2024; Recupito et al. 2024; Jiang et al. 2026; Le et al. 2026; Deng et al. 2025; Li, Zhang and Hassan 2025; Esposito et al. 2026) already exist in the draft's References list.

## Writing-style rules carried over from `chapter3-writing-guidance.md`
Single voice ("this study/chapter"); apparatus in present tense, executed actions in past tense; no marketing adjectives; no over-assertion ("is intended to", "can be attributed to", never "guarantees"); every table gets a one-sentence lead-in; all Ns trace back to Table 4.1; numbers consistent everywhere (19 concerns, 3 tasks, 4 conditions, 13 evaluations, 12 agent runs).
