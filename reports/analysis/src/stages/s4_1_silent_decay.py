#!/usr/bin/env python3
"""analysis.md §6.1 — Silent decay, evaluated per concern (not per run).

Passing constraints (binary pass/fail) does not mean the architecture held
steady — a continuous metric can already be degrading in the same run. The
question this stage answers is "is that true anywhere", and answering it
requires asking at the same grain the binary/continuous pair is actually
defined at: each of the 19 concerns (Appendix A / Table 3.2) has its own
constraint rule(s) *and* its own representative metric covering the same
concern (e.g. BE-SIZE-C-001's parameter-count constraint alongside
BE-SIZE-M-001's cyclomatic-complexity metric). "Silent" only means anything
scoped to one concern: did *this concern's* binary gate pass while *this
concern's* metric already shows decay.

An earlier version of this stage asked the question at run grain instead
(did *any* of the 36 constraint rules across all 19 concerns fail this
run) before looking at any metric. That check is almost never true in a
dataset where every run fails at least one constraint somewhere — in this
dataset it is never true, so every run got swept into `constraints_failed`
regardless of what its metrics showed, even the 4 runs (of 12) where a
metric unrelated to the failing constraint was *also* a bad-side IQR
outlier. Scoping both sides to the same concern removes that masking.

"Bad side" uses the metric's own `direction` field (from
metric_observations.csv) against the IQR fences s1_2_metric_distribution.py
already computed (reused via its derived CSV, not recomputed here, so the
two stages can never silently disagree on what "significant" means).

BE-MOCK-M-001 is the metric Appendix A designates as representative for
the BE-TEST concern; BE-TEST-M-001 (test coverage) is excluded from
architectural analysis per §3.4.3 (reported separately in §4.8) and is
never assigned to a concern here — see taxonomy.py.

Run s1_2_metric_distribution.py first. Reads data/runs.csv,
data/constraint_findings.csv, data/metric_observations.csv, and
data/derived/metric_distribution_bounds.csv. Writes:
    data/derived/silent_decay_by_concern.csv  (evaluation x concern, 12x19 rows)
    data/derived/silent_decay_run_summary.csv (one row per evaluation)
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import DATA_DIR, DERIVED_DIR  # noqa: E402
from taxonomy import (  # noqa: E402
    ARCHITECTURAL_METRIC_EXCLUSIONS,
    CONCERN_ORDER,
    metric_concern,
    subject_and_category,
)

CLASSIFICATION_ORDER = ["clean", "silent_decay", "constraints_failed", "indeterminate_metric_error"]
BY_CONCERN_COLUMNS = [
    "evaluation_id", "session_id", "task_id", "agent", "strategy",
    "concern", "layer", "constraint_failed",
    "metric_name", "metric_value", "metric_status", "direction", "metric_bad_outlier",
    "classification",
]


def _is_bad_outlier(value: float, direction: str, low: float, high: float) -> bool:
    if pd.isna(value) or pd.isna(low) or pd.isna(high):
        return False
    if direction == "higher_is_better":
        return value < low
    return value > high  # default / lower_is_better


def _concern_constraint_failures(constraint_findings: pd.DataFrame) -> pd.DataFrame:
    """(evaluation_id, concern) pairs where this task's own run_local diff
    introduced at least one violation under that concern — same run_local
    semantics ingest.py's whole-run `constraint_result` uses, just scoped
    down to one concern instead of all 36 rules at once."""
    introduced = constraint_findings.query(
        "delta_scope == 'run_local' and change_type == 'introduced' and session_id != 'baseline'"
    ).copy()
    parsed = introduced["rule_id"].apply(subject_and_category)
    introduced["concern"] = [f"{subj}-{cat}" for subj, cat in parsed]
    failed = introduced[["evaluation_id", "concern"]].drop_duplicates()
    failed["constraint_failed"] = True
    return failed


def _concern_metrics(metric_observations: pd.DataFrame, bounds: pd.DataFrame) -> pd.DataFrame:
    """One row per (evaluation_id, concern) with that concern's representative
    metric's value/status/bad-outlier flag. 1:1 by construction — every
    concern in CONCERN_ORDER has exactly one non-excluded metric."""
    architectural = metric_observations.loc[
        ~metric_observations["metric_name"].isin(ARCHITECTURAL_METRIC_EXCLUSIONS)
    ].copy()
    architectural["concern"] = architectural["metric_name"].apply(metric_concern)

    merged = architectural.merge(
        bounds[["metric_name", "iqr_low", "iqr_high"]], on="metric_name", how="left"
    )
    merged["metric_bad_outlier"] = merged.apply(
        lambda r: _is_bad_outlier(r["value"], r["direction"], r["iqr_low"], r["iqr_high"]), axis=1
    )
    return merged.rename(columns={"value": "metric_value", "status": "metric_status"})[
        ["evaluation_id", "concern", "metric_name", "metric_value", "metric_status", "direction", "metric_bad_outlier"]
    ]


def classify_by_concern(
    runs: pd.DataFrame,
    constraint_findings: pd.DataFrame,
    metric_observations: pd.DataFrame,
    bounds: pd.DataFrame,
) -> pd.DataFrame:
    agent_runs = runs.loc[
        runs["session_id"] != "baseline", ["evaluation_id", "session_id", "task_id", "agent", "strategy"]
    ]
    grid = agent_runs.merge(pd.DataFrame(CONCERN_ORDER, columns=["concern", "layer"]), how="cross")

    grid = grid.merge(_concern_constraint_failures(constraint_findings), on=["evaluation_id", "concern"], how="left")
    grid["constraint_failed"] = grid["constraint_failed"].fillna(False)

    grid = grid.merge(_concern_metrics(metric_observations, bounds), on=["evaluation_id", "concern"], how="left")
    grid["metric_bad_outlier"] = grid["metric_bad_outlier"].fillna(False)

    def classify(row) -> str:
        if row["metric_status"] == "error":
            return "indeterminate_metric_error"
        if row["constraint_failed"]:
            return "constraints_failed"
        if row["metric_bad_outlier"]:
            return "silent_decay"
        return "clean"

    grid["classification"] = grid.apply(classify, axis=1)
    return grid.sort_values(["agent", "strategy", "task_id", "concern"])[BY_CONCERN_COLUMNS]


def compute_run_summary(by_concern: pd.DataFrame) -> pd.DataFrame:
    """Roll the 19-concern-per-run grid back up to one row per evaluation,
    so a run can still be scanned at a glance while keeping the underlying
    per-concern detail available in silent_decay_by_concern.csv."""
    counts = (
        by_concern.groupby("evaluation_id")["classification"]
        .value_counts().unstack(fill_value=0)
        .reindex(columns=CLASSIFICATION_ORDER, fill_value=0)
    )
    silent_concerns = (
        by_concern.loc[by_concern["classification"] == "silent_decay"]
        .groupby("evaluation_id")["concern"]
        .apply(lambda s: " | ".join(s))
    )
    meta = by_concern[["evaluation_id", "session_id", "task_id", "agent", "strategy"]].drop_duplicates()

    summary = meta.merge(counts, on="evaluation_id", how="left").merge(
        silent_concerns.rename("silent_decay_concerns"), on="evaluation_id", how="left"
    )
    summary["silent_decay_concerns"] = summary["silent_decay_concerns"].fillna("")
    summary["any_silent_decay"] = summary["silent_decay"] > 0
    return summary.sort_values(["agent", "strategy", "task_id"])


def main() -> None:
    runs = pd.read_csv(DATA_DIR / "runs.csv")
    constraint_findings = pd.read_csv(DATA_DIR / "constraint_findings.csv")
    metric_observations = pd.read_csv(DATA_DIR / "metric_observations.csv")
    bounds_path = DERIVED_DIR / "metric_distribution_bounds.csv"
    if not bounds_path.exists():
        raise FileNotFoundError(f"{bounds_path} not found — run s1_2_metric_distribution.py first.")
    bounds = pd.read_csv(bounds_path)

    by_concern = classify_by_concern(runs, constraint_findings, metric_observations, bounds)
    run_summary = compute_run_summary(by_concern)

    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    by_concern.to_csv(DERIVED_DIR / "silent_decay_by_concern.csv", index=False)
    run_summary.to_csv(DERIVED_DIR / "silent_decay_run_summary.csv", index=False)

    counts = by_concern["classification"].value_counts().reindex(CLASSIFICATION_ORDER, fill_value=0)
    print(f"Across all {len(by_concern)} (evaluation, concern) cells:")
    print(counts.to_string())
    print()

    silent = by_concern.loc[by_concern["classification"] == "silent_decay"]
    if not silent.empty:
        print(f"{len(silent)} silent-decay cells (constraint passed, metric a bad-side outlier):")
        print(silent[["evaluation_id", "concern", "metric_name", "metric_value"]].to_string(index=False))
    else:
        print("No silent-decay cells in this dataset.")

    print(f"\n{int(run_summary['any_silent_decay'].sum())}/{len(run_summary)} evaluations have at least one "
          "silent-decay concern.")


if __name__ == "__main__":
    main()
