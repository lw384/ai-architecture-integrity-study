# Chapter 4: Results and Analysis

This chapter reports and interprets the empirical output of the experiment specified in Chapter 3. It follows the five-stage analysis framework defined in the study's analysis methodology: data quality and baseline calibration first (§4.1), then a descriptive overview of where violations concentrate (§4.2), comparative analysis across prompt strategies (§4.3) and agents (§4.4), longitudinal trajectory analysis (§4.5), and finally the mechanism-level analyses that require joint reading of multiple evaluation fields (§4.6–§4.7). Functional and efficiency outcomes, which lie outside the architectural scope boundary established in §3.1, are reported separately in §4.8. Section 4.9 summarises the findings against the research objectives. Throughout the chapter, all violation counts are *net-new* figures — net of the baseline's pre-existing findings — unless a table column is explicitly labelled as an absolute count, and every sample size traces back to the run inventory in Table 4.1.

## 4.1 Experimental Runs and Data Quality

The experiment executed the full 2 × 2 design: two coding agents (Claude Sonnet 4.6 via the Claude Code CLI; GPT-5.3 via the Codex CLI) crossed with two prompt strategies (Minimal, Structured), each condition run once through the three-task chain T1→T2→T3 on its own isolated workspace. Together with the single baseline evaluation of the untouched starter codebase, the harness produced thirteen scored evaluations: 1 + (4 × 3) = 13.

Table 4.1 inventories all thirteen. Three data-quality checks were applied before any analytical claim was built on them.

First, protocol completion. Every one of the twelve agent runs terminated with exit code 0, emitted the `[TASK COMPLETED]` marker required by the execution protocol, and reported no execution errors. No condition therefore has a missing or truncated trajectory point, and no downstream comparison needs to reweight for incomplete cells.

Second, harness reliability. Across all thirteen evaluations the harness recorded zero metric-status errors and zero scope errors; all 36 constraint rules evaluated successfully in every run. Metric coverage was 100% for the twelve agent evaluations and 95% (19 of 20) for the baseline, where the single unscored metric is the diff-driven propagation-incompleteness metric (`CROSS-PROP-M-001`), which is undefined on a baseline-only snapshot because it requires a before/after change set. Consequently, no observation in this chapter had to be excluded or down-weighted for instrument failure, and the "error-status as a distinct category" handling rule established in §3.5 was never triggered.

Third, baseline calibration. The starter codebase is not perfectly clean: the baseline evaluation records five pre-existing frontend findings — three duplication findings (`FE-DUP`) and two state-management findings (`FE-STATE`) — which constitute inherited debt rather than agent behaviour. Table 4.2 shows this debt by category. All analysis in this chapter therefore uses the harness's delta fields, which subtract the baseline state, rather than raw finding counts; a baseline-versus-baseline self-comparison confirmed that the delta pipeline returns exactly zero for an unchanged codebase, ruling out a computational artefact in the subtraction itself. A constraint result of *failed* in Table 4.1 accordingly means that the run introduced at least one net-new violation relative to this calibrated baseline.

Table 4.1 gives, for each evaluation, the completion and reliability status on which every later section depends.

**Table 4.1 — Run inventory: all thirteen harness evaluations.**

| Condition | Task | Execution | Constraint result | Findings (absolute) | Net-new (cumulative) | Harness errors | Included |
|---|---|---|---|---|---|---|---|
| Baseline | — | completed | passed | 5 | 0 | 0 | reference |
| Claude · Minimal | T1 | completed | failed | 16 | 11 | 0 | yes |
| Claude · Minimal | T2 | completed | failed | 16 | 11 | 0 | yes |
| Claude · Minimal | T3 | completed | failed | 13 | 8 | 0 | yes |
| Claude · Structured | T1 | completed | failed | 14 | 9 | 0 | yes |
| Claude · Structured | T2 | completed | failed | 14 | 9 | 0 | yes |
| Claude · Structured | T3 | completed | failed | 13 | 8 | 0 | yes |
| Codex · Minimal | T1 | completed | failed | 17 | 12 | 0 | yes |
| Codex · Minimal | T2 | completed | failed | 39 | 34 | 0 | yes |
| Codex · Minimal | T3 | completed | failed | 38 | 33 | 0 | yes |
| Codex · Structured | T1 | completed | failed | 16 | 11 | 0 | yes |
| Codex · Structured | T2 | completed | failed | 30 | 25 | 0 | yes |
| Codex · Structured | T3 | completed | failed | 24 | 19 | 0 | yes |

**Table 4.2 — Pre-existing baseline debt and mean agent-run counts by category.**

| Category | Baseline count | Mean agent-run absolute count | Mean net-new |
|---|---|---|---|
| ERR | 0 | 12.4 | 12.4 |
| DUP | 3 | 8.3 | 5.9 |
| CONTRACT | 0 | 5.4 | 5.4 |
| DEP | 0 | 2.0 | 2.0 |
| COM | 0 | 1.6 | 1.6 |
| DOM | 0 | 1.5 | 1.5 |
| SIZE | 0 | 1.0 | 1.0 |
| STATE | 2 | 2.0 | 0.0 |

*Note: category means are computed over the evaluations in which the category appears. The STATE row illustrates the purpose of the correction — its two baseline findings persist untouched through every trajectory, and net-delta accounting correctly attributes zero of them to the agents.*

All twelve agent evaluations pass the three gates and enter the analysis. One design-level observation from Table 4.1 already deserves note, because it frames everything that follows: **every agent run, in every condition, at every task, failed the binary constraint gate.** No trajectory reached even its first evaluation point with a clean architectural record. Sections 4.2–4.6 unpack what was violated, by whom, when, and with what severity.

## 4.2 Descriptive Overview of Architectural Violations

Before any condition is compared with any other, this section establishes where the violations fall across the nineteen architectural concerns. The answer is: not evenly.

Aggregated across all twelve runs, three categories absorb the large majority of net-new violations. The single largest contributor is transaction and error handling (ERR), driven entirely by one rule: `BE-ERR-C-002-throw-only-app-exception`, which requires service-layer failures to be raised through the project's unified `AppException` type. Duplication (DUP) is second, produced by the clone-detection rules on both stacks — predominantly `FE-DUP-C-002` (a single authoritative implementation per piece of production logic) and `BE-DUP-C-003` (no equivalent production code). Data-contract stability (CONTRACT) is third, again driven by a single rule, `BE-CONTRACT-C-001-entity-change-requires-migration`: agents repeatedly modified persistent entity definitions without generating the matching executable migration. The remaining affected categories — dependency direction (DEP), domain boundaries (DOM), frontend rendering complexity (COM), and unit complexity (SIZE) — contribute only fractional counts per run.

Figure 4.1 makes the concentration visible as a heatmap of mean net-new violations per evaluation, by agent and category.

> **Figure 4.1 — Violation heatmap: mean net-new violations per evaluation, by agent and concern category.** (Generated by analysis stage `s1_1_violation_heatmap`; rendered in `notebook/analysis.ipynb`.) Rows: Claude, Codex. Columns: COM, CONTRACT, DEP, DOM, DUP, ERR, SIZE. Cell values: Claude — 0.67, 3.00, 0.33, 0.33, 2.67, 0.00, 0.17; Codex — 0.50, 4.17, 0.00, 0.50, 4.67, 7.67, 0.00.

The distribution across stack layers is equally skewed. The backend carries most of the signal: backend absolute finding counts range from 2 to 29 per evaluation, whereas frontend absolute counts stay between 7 and 11 against a baseline of 5 — a modest net-new contribution consisting almost entirely of additional component clones. The cross-stack layer recorded **zero** constraint findings in all thirteen evaluations. This null is reported here as a descriptive fact; whether it reflects genuine contract discipline by the agents or limited sensitivity of the experimental cross-stack rulepack is taken up as a limitation in Chapter 5.

Two features of this distribution matter for the rest of the chapter. First, the dominant categories are each dominated by a single named rule, so the erosion observed in this study is not a diffuse loss of quality but a small set of specific, repeatable engineering omissions. Second, the profile differs sharply by agent — the ERR column belongs to one agent alone — which is the subject of §4.4.

## 4.3 Effect of Prompt Strategy

The Structured condition embeds the API contract and the architectural rules into the task prompt; the Minimal condition supplies only the business requirement. If prompt-level architectural guidance is sufficient to constrain agent behaviour, Structured runs should show systematically fewer net-new violations.

The evidence is directional at best. Table 4.3 pairs each agent × task cell across the two strategies on run-local introduced violations, and Figure 4.2 plots the same pairs as a slope chart.

**Table 4.3 — Paired strategy comparison (run-local introduced violations) and Wilcoxon signed-rank results.**

| Agent | Task | Minimal | Structured |
|---|---|---|---|
| Claude | T1 | 11 | 9 |
| Claude | T2 | 9 | 8 |
| Claude | T3 | 2 | 4 |
| Codex | T1 | 12 | 11 |
| Codex | T2 | 31 | 23 |
| Codex | T3 | 15 | 13 |

| Pairing | n pairs | Median difference (Structured − Minimal) | p (two-sided) |
|---|---|---|---|
| Claude only | 3 | −1.0 | 1.00 |
| Codex only | 3 | −2.0 | 0.25 |
| All pairs | 6 | −1.5 | 0.219 |

> **Figure 4.2 — Minimal → Structured slope chart.** (Stage `s2_1_strategy_comparison`.) One line per agent × task pair; a downward slope indicates fewer violations under Structured prompting.

Three observations follow. First, the overall direction favours the Structured condition — five of the six pairs slope downward — but the median improvement is 1.5 violations per task, and no comparison approaches statistical significance. Second, the per-agent pattern differs: for Codex the direction is consistent across all three tasks yet the Structured trajectory still accumulates 19 cumulative net-new violations by T3; for Claude the effect is negligible and actually reverses at T3, where the Structured run introduced *more* violations than the Minimal run. Third, and decisive for how these numbers may be read: with three pairs per agent, the smallest two-sided p-value the Wilcoxon signed-rank test can return is 0.25. Even a perfectly consistent effect could not reach conventional significance at this sample size. The per-agent tests are therefore reported as directional evidence only, and no effect-size claim is defensible from one session per condition.

The honest summary is that embedding explicit architectural rules in the prompt did not reliably prevent violations in this experiment. Both Structured trajectories still failed the constraint gate at every task. The interpretation of this result — that prompt persuasion is not a substitute for external enforcement — is developed in Chapter 5.

## 4.4 Differences Between Coding Agents

The two agents differ in overall violation volume, but the more informative difference is in *what* they violate.

On volume, Claude's trajectories end T3 with 8 cumulative net-new violations in both conditions, whereas Codex ends with 33 (Minimal) and 19 (Structured) — roughly a two- to four-fold gap depending on condition. On profile, Figure 4.3 overlays the two agents' mean per-category violation rates from Figure 4.1, and the shapes are qualitatively distinct rather than scaled copies of one another.

> **Figure 4.3 — Agent violation-profile radar chart.** (Stage `s2_2_agent_profile`.) One polygon per agent over the seven affected categories; values as in Figure 4.1.

The single largest differentiator is the ERR category. Codex averaged 7.7 net-new unified-exception violations per evaluation — 62 findings recorded across its six evaluations, all from the same rule — while Claude triggered this rule exactly zero times in six evaluations. Codex consistently raised service-layer failures as generic exceptions instead of routing them through the project's `AppException` hierarchy, and did so under both prompt strategies, including the Structured condition in which the rule was stated in the prompt. Codex also ran higher on duplication (4.67 vs 2.67 mean net-new per evaluation) and on missing migrations (4.17 vs 3.00). In the opposite direction, the small DEP and SIZE counts in this dataset belong to Claude alone: its Structured run introduced two layering violations at T2 that persisted to T3, and its Minimal run was the only trajectory whose cyclomatic-complexity metric drifted beyond the outlier bound (§4.6).

Whether the agents respond differently to prompt structure — a true interaction effect — cannot be tested with one session per cell. Descriptively, the Structured condition was associated with a visible reduction for Codex (33 → 19 cumulative at T3) and none for Claude (8 → 8), which is at least consistent with the intuition that explicit guidance has more room to help the agent with the higher baseline violation rate. This remains a hypothesis for replication, not a finding.

## 4.5 Longitudinal Trajectories Across T1→T3

The longitudinal question is the study's core: does architectural integrity degrade progressively as tasks accumulate on the same workspace, and if so, in what shape? Figure 4.4 plots the cumulative net-new violation trajectories for all four conditions.

> **Figure 4.4 — Cumulative net-new violation trajectories, T1→T3, by condition.** (Stage `s3_1_trajectory_shape`.) Claude · Minimal: 11 → 11 → 8. Claude · Structured: 9 → 9 → 8. Codex · Minimal: 12 → 34 → 33. Codex · Structured: 11 → 25 → 19. All four classify as *plateau-or-decline* on the T2→T3 slope. (The notebook stage plots cumulative *introduced* violations, which sit at most one to two findings above the net figures quoted here because a small number of introduced violations were later resolved.)

Three results emerge.

**Degradation is task-driven, not uniformly accumulative.** The two Claude trajectories are nearly flat: whatever violations Claude introduces, it introduces most of them at T1 and holds roughly steady thereafter. The two Codex trajectories instead spike sharply at T2 — from 12 to 34 (Minimal) and 11 to 25 (Structured) cumulative net-new violations — and then flatten or fall. T2 is the relational-remodel-and-migration task, designed in §3.3 precisely to stress data-contract stability and duplication; the spike lands on the concerns that task was built to probe (CONTRACT and ERR findings multiply there, per the category-level breakdown). The erosion observed in this experiment therefore tracks the structural demands of the task being performed, rather than growing as a constant per-task tax.

**No condition shows accelerating decay within this horizon.** Under the shape classification defined in the analysis plan (comparing the T1→T2 and T2→T3 slopes), all four conditions classify as plateau-or-decline: no trajectory's growth rate increases at T3. A three-point series is far too short for curve fitting, and no regression statistic is reported; but descriptively, the convex, self-accelerating shape that Lehman-style complexity feedback would predict does not appear within three tasks.

**There is measurable, unprompted self-correction.** The run-local net change at T3 — violations introduced minus violations resolved during that task alone — is negative in three of the four conditions: −3 (Claude · Minimal), −1 (Claude · Structured), −1 (Codex · Minimal), and −6 (Codex · Structured). While implementing T3's state-machine requirement, agents incidentally resolved more existing violations than they created, without any instruction to repair the codebase. The effect is small relative to the accumulated debt (Codex · Minimal still carries 33 net-new violations into the final state), but its direction is consistent, and it is the reason every trajectory's final point sits at or below its T2 peak.

## 4.6 Silent Decay: Constraint–Metric Cross-Classification

The study's central methodological hypothesis, formulated in Chapter 3, is that binary constraints and continuous metrics can diverge: a run may pass every pass/fail check while a continuous metric has already drifted materially — *silent decay*. The analysis plan pre-registered a four-way classification for every evaluation: (1) *clean* (constraints pass, no metric decays beyond threshold); (2) *silent decay* (constraints pass, at least one metric decays beyond the interquartile-range outlier bound established in the Stage 1 distribution analysis); (3) *constraints failed* (regardless of metrics); (4) *indeterminate* (error-status metrics prevent classification).

The result is unambiguous and null: **all twelve evaluations fall into class 3, and the silent-decay class is empty.** Figure 4.5 shows the classification.

> **Figure 4.5 — Silent-decay classification of all twelve agent evaluations.** (Stage `s4_1_silent_decay`.) Stacked bars per condition; every evaluation classifies as *constraints failed*; the *clean*, *silent decay*, and *indeterminate* segments are empty.

The reading of this null must be precise. Silent decay is defined conditionally on the constraint gate passing, and in this dataset that precondition never occurred: every run tripped at least one binary constraint from its first task onward (§4.1). The classification therefore does not test whether metrics can detect what constraints miss — the sample never produced a "looks clean" run to test it on. Two explanations remain live. The tasks were deliberately designed to stress the rulepack's concerns, and the rulepack's constraints are strict, so constraint saturation may be an artefact of the experimental design rather than a property of agent behaviour in general; alternatively, binary constraints may simply be more sufficient as a first-line erosion detector than the study's premise assumed. Chapter 5 weighs both.

The metric layer was not idle, however. Read alongside the constraint results, the continuous metrics corroborated and graded the failures rather than diverging from them. Four evaluations additionally exceeded the IQR outlier bound on at least one metric: the Claude · Minimal trajectory's cyclomatic-complexity ratio (`BE-SIZE-M-001`) at T2 and T3, the Codex · Minimal run's frontend clone ratio (`FE-DUP-M-001`) at T1, and both the exception-unification density (`BE-ERR-M-001`) and complexity ratio at Codex · Minimal T3. In each case the outlier metric sits in the same concern family as concurrent constraint findings, so within this sample the two layers acted as severity-graded confirmation of one another rather than as independent detectors.

## 4.7 Secondary Mechanism Analyses

Two supporting analyses complete the mechanism-level picture; both are reported briefly, in proportion to what twelve observations can support.

**Spatial concentration.** Violations cluster in files rather than spreading across the change surface. Table 4.4 reports, per evaluation, the number of files carrying findings, the Gini coefficient of the finding distribution over those files, and the single most-affected file. The top file carries between 25% and 80% of a run's findings; `deal.service.ts` and `contact.service.ts` recur as the hot-spots across conditions and agents. Codex evaluations occupy the concentrated end of the range (Gini 0.29–0.55), Claude's the more moderate end (0.00–0.43). Concentrated failure of this kind is the variant more amenable to targeted intervention — file-scoped review or diff-scope limits — a point taken up in Chapter 5.

**Table 4.4 — Spatial concentration of violations (per evaluation).**

| Condition | Task | Files with findings | Findings | Gini | Top file (share) |
|---|---|---|---|---|---|
| Codex · Minimal | T3 | 4 | 15 | 0.55 | deal.service.ts (0.80) |
| Codex · Minimal | T2 | 8 | 31 | 0.52 | contact.service.ts (0.42) |
| Codex · Structured | T3 | 3 | 13 | 0.46 | deal.service.ts (0.77) |
| Codex · Structured | T2 | 7 | 23 | 0.46 | deal.service.ts (0.43) |
| Claude · Minimal | T1 | 4 | 11 | 0.43 | deal.entity.ts (0.64) |
| Codex · Minimal | T1 | 6 | 12 | 0.39 | deal.entity.ts (0.50) |
| Claude · Structured | T1 | 3 | 9 | 0.37 | deal.entity.ts (0.67) |
| Codex · Structured | T1 | 5 | 11 | 0.29 | deal.entity.ts (0.36) |
| Claude · Minimal | T2 | 7 | 9 | 0.19 | deal-contact.entity.ts (0.33) |
| Claude · Structured | T2 | 6 | 8 | 0.17 | deal-contact-link.entity.ts (0.25) |
| Claude · Structured | T3 | 3 | 4 | 0.17 | deal.service.ts (0.50) |
| Claude · Minimal | T3 | 2 | 2 | 0.00 | deal.service.ts (0.50) |

**Metric correlation structure.** Across the eleven continuous metrics that vary in this dataset, principal-component analysis extracts no dominant factor: the first two components explain 35% and 21% of variance respectively. The metrics are therefore not measuring a single underlying "architectural health" dimension redundantly, which supports reporting them per concern rather than as one composite score. A small number of high pairwise correlations do appear (for example, a strong negative association between DTO-validator coverage and the frontend style-mixing ratio), but with n = 12 evaluations these coefficients are unstable and are flagged for re-examination under replication rather than interpreted here.

## 4.8 Functional and Efficiency Outcomes

The measurements in §4.1–§4.7 concern architectural integrity only. This section reports the separately captured completion and efficiency signals, under the scope boundary established in §3.1: the graded Judgments layer is not implemented, so what follows are completion and effort signals, not graded correctness.

**Self-reported completion versus independent verification diverge.** All twelve runs self-reported success and emitted the completion marker. Independent functional acceptance suites exist only for T1; of the four T1 runs, exactly one — Claude · Structured — passed both suites. The other three (Claude · Minimal, Codex · Minimal, Codex · Structured) failed the backend acceptance suite while still reporting task completion. For T2 and T3 no acceptance suites were defined, and the corresponding cells in Table 4.5 are reported as *skipped* rather than silently treated as passes. On the only task where verification exists, agent self-assessment overstated delivery in three cases out of four.

**Efficiency signals are asymmetric across the two CLIs.** The Claude Code CLI exposes per-task turn counts and billed cost: 97–171 turns and USD 4.81–6.53 per task, with wall-clock durations of 20–26 minutes. The Codex CLI exposes wall-clock duration only: 9.5–15.5 minutes per task. Codex therefore completed tasks in roughly half Claude's wall-clock time while producing two to four times its cumulative violation count (§4.4) — a speed–conformance contrast noted here descriptively and discussed in Chapter 5. Token and cost figures for Codex are unavailable and are reported as such rather than estimated.

**Table 4.5 — Completion, acceptance, and efficiency summary (all agent runs).**

| Condition | Task | Completion marker | Acceptance result | Duration (s) | Turns | Cost (USD) |
|---|---|---|---|---|---|---|
| Claude · Minimal | T1 | yes | **fail** (backend) | 1,210 | 157 | 5.43 |
| Claude · Minimal | T2 | yes | skipped (no suite) | 1,531 | 138 | 5.16 |
| Claude · Minimal | T3 | yes | skipped (no suite) | 1,318 | 142 | 5.83 |
| Claude · Structured | T1 | yes | **pass** | 1,373 | 171 | 6.53 |
| Claude · Structured | T2 | yes | skipped (no suite) | 1,585 | 123 | 5.09 |
| Claude · Structured | T3 | yes | skipped (no suite) | 1,389 | 97 | 4.81 |
| Codex · Minimal | T1 | yes | **fail** (backend) | 573 | n/a | n/a |
| Codex · Minimal | T2 | yes | skipped (no suite) | 775 | n/a | n/a |
| Codex · Minimal | T3 | yes | skipped (no suite) | 682 | n/a | n/a |
| Codex · Structured | T1 | yes | **fail** (backend) | 603 | n/a | n/a |
| Codex · Structured | T2 | yes | skipped (no suite) | 929 | n/a | n/a |
| Codex · Structured | T3 | yes | skipped (no suite) | 668 | n/a | n/a |

*Note: no correctness column appears in this table by design; the acceptance column reports the only independent functional verification available (T1), and turn/cost columns reflect what each CLI exposes.*

## 4.9 Summary of Findings

Against the research objectives, this chapter established the following.

**The data are trustworthy.** Thirteen evaluations, zero harness errors, full protocol completion, and a verified net-delta correction for the baseline's five pre-existing findings (§4.1). All subsequent claims rest on twelve included agent evaluations.

**Architectural integrity degraded in every condition, immediately and specifically (RO3).** Every run failed the constraint gate from T1 onward. Violations concentrate in three concern categories — unified exception handling, duplication, and entity-change migrations — each dominated by a single named rule, and spatially in a handful of backend service and entity files (§4.2, §4.7). Longitudinally, degradation tracked task structure rather than accumulating uniformly: trajectories spike at the schema-remodelling task and partially self-correct at T3, and no condition shows accelerating decay within the three-task horizon (§4.5).

**Prompt structure produced no statistically defensible improvement (RO4).** The direction favours Structured prompting (overall median −1.5 violations per task, p = 0.219), but the effect is small, absent-to-reversed for Claude, and untestable beyond direction at one session per condition. Structured prompts did not prevent constraint failure in any run (§4.3).

**The agents differ more informatively in profile than in volume.** Codex produced two to four times Claude's violation count, but the qualitative signature — an exception-handling monoculture Codex exhibits and Claude entirely lacks, against Claude-only complexity and layering drift — is the finding with direct practical consequence (§4.4).

**The silent-decay hypothesis returned a null with a precise shape.** No run passed constraints, so the divergence the two-layer design was built to catch never had the opportunity to occur; within this sample the metric layer corroborated and graded constraint failures instead of detecting what they missed (§4.6).

**Completion claims overstated verified delivery.** Three of the four independently verifiable runs failed their acceptance suite while self-reporting success, and the faster agent was also the more violation-prone one (§4.8).

Chapter 5 interprets these findings, states the limits within which they hold, and derives the study's practical and methodological implications.
