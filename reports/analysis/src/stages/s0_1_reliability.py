#!/usr/bin/env python3
"""analysis.md §2.1 — Harness reliability check.

Separates "the agent broke the architecture" from "the evaluation tool
crashed" before any downstream stage treats a tool failure as an
architecture-degradation signal.

Reads only data/runs.csv and data/metric_observations.csv (never the raw
harness_evaluation.json files — see src/ingest.py). Writes:
    data/derived/metric_error_rates.csv
    data/derived/run_reliability.csv
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import DATA_DIR, DERIVED_DIR  # noqa: E402

RUN_COLUMNS = [
    "evaluation_id", "session_id", "task_id", "agent", "strategy",
    "execution_status", "comparison_status", "backend_status", "frontend_status",
    "cross_status", "scope_errors", "metric_errors", "metric_coverage",
]


def compute_metric_error_rates(metric_observations: pd.DataFrame) -> pd.DataFrame:
    """One row per metric: how often it came back status="error" across all runs."""
    grouped = metric_observations.groupby(["metric_name", "category"]).agg(
        total_observations=("status", "size"),
        error_observations=("status", lambda s: (s == "error").sum()),
    )
    grouped["error_rate"] = grouped["error_observations"] / grouped["total_observations"]
    return grouped.reset_index().sort_values("error_rate", ascending=False)


def compute_run_reliability(runs: pd.DataFrame) -> pd.DataFrame:
    """One row per run, flagged reliable/unreliable for downstream inclusion."""
    reliability = runs[RUN_COLUMNS].copy()
    reliability["is_reliable"] = (
        (runs["execution_status"] == "completed")
        & (runs["comparison_status"] == "valid")
        & (runs["scope_errors"] == 0)
    )
    return reliability.sort_values(["is_reliable", "evaluation_id"])


def main() -> None:
    runs = pd.read_csv(DATA_DIR / "runs.csv")
    metric_observations = pd.read_csv(DATA_DIR / "metric_observations.csv")

    error_rates = compute_metric_error_rates(metric_observations)
    reliability = compute_run_reliability(runs)

    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    error_rates.to_csv(DERIVED_DIR / "metric_error_rates.csv", index=False)
    reliability.to_csv(DERIVED_DIR / "run_reliability.csv", index=False)

    unreliable = (~reliability["is_reliable"]).sum()
    print(f"metric_error_rates.csv: {len(error_rates)} metrics")
    print(f"run_reliability.csv: {len(reliability)} runs, {unreliable} flagged unreliable")
    if unreliable:
        print(reliability.loc[~reliability["is_reliable"], ["evaluation_id", "backend_status", "frontend_status", "cross_status", "scope_errors"]])


if __name__ == "__main__":
    main()
