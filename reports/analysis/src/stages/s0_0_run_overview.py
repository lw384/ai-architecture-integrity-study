#!/usr/bin/env python3
"""analysis.md §2.0 — Run-level overview table.

The single "at a glance" status board for every (agent, strategy, task)
run: did the agent finish per protocol, did the Harness evaluation
complete, how many constraint violations did this task step introduce/
resolve on its own, and what's the cumulative net-new violation count
since baseline. Everything else in Stage 0-4 zooms into one slice of this
table; this is meant to be read first, before any other chart.

Also writes a companion table breaking that same current-absolute
violation count down by scope (backend / frontend / cross-stack) for
every (agent, strategy, task) run — the "where do the violations live"
complement to the overview's "how many" total.

Reads only data/runs.csv and data/task_completion.csv. Writes:
    data/derived/run_overview.csv
    data/derived/run_scope_breakdown.csv
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import DATA_DIR, DERIVED_DIR  # noqa: E402

OVERVIEW_COLUMNS = [
    "session_id", "agent", "strategy", "task_id",
    "task_completed", "harness_completed",
    "constraints_introduced_this_task", "constraints_resolved_this_task",
    "cumulative_net_new_violations", "current_absolute_violations",
]

SCOPE_BREAKDOWN_COLUMNS = [
    "session_id", "agent", "strategy", "task_id",
    "backend_findings_absolute", "frontend_findings_absolute",
    "cross_findings_absolute", "total_findings_absolute",
]


def compute_run_overview(runs: pd.DataFrame, task_completion: pd.DataFrame) -> pd.DataFrame:
    harness = runs.loc[
        runs["session_id"] != "baseline",
        [
            "session_id", "task_id", "task_order", "agent", "strategy",
            "execution_status", "run_local_introduced_count", "run_local_resolved_count",
            "trajectory_introduced_count", "total_findings_absolute",
        ],
    ].rename(columns={"execution_status": "harness_execution_status"})

    completion = task_completion.loc[
        task_completion["task_id"].isin(["T1", "T2", "T3"]),
        ["session_id", "task_id", "agent_status"],
    ].rename(columns={"agent_status": "agent_execution_status"})

    overview = harness.merge(completion, on=["session_id", "task_id"], how="left")
    # left join can leave agent_execution_status NaN if execution.json is
    # missing entirely — treat "we don't know" as not-completed, not as True.
    overview["task_completed"] = overview["agent_execution_status"] == "success"
    overview["harness_completed"] = overview["harness_execution_status"] == "completed"

    overview = overview.rename(
        columns={
            "run_local_introduced_count": "constraints_introduced_this_task",
            "run_local_resolved_count": "constraints_resolved_this_task",
            "trajectory_introduced_count": "cumulative_net_new_violations",
            "total_findings_absolute": "current_absolute_violations",
        }
    )
    return overview.sort_values(["agent", "strategy", "task_order"])[OVERVIEW_COLUMNS]


def compute_scope_breakdown(runs: pd.DataFrame) -> pd.DataFrame:
    """Same (agent, strategy, task) grain as compute_run_overview, but split
    current_absolute_violations into its three scopes (backend / frontend /
    cross-stack) instead of collapsing them into one total."""
    breakdown = runs.loc[
        runs["session_id"] != "baseline",
        [
            "session_id", "task_id", "task_order", "agent", "strategy",
            "backend_findings_absolute", "frontend_findings_absolute",
            "cross_findings_absolute", "total_findings_absolute",
        ],
    ]
    return breakdown.sort_values(["agent", "strategy", "task_order"])[SCOPE_BREAKDOWN_COLUMNS]


def main() -> None:
    runs = pd.read_csv(DATA_DIR / "runs.csv")
    task_completion = pd.read_csv(DATA_DIR / "task_completion.csv")

    overview = compute_run_overview(runs, task_completion)
    scope_breakdown = compute_scope_breakdown(runs)

    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    overview.to_csv(DERIVED_DIR / "run_overview.csv", index=False)
    scope_breakdown.to_csv(DERIVED_DIR / "run_scope_breakdown.csv", index=False)

    print(overview.to_string(index=False))

    incomplete = overview.loc[~(overview["task_completed"] & overview["harness_completed"])]
    if not incomplete.empty:
        print(f"\n{len(incomplete)} row(s) not fully completed:")
        print(incomplete[["session_id", "task_id", "task_completed", "harness_completed"]].to_string(index=False))

    print("\nViolations by scope (backend / frontend / cross-stack):")
    print(scope_breakdown.to_string(index=False))


if __name__ == "__main__":
    main()
