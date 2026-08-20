#!/usr/bin/env python3
"""analysis.md §6.2 — Violation spatial distribution (concentrated vs diffuse).

For each run, measures whether net-new violations concentrate in a handful
of files (agent lost control of one local change) or spread across the
whole changeset (agent's understanding of the overall design is off) using
the Gini coefficient of findings-per-file. Also rolls that same per-run
file breakdown up *across* runs, to answer the different, cross-evaluation
question of which files are the repeat offenders.

Reads only data/constraint_findings.csv. Writes:
    data/derived/file_concentration.csv (one row per run: n_files, n_findings, gini)
    data/derived/file_blame_summary.csv (one row per file: totals across all runs)
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import DATA_DIR, DERIVED_DIR  # noqa: E402
from stats_utils import gini_coefficient  # noqa: E402


def filter_introduced(constraint_findings: pd.DataFrame) -> pd.DataFrame:
    """Net-new, run-local findings with a known file — the population both
    tables in this stage are built from."""
    return constraint_findings[
        (constraint_findings["delta_scope"] == "run_local")
        & (constraint_findings["change_type"] == "introduced")
        & (constraint_findings["session_id"] != "baseline")
        & (constraint_findings["file"].notna())
        & (constraint_findings["file"] != "")
    ]


def compute_file_concentration(introduced: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for evaluation_id, group in introduced.groupby("evaluation_id"):
        file_counts = group.groupby("file").size()
        rows.append(
            {
                "evaluation_id": evaluation_id,
                "agent": group["agent"].iloc[0],
                "strategy": group["strategy"].iloc[0],
                "task_id": group["task_id"].iloc[0],
                "n_files_touched": int(file_counts.size),
                "n_findings": int(file_counts.sum()),
                "gini_coefficient": gini_coefficient(file_counts.values),
                "top_file": file_counts.idxmax(),
                "top_file_share": float(file_counts.max() / file_counts.sum()),
            }
        )
    return pd.DataFrame(rows).sort_values("gini_coefficient", ascending=False)


def compute_file_blame_summary(introduced: pd.DataFrame, concentration: pd.DataFrame) -> pd.DataFrame:
    """Same population as compute_file_concentration, rolled up by file
    instead of by run — answers "which files should a targeted code review
    focus on", as distinct from the per-rule question §6.1 answers.
    """
    per_file = introduced.groupby("file").agg(
        n_findings_total=("file", "size"),
        n_evaluations_present=("evaluation_id", "nunique"),
    )
    top_file_counts = concentration["top_file"].value_counts().rename("n_evaluations_as_top_file")

    summary = per_file.join(top_file_counts, how="left")
    summary["n_evaluations_as_top_file"] = summary["n_evaluations_as_top_file"].fillna(0).astype(int)

    grand_total = summary["n_findings_total"].sum()
    summary["share_of_total_pct"] = (
        summary["n_findings_total"] / grand_total * 100 if grand_total else 0.0
    )

    return (
        summary.reset_index()
        .sort_values(["n_findings_total", "n_evaluations_as_top_file"], ascending=False)
        [["file", "n_findings_total", "share_of_total_pct", "n_evaluations_present", "n_evaluations_as_top_file"]]
    )


def main() -> None:
    constraint_findings = pd.read_csv(DATA_DIR / "constraint_findings.csv")
    introduced = filter_introduced(constraint_findings)
    concentration = compute_file_concentration(introduced)
    blame_summary = compute_file_blame_summary(introduced, concentration)

    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    concentration.to_csv(DERIVED_DIR / "file_concentration.csv", index=False)
    blame_summary.to_csv(DERIVED_DIR / "file_blame_summary.csv", index=False)

    print(concentration.to_string(index=False))
    print()
    print(blame_summary.round(2).to_string(index=False))


if __name__ == "__main__":
    main()
