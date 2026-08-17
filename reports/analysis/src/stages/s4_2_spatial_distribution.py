#!/usr/bin/env python3
"""analysis.md §6.2 — Violation spatial distribution (concentrated vs diffuse).

For each run, measures whether net-new violations concentrate in a handful
of files (agent lost control of one local change) or spread across the
whole changeset (agent's understanding of the overall design is off) using
the Gini coefficient of findings-per-file.

Reads only data/constraint_findings.csv. Writes:
    data/derived/file_concentration.csv (one row per run: n_files, n_findings, gini)
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import DATA_DIR, DERIVED_DIR  # noqa: E402
from stats_utils import gini_coefficient  # noqa: E402


def compute_file_concentration(constraint_findings: pd.DataFrame) -> pd.DataFrame:
    introduced = constraint_findings[
        (constraint_findings["delta_scope"] == "run_local")
        & (constraint_findings["change_type"] == "introduced")
        & (constraint_findings["session_id"] != "baseline")
        & (constraint_findings["file"].notna())
        & (constraint_findings["file"] != "")
    ]

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


def main() -> None:
    constraint_findings = pd.read_csv(DATA_DIR / "constraint_findings.csv")
    concentration = compute_file_concentration(constraint_findings)

    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    concentration.to_csv(DERIVED_DIR / "file_concentration.csv", index=False)

    print(concentration.to_string(index=False))


if __name__ == "__main__":
    main()
