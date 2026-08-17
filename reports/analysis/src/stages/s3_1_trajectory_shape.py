#!/usr/bin/env python3
"""analysis.md §5.1 — Trajectory curve shape analysis.

Follows each (agent, strategy) condition across the task sequence using
deltas.trajectory_cumulative (net-new violations relative to the *original*
baseline, not the previous step — see ingest.py's note on delta semantics),
then classifies whether the curve looks linear, accelerating (Lehman-style
complexity compounding), or plateauing/declining (self-stabilization).

Reads only data/runs.csv and data/constraint_findings.csv. Writes:
    data/derived/trajectory_totals.csv        (agent x strategy x task_order)
    data/derived/trajectory_by_category.csv   (+ category breakdown)
    data/derived/trajectory_shapes.csv        (classified curve shape per condition)
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import DATA_DIR, DERIVED_DIR  # noqa: E402
from stats_utils import classify_trend_shape  # noqa: E402


def compute_trajectory_totals(runs: pd.DataFrame) -> pd.DataFrame:
    condition = runs.loc[runs["session_id"] != "baseline"].copy()
    return condition[
        ["session_id", "agent", "strategy", "task_id", "task_order", "trajectory_introduced_count"]
    ].sort_values(["agent", "strategy", "task_order"])


def compute_trajectory_by_category(constraint_findings: pd.DataFrame) -> pd.DataFrame:
    introduced = constraint_findings.query(
        "delta_scope == 'trajectory_cumulative' and change_type == 'introduced' and session_id != 'baseline'"
    )
    return (
        introduced.groupby(["agent", "strategy", "task_id", "task_order", "category"])
        .size().rename("count").reset_index()
        .sort_values(["agent", "strategy", "task_order", "category"])
    )


def compute_trajectory_shapes(trajectory_totals: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for (agent, strategy), group in trajectory_totals.groupby(["agent", "strategy"]):
        ordered = group.sort_values("task_order")
        rows.append(
            {
                "agent": agent,
                "strategy": strategy,
                "n_points": len(ordered),
                "final_trajectory_introduced_count": ordered["trajectory_introduced_count"].iloc[-1],
                "shape": classify_trend_shape(ordered["trajectory_introduced_count"].tolist()),
            }
        )
    return pd.DataFrame(rows)


def main() -> None:
    runs = pd.read_csv(DATA_DIR / "runs.csv")
    constraint_findings = pd.read_csv(DATA_DIR / "constraint_findings.csv")

    totals = compute_trajectory_totals(runs)
    by_category = compute_trajectory_by_category(constraint_findings)
    shapes = compute_trajectory_shapes(totals)

    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    totals.to_csv(DERIVED_DIR / "trajectory_totals.csv", index=False)
    by_category.to_csv(DERIVED_DIR / "trajectory_by_category.csv", index=False)
    shapes.to_csv(DERIVED_DIR / "trajectory_shapes.csv", index=False)

    print(totals.to_string(index=False))
    print()
    print(shapes.to_string(index=False))


if __name__ == "__main__":
    main()
