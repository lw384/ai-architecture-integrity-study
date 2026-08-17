#!/usr/bin/env python3
"""analysis.md §3.1 — Violation heatmap (agent x category).

Uses per-step net-new violations (deltas.run_local, "introduced") rather
than absolute counts, so pre-existing baseline debt (§2.2) never leaks into
the picture of where an agent's own changes go wrong.

Reads only data/runs.csv and data/constraint_findings.csv. Writes:
    data/derived/violation_rate_matrix.csv (agent x category mean rate)

§4.2 (s2_2_agent_profile.py) reads this file rather than importing this
module — stages only chain through data/derived/*.csv, never through direct
Python imports of each other, so a change to how this stage computes its
matrix can only affect §4.2 if the column contract of this CSV changes.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import DATA_DIR, DERIVED_DIR  # noqa: E402


def compute_violation_rate_matrix(constraint_findings: pd.DataFrame, runs: pd.DataFrame) -> pd.DataFrame:
    """agent x category matrix: mean introduced-findings count per run.

    Every (agent, run) pair is included in the average even when a category
    never appears in that run (count 0) — otherwise a category the agent
    always avoids would only average over the rare runs where it slipped up.
    """
    agent_runs = runs.loc[runs["session_id"] != "baseline", ["evaluation_id", "agent"]].drop_duplicates()
    introduced = constraint_findings.query(
        "delta_scope == 'run_local' and change_type == 'introduced' and session_id != 'baseline'"
    )
    categories = sorted(introduced["category"].unique())
    if not categories:
        return pd.DataFrame(index=sorted(agent_runs["agent"].unique()))

    counts = (
        introduced.groupby(["evaluation_id", "agent", "category"]).size()
        .rename("count").reset_index()
    )
    grid = agent_runs.merge(pd.DataFrame({"category": categories}), how="cross")
    merged = grid.merge(counts, on=["evaluation_id", "agent", "category"], how="left")
    merged["count"] = merged["count"].fillna(0)

    matrix = merged.groupby(["agent", "category"])["count"].mean().unstack(fill_value=0.0)
    return matrix.reindex(columns=categories)


def main() -> None:
    runs = pd.read_csv(DATA_DIR / "runs.csv")
    constraint_findings = pd.read_csv(DATA_DIR / "constraint_findings.csv")

    matrix = compute_violation_rate_matrix(constraint_findings, runs)

    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    matrix.to_csv(DERIVED_DIR / "violation_rate_matrix.csv")

    print("violation_rate_matrix.csv (mean introduced findings per run, agent x category):")
    print(matrix.round(2).to_string())


if __name__ == "__main__":
    main()
