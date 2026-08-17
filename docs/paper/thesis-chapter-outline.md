# Paper Outline + Evidence Map

**Mode:** academic-paper `outline-only` (Phase 0 → 1 → 2) | **Status:** awaiting Phase 2 → 3 approval

## Phase 0 — Paper Configuration Record

| Field | Value |
|---|---|
| Paper type | Thesis chapter |
| Discipline | Software Engineering / Empirical SE |
| Target length | 10,000–15,000 words |
| Language | English (bilingual zh-TW + EN abstract per skill requirement) |
| Citation format | APA 7th edition |
| Output format | Markdown (convertible via `/ars-format-convert` later) |
| Existing materials | Full — literature already verified, methodology already designed, no new literature search needed |
| Structural pattern selected | **IMRaD + dedicated Literature Review** (thesis-chapter variant of Pattern 1) — chosen over plain IMRaD because a thesis chapter conventionally carries its own full-length Related Work section rather than compressing it into the Introduction, and over Pattern 2 (Thematic Lit Review) because the chapter's primary contribution is an empirical measurement system, not a synthesis of others' findings |

---

## Phase 1 — Evidence Inventory (compact; sources already collected and verified in this project)

No new literature search was run — every citation below was already located, verified (DOI/venue cross-checked), and stored in `docs/methodology/metrics-literature-review.md`, `front-metrics-literature-review.md`, and `cross-metrics-literature-review.md` earlier in this project. This phase just re-groups them by the role they play in the paper's argument, distinct from the metric-by-metric grouping in those files.

| Evidence cluster | Sources | Argues for |
|---|---|---|
| Architecture erosion theory | Perry & Wolf (1992); Lehman (1980); van Gurp & Bosch (2002) | Why "architectural integrity under continuous modification" is a real, named phenomenon predating LLMs |
| Classic structural metrics | Martin (1994); MacCormack, Rusnak & Baldwin (2006); MacCormack, Baldwin & Rusnak (2012); Tarjan (1972); Parnas (1972) | Theoretical grounding for the backend/frontend metric formulas themselves |
| Complexity metrics | McCabe (1976); Harrison & Magel (1981); Oman & Hagemeister (1992) | Grounding for SIZE/COM-category metrics |
| Duplication & technical debt | Juergens et al. (2009); Roy, Cordy & Koschke (2009); Fowler (1999) | Grounding for DUP-category metrics; motivates clone ratio as an architecture-not-style concern |
| Cross-stack contract evolution | Espinha, Zaidman & Gross (2014); Sohan, Anslow & Maurer (2015); Gall, Hajek & Jazayeri (1998) | Grounding for the three retained CROSS-* categories (EP/TYPE/PROP) |
| AI coding agent empirics (2022–2026) | Siddiq et al. (2022); Zhu, Tsantalis & Rigby (2026); Agarwal, He & Vasilescu (2026); Sawada et al. (2026); Mazloomzadeh et al. (2026); Ehsani et al. (2026); GitClear (2026, grey lit) | Establishes the research gap and motivates the core hypothesis (Silent Decay / Volume-Quality Inverse Law) |
| Internal project artifacts | `README.md`; `harness/` source; `docs/prompt/*`; `docs/methodology/analysis.md` | Primary methodological description — not literature, but the chapter's own designed system |

---

## Phase 2 — Detailed Outline + Word-Count Allocation + Evidence Mapping

Total target: **~13,300 words** (mid-range of the 10k–15k thesis-chapter band).

### 1. Introduction — 1,300 w

| Subsection | Purpose | Key evidence |
|---|---|---|
| 1.1 Motivation | AI coding agents now modify production codebases iteratively and autonomously; does architecture survive this? | Zhu et al. (2026); Agarwal et al. (2026); GitClear (2026) |
| 1.2 Problem statement | Binary pass/fail architecture checks can miss continuous drift — introduce "Silent Decay" as the named gap | Lehman (1980); internal: `analysis.md` §Stage 4.1 |
| 1.3 Research questions | RQ1: Does architectural integrity degrade under iterative agent modification? RQ2: Do binary constraints and continuous metrics diverge (Silent Decay)? RQ3: Does explicit architectural guidance (structured vs. minimal prompting) change the trajectory? | — |
| 1.4 Contributions | (a) a 3-layer, literature-grounded evaluation harness; (b) a minimum-covering-set metric design method reusable across backend/frontend/cross-stack; (c) an entangled 3-task experimental design isolating architectural guidance as a single IV | Internal: harness design itself |
| 1.5 Chapter roadmap | One paragraph, standard | — |

### 2. Related Work — 2,800 w

| Subsection | Purpose | Key evidence |
|---|---|---|
| 2.1 Architecture erosion and evolution theory | Establish the phenomenon as pre-existing and theoretically grounded, not an AI-specific invention | Perry & Wolf (1992); Lehman (1980); van Gurp & Bosch (2002) |
| 2.2 Coupling, instability, and DSM-based metrics | Ground Instability and Propagation Cost as the theoretical basis for the DEP-category metrics | Martin (1994); MacCormack et al. (2006, 2012); Tarjan (1972) |
| 2.3 Complexity and cohesion metrics | Ground SIZE/COM-category metrics; note the deliberate choice of complexity-type over volume-type metrics as a recurring design principle | McCabe (1976); Harrison & Magel (1981); Chidamber & Kemerer (1994) |
| 2.4 Duplication as an architectural (not stylistic) concern | Ground DUP-category metrics and the clone-ratio implementation | Juergens et al. (2009); Roy, Cordy & Koschke (2009); Fowler (1999) |
| 2.5 Cross-stack contract drift | Ground the 3 retained cross-stack categories; explain why EP/TYPE/PROP were kept and METHOD/NAME/ERR/DUP were pruned | Espinha et al. (2014); Sohan et al. (2015); Gall, Hajek & Jazayeri (1998); Parnas (1972) |
| 2.6 Empirical studies of AI coding agents | Survey the 2022–2026 empirical literature on agent-introduced code/architecture quality issues | Siddiq et al. (2022); Zhu et al. (2026); Agarwal et al. (2026); Sawada et al. (2026); Mazloomzadeh et al. (2026); Ehsani et al. (2026) |
| 2.7 Research gap | Existing work measures either (a) isolated static-analysis metrics without a harness tying them to explicit architectural rules, or (b) agent productivity/PR-acceptance without architecture-specific instrumentation. No prior work combines a rule-linked constraint+metric harness with a controlled prompt-strategy manipulation over an entangled multi-task trajectory. | Synthesis of 2.1–2.6 |

### 3. System and Methodology — 3,600 w

| Subsection | Purpose | Key evidence |
|---|---|---|
| 3.1 Study design overview | Introduce the 3-layer evaluation model (constraints / metrics / judgments); state upfront that the judgments layer is designed but not implemented — scope is architectural integrity, not functional correctness | Internal: harness `manifest.yaml` design |
| 3.2 Baseline system | Full-stack CRM: NestJS + TypeORM + PostgreSQL backend, React + MUI frontend; why a real, non-toy full-stack app was chosen | `README.md` |
| 3.3 Evaluation harness architecture | Rulepack structure, constraint/metric adapters, dependency-cruiser + AST-based analysis, `evaluation.json` schema (`deltas.run_local` vs `deltas.trajectory_cumulative`) | `harness/` source; `evaluate.mjs` |
| 3.4 Backend metrics matrix | 9-category minimum covering set; the "complexity/boundary over volume/count" selection principle; worked example (DEP category: Tarjan-based cycle detection + MVC-direction density) | `metrics-literature-review.md` Part 1 |
| 3.5 Frontend metrics matrix | 7-category matrix; same selection principle applied to JSX/React idioms | `front-metrics-literature-review.md` Part 1 |
| 3.6 Cross-stack metrics and constraints | Pruning rationale (7 → 3 categories); constraint (binary) vs. metric (continuous) co-design for EP/TYPE/PROP; the PROP metric's diff-driven (not snapshot-driven) implementation requirement | `cross-metrics-literature-review.md` Parts 1–2 |
| 3.7 Experimental design | `prompt_strategy` as the sole manipulated IV (minimal vs. structured); the decision to treat Block 5 (API contract) and Block 6 (rules) jointly as one architectural-guidance IV, with rationale; the T1→T2→T3 entangled task trajectory (greenfield module → relational remodel+migration → state-machine invariant with a built-in dual-entry-point DUP stress test) | `Prompt Design Meta-Template V2.md`; `T1/T2/T3_{minimal,structured}.md` |

### 4. Data Collection and Analysis Plan — 2,600 w

| Subsection | Purpose | Key evidence |
|---|---|---|
| 4.1 Run and trajectory data schema | `evaluation.json` structure; run-local vs. cumulative deltas; `manifest.json` state machine | Internal artifacts |
| 4.2 Data-quality handling | Pre-existing baseline violations (net-delta correction); metric `status: "error"` handling as a distinct category, not zero | `analysis.md` Stage 0 |
| 4.3 Five-stage analysis framework | Reproduce the Stage 0–4 structure (cleaning → descriptive → comparative → longitudinal → mechanism mining) as the chapter's analysis protocol | `analysis.md` full |
| 4.4 Primary hypothesis operationalization | Silent Decay: formal definition as the joint event {constraints = pass, ≥1 metric delta exceeds the Stage-1 significance threshold} | `analysis.md` Stage 4.1 |
| 4.5 Secondary analyses | Violation heatmap by category; minimal vs. structured paired comparison; longitudinal trajectory shape (linear / convex / plateau); spatial concentration (Lorenz curve); metric correlation structure (PCA) | `analysis.md` Stages 1–4 |

### 5. Findings — 2,000 w *(status-dependent placeholder — see note below)*

| Subsection | Purpose | Key evidence |
|---|---|---|
| 5.1 Data collection status at time of writing | State plainly how many trajectories/runs had been completed when this chapter was drafted | To be filled from actual run logs |
| 5.2 Reporting structure | Mirror analysis.md Stages 1–4 exactly, so each finding maps back to a named analysis step | `analysis.md` |
| 5.3 Framing of anticipated patterns | Any pattern stated before full data collection must be framed as a hypothesis grounded in cited literature (e.g., "consistent with Zhu et al.'s (2026) Volume-Quality Inverse Law, we expect...") — never presented as an observed result | Zhu et al. (2026); Agarwal et al. (2026) |

> **⚠️ Flag for user confirmation**: This section is a placeholder in the literal sense — I don't have access to a completed batch of trajectory runs in this session. If you already have run data, tell me where the aggregated `evaluation.json` files live and I can turn §5 into real findings before drafting; if data collection is still in progress, §5 should stay a "planned reporting structure" until then, and the chapter should probably be finalized in two passes (methodology now, findings once runs complete).

### 6. Discussion — 1,600 w

| Subsection | Purpose | Key evidence |
|---|---|---|
| 6.1 Interpreting Silent Decay | Connect the (hypothesized/observed) constraint–metric divergence to Lehman's complexity-increase law and Zhu et al.'s Volume-Quality Inverse Law | Lehman (1980); Zhu et al. (2026) |
| 6.2 Implications for AI-assisted SE practice | What a two-layer (binary + continuous) evaluation buys a team that CI linting alone does not | Synthesis |
| 6.3 Implications for prompt engineering | Does bundling architectural guidance with API-contract detail (the Block 5+6 IV) actually change agent behavior — first empirical test of this specific framing | Internal: §3.7 design |

### 7. Limitations — 900 w

| Subsection | Purpose | Key evidence |
|---|---|---|
| 7.1 Functional correctness out of scope | Judgments layer designed but not implemented under time constraints; findings speak to architecture only | Internal: harness design; explicit prior-turn scope declaration |
| 7.2 Single case-study system | Generalizability beyond a CRM-shaped full-stack app is untested | — |
| 7.3 Task-size confound | T1/T2/T3 have unequal requirement counts (~24/~40/~39); cross-task comparisons should be read as normalized, not raw | `T1/T2/T3_structured.md` requirement counts |
| 7.4 Harness/rulepack maturity | Cross-stack rulepack is `migration_status: experimental`; some metrics (e.g., TEST, ROUTE) are acknowledged proxy-only, not direct measurements | `cross-metrics-literature-review.md`; `metrics-literature-review.md` |
| 7.5 Tool reliability | Metric `status: "error"` events observed even on baseline-only runs; must be reported as a distinct failure category | `analysis.md` Stage 0.1 |

### 8. Conclusion and Future Work — 700 w

| Subsection | Purpose | Key evidence |
|---|---|---|
| 8.1 Summary | Restate RQ1–3 answers at whatever confidence the available data supports | — |
| 8.2 Future work | Implement the judgments layer; author the T4 multi-step trajectory; add DSM Core Size / LCOM cohesion metrics; revisit the 4 pruned cross-stack categories once EP/TYPE/PROP are validated | Forward references to earlier "建议新增" items across the three metrics docs |

---

## Mandatory inclusions (per skill Quality Standards)

Data Availability Statement, Ethics Declaration, Author Contributions (CRediT), Conflict of Interest Statement, Funding Acknowledgment, AI-disclosure statement — all required before Phase 7 formatting; not yet drafted at outline stage.

---

## Section count vs. word budget sanity check

8 top-level sections, 1,300 + 2,800 + 3,600 + 2,600 + 2,000 + 1,600 + 900 + 700 = **13,300 words**, inside the 10k–15k thesis-chapter band. §2 (Related Work) and §3 (Methodology) carry the most weight, appropriate for a chapter whose primary contribution is the measurement system itself rather than a large results set.
