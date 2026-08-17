#!/usr/bin/env python3
"""analysis.md §6.1 — Silent decay.

Passing constraints (binary pass/fail) does not mean the architecture held
steady — a continuous metric can already be degrading in the same run.
Crosses each run's constraint_result against whether any of its metrics is
a "significant" outlier on the bad side, using the exact IQR fences
s1_2_metric_distribution.py already computed (reused via its derived CSV,
not recomputed here, so the two stages can never silently disagree on what
"significant" means).

"Bad side" uses delta_trajectory_cumulative's direction (== score.value's
own direction, since delta_vs_baseline is baseline-relative — see
ingest.py) but the outlier test itself is applied to the run's raw value
against the IQR fence, per §3.2/§6.1's own wording ("用 3.2 的分布定的阈值").

Run s1_2_metric_distribution.py first. Reads data/runs.csv,
data/metric_observations.csv, and data/derived/metric_distribution_bounds.csv.
Writes:
    data/derived/silent_decay_classification.csv
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import DATA_DIR, DERIVED_DIR  # noqa: E402

CLASSIFICATION_ORDER = ["clean", "silent_decay", "constraints_failed", "indeterminate_metric_error"]


def _is_bad_outlier(value: float, direction: str, low: float, high: float) -> bool:
    if pd.isna(value) or pd.isna(low) or pd.isna(high):
        return False
    if direction == "higher_is_better":
        return value < low
    return value > high  # default / lower_is_better


def classify_runs(
    runs: pd.DataFrame,
    metric_observations: pd.DataFrame,
    bounds: pd.DataFrame,
) -> pd.DataFrame:
    merged = metric_observations.merge(
        bounds[["metric_name", "iqr_low", "iqr_high"]], on="metric_name", how="left"
    )
    merged["is_bad_outlier"] = merged.apply(
        lambda r: _is_bad_outlier(r["value"], r["direction"], r["iqr_low"], r["iqr_high"]), axis=1
    )

    per_run = merged.groupby("evaluation_id").agg(
        has_metric_error=("status", lambda s: (s == "error").any()),
        has_bad_outlier=("is_bad_outlier", "any"),
        bad_outlier_metrics=("metric_name", lambda names: " | ".join(
            n for n, o in zip(names, merged.loc[names.index, "is_bad_outlier"]) if o
        )),
    )

    result = runs.loc[runs["session_id"] != "baseline"].merge(per_run, on="evaluation_id", how="left")
    result["has_metric_error"] = result["has_metric_error"].fillna(False)
    result["has_bad_outlier"] = result["has_bad_outlier"].fillna(False)

    def classify(row) -> str:
        if row["has_metric_error"]:
            return "indeterminate_metric_error"
        if row["constraint_result"] == "failed":
            return "constraints_failed"
        if row["has_bad_outlier"]:
            return "silent_decay"
        return "clean"

    result["classification"] = result.apply(classify, axis=1)
    return result[
        [
            "evaluation_id", "session_id", "task_id", "agent", "strategy",
            "constraint_result", "has_metric_error", "has_bad_outlier",
            "bad_outlier_metrics", "classification",
        ]
    ]


def main() -> None:
    runs = pd.read_csv(DATA_DIR / "runs.csv")
    metric_observations = pd.read_csv(DATA_DIR / "metric_observations.csv")
    bounds_path = DERIVED_DIR / "metric_distribution_bounds.csv"
    if not bounds_path.exists():
        raise FileNotFoundError(f"{bounds_path} not found — run s1_2_metric_distribution.py first.")
    bounds = pd.read_csv(bounds_path)

    classification = classify_runs(runs, metric_observations, bounds)

    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    classification.to_csv(DERIVED_DIR / "silent_decay_classification.csv", index=False)

    counts = classification["classification"].value_counts().reindex(CLASSIFICATION_ORDER, fill_value=0)
    print(counts.to_string())
    print()
    silent = classification.loc[classification["classification"] == "silent_decay"]
    if not silent.empty:
        print("Silent decay runs:")
        print(silent[["evaluation_id", "bad_outlier_metrics"]].to_string(index=False))


if __name__ == "__main__":
    main()
