# Architecture Integrity Analysis

Implements the five-stage analysis plan in
[`docs/methodology/analysis.md`](../../docs/methodology/analysis.md). Read
that document first — it explains *why* each stage exists and what
conclusion each chart is supposed to support. This directory is the *how*.

## Layout

```
reports/analysis/
├── data/
│   ├── runs.csv                  # one row per harness evaluation (+ baseline)
│   ├── constraint_findings.csv   # one row per constraint finding
│   ├── metric_observations.csv   # one row per metric observation
│   ├── task_completion.csv       # one row per agent execution attempt
│   ├── review_runs.csv           # one row per T5 self-review
│   ├── review_findings.csv       # one row per T5 self-reported finding
│   └── derived/                  # one CSV/JSON per stage script (see below)
├── src/
│   ├── ingest.py                 # the ONLY file that reads raw JSON/YAML
│   ├── update_all.py             # orchestrator: ingest.py + every stage script, in order
│   ├── paths.py                  # shared path constants
│   ├── taxonomy.py               # rule_id / metric name -> category
│   ├── stats_utils.py            # IQR fences, Gini, paired Wilcoxon, trend shape
│   ├── charts.py                 # matplotlib/seaborn drawing primitives
│   └── stages/
│       ├── s0_0_run_overview.py        # §2.0 Run-level overview table
│       ├── s0_1_reliability.py         # §2.1 Harness reliability
│       ├── s0_2_baseline_debt.py       # §2.2 Pre-existing debt subtraction
│       ├── s0_3_task_completion.py     # §2.3 Task completion gate
│       ├── s1_1_violation_heatmap.py   # §3.1 Violation heatmap
│       ├── s1_2_metric_distribution.py # §3.2 Metric distribution overview
│       ├── s2_1_strategy_comparison.py # §4.1 minimal vs structured
│       ├── s2_2_agent_profile.py       # §4.2 Agent architecture personality
│       ├── s3_1_trajectory_shape.py    # §5.1 Trajectory curve shape
│       ├── s4_1_silent_decay.py        # §6.1 Silent decay
│       ├── s4_2_spatial_distribution.py# §6.2 Violation spatial distribution
│       ├── s4_3_metric_correlation.py  # §6.3 Metric correlation structure
│       └── s4_4_review_calibration.py  # §6.4 Agent self-assessment calibration
└── notebook/
    └── analysis.ipynb            # the only place charts get rendered
```

File names carry the doc's section numbers (`s2_1` ↔ `§4.1`) so you can
jump between the methodology and the code in either direction.

## Data flow

```
reports/experiments/session_*/T*/harness_evaluation.json  ─┐
reports/experiments/session_*/T*/execution.json            ─┤
reports/experiments/session_*/T*/test_result.json          ─┤   src/ingest.py
reports/experiments/session_*/T*/test_execution.json       ─┤   (CLI, pandas)
reports/experiments/session_*/T*/acceptance_runs/*/*.json  ─┤   highest adapter version,
                                                           │   then newest run
reports/experiments/session_*/session_manifest.yaml        ─┤
reports/baseline/harness_evaluation.json                   ─┘
                        │
                        ▼
                   data/*.csv
                        │
         ┌──────────────┼──────────────────────────────┐
         ▼              ▼                               ▼
  src/stages/s*.py  (each reads only data/*.csv,   data/derived/*.csv
                      writes its own data/derived/*.csv)
                        │
                        ▼
              notebook/analysis.ipynb
         (reads data/ + data/derived/, draws charts only)
```

**Isolation rule**: stage scripts under `src/stages/` never `import` each
other. Two stages (`s2_2_agent_profile.py` reading `s1_1`'s output,
`s4_1_silent_decay.py` reading `s1_2`'s output — matching the explicit
reuse the methodology doc calls for) chain through their **derived CSV
file**, not through Python code. Editing how a stage computes its own
numbers can only break a downstream stage if the *column contract* of its
output CSV changes — a visible, intentional interface change, not a silent
code coupling.

`src/paths.py` and `src/taxonomy.py` are shared, but they're data
**contracts** (path layout, rule-id → category mapping), not business
logic — the same spirit as sharing a schema without sharing an analysis.
`src/stats_utils.py` and `src/charts.py` are shared pure-function
libraries (math / drawing) with no opinion about runs, tasks, or agents.

## Running it

```bash
cd reports/analysis
pip install -r requirements.txt   # or: ../../.venv-notebook/bin/pip install -r requirements.txt
```

### Update everything after `reports/experiments/` changes

```bash
python3 src/update_all.py             # ingest.py + all 13 stage scripts, in dependency order
python3 src/update_all.py --notebook  # ...and also re-execute notebook/analysis.ipynb in place
```

`update_all.py` stops at the first script that fails, so you never end up
with some `data/derived/*.csv` files refreshed and others stale. It's just
an orchestrator — it doesn't contain any parsing/analysis logic of its own.

Then open `notebook/analysis.ipynb` (kernel: **AI Architecture Study
(.venv-notebook)** / `aais-notebook`) and run all cells to look at the
updated charts — or pass `--notebook` above to have it re-executed and
saved in place without opening Jupyter at all. Every chart title/axis/
legend is English by design; none of the plotting code in `charts.py`
hardcodes domain text — the notebook supplies it.

### Running one thing at a time

Every stage script is also independently runnable and prints a short
summary to stdout, in case you only want to re-check one thing without
regenerating everything:

```bash
python3 src/ingest.py

python3 src/stages/s0_0_run_overview.py
python3 src/stages/s0_1_reliability.py
python3 src/stages/s0_2_baseline_debt.py
python3 src/stages/s0_3_task_completion.py
python3 src/stages/s1_1_violation_heatmap.py     # must run before s2_2
python3 src/stages/s1_2_metric_distribution.py   # must run before s4_1
python3 src/stages/s2_1_strategy_comparison.py
python3 src/stages/s2_2_agent_profile.py
python3 src/stages/s3_1_trajectory_shape.py
python3 src/stages/s4_1_silent_decay.py
python3 src/stages/s4_2_spatial_distribution.py
python3 src/stages/s4_3_metric_correlation.py
python3 src/stages/s4_4_review_calibration.py
```

## Reading the current output

The experiment is still in progress (13 harness evaluations across 4
sessions as of this writing — a full `agent × strategy` 2×2 design across
T1–T3, no reruns). Two things in the current notebook output are expected
artifacts of that small sample, not bugs:

- **§6.1 silent decay is currently empty.** In this dataset every agent run
  introduces at least one new constraint violation (`constraint_result ==
  "failed"` for all 12 non-baseline runs), so no run reaches the "looks
  clean but a metric already decayed" branch. This should start
  differentiating once some runs pass constraints cleanly.
- **§4.1's Wilcoxon tests have `n_pairs = 3` per agent.** With this few
  pairs, the smallest two-sided p-value Wilcoxon can ever return is 0.25 —
  even a perfectly consistent effect cannot reach conventional
  significance yet. Treat these as directional, not confirmatory, until
  more independent sessions (not more tasks within one session) land —
  see the "is this meaningful" discussion in the project's working notes:
  the real gap right now is **no replication across sessions within the
  same condition** (each `agent × strategy` cell has exactly one session),
  not sample size within a session.

**A parser note**: `src/ingest.py` re-parses each `T5/review.md` itself
rather than trusting the archived `T5/findings.json`. One real run's
`findings.json` reported `status: "parse_incomplete"` with zero findings
because the agent answered with a Markdown table instead of the bullet
list `T5.md` asks for, and the upstream parser
(`experiment/instruments/agent-runners/review_runner.py`) only recognizes
the bullet form. `ingest.py`'s parser accepts both, so `data/review_
findings.csv` reflects what the review actually said. The upstream bug is
worth fixing separately in `review_runner.py`; it's outside this package.

Run `python3 src/update_all.py --notebook` whenever `reports/experiments/`
gains new sessions.
