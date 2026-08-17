#!/usr/bin/env python3
"""analysis.md §2.2 — Pre-existing debt subtraction (net-new violations).

Separates violations baseline already had from violations the agent
introduced, and sanity-checks the delta pipeline with a baseline-vs-baseline
self-comparison (should always be zero).

Reads only data/runs.csv and data/constraint_findings.csv. Writes:
    data/derived/baseline_debt_by_category.csv
    data/derived/baseline_self_check.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import DATA_DIR, DERIVED_DIR  # noqa: E402


def compute_baseline_debt_by_category(constraint_findings: pd.DataFrame) -> pd.DataFrame:
    """category | baseline absolute count | avg agent absolute count | avg net-new (trajectory)."""
    baseline_absolute = (
        constraint_findings.query("session_id == 'baseline' and delta_scope == 'absolute'")
        .groupby("category").size().rename("baseline_absolute_count")
    )
    agent_absolute = (
        constraint_findings.query("session_id != 'baseline' and delta_scope == 'absolute'")
        .groupby(["evaluation_id", "category"]).size()
        .groupby("category").mean().rename("avg_agent_absolute_count")
    )
    trajectory_net_new = (
        constraint_findings.query("delta_scope == 'trajectory_cumulative' and change_type == 'introduced'")
        .groupby(["evaluation_id", "category"]).size()
        .groupby("category").mean().rename("avg_trajectory_net_new")
    )
    table = pd.concat([baseline_absolute, agent_absolute, trajectory_net_new], axis=1).fillna(0)
    return table.reset_index().sort_values("avg_trajectory_net_new", ascending=False)


def compute_baseline_self_check(runs: pd.DataFrame) -> dict:
    """Baseline compared against itself: every delta count must be zero."""
    baseline_rows = runs.loc[runs["session_id"] == "baseline"]
    if baseline_rows.empty:
        return {"status": "no_baseline_row", "passes_self_check": False}

    row = baseline_rows.iloc[0]
    checks = {
        "run_local_introduced_count": int(row["run_local_introduced_count"]),
        "run_local_resolved_count": int(row["run_local_resolved_count"]),
        "trajectory_introduced_count": int(row["trajectory_introduced_count"]),
        "trajectory_resolved_count": int(row["trajectory_resolved_count"]),
    }
    return {
        **checks,
        "passes_self_check": all(value == 0 for value in checks.values()),
    }


def main() -> None:
    runs = pd.read_csv(DATA_DIR / "runs.csv")
    constraint_findings = pd.read_csv(DATA_DIR / "constraint_findings.csv")

    debt_table = compute_baseline_debt_by_category(constraint_findings)
    self_check = compute_baseline_self_check(runs)

    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    debt_table.to_csv(DERIVED_DIR / "baseline_debt_by_category.csv", index=False)
    (DERIVED_DIR / "baseline_self_check.json").write_text(
        json.dumps(self_check, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(debt_table.to_string(index=False))
    print()
    print(f"Baseline self-check passes: {self_check['passes_self_check']}")


if __name__ == "__main__":
    main()
