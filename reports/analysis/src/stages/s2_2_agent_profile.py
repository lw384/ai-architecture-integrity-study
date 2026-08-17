#!/usr/bin/env python3
"""analysis.md §4.2 — Agent "architecture personality" comparison.

Takes each agent's row out of §3.1's heatmap matrix and compares the
*shape* of the 9-category violation profile (via a radar chart in the
notebook), not just its overall size.

Reads data/derived/violation_rate_matrix.csv — the file s1_1_violation_
heatmap.py produces — rather than importing that module directly. Stages
only chain through data/derived/*.csv, never through Python imports of each
other, so this file only breaks if s1_1's *output contract* changes, not
its internal implementation.

Run s1_1_violation_heatmap.py first. Writes:
    data/derived/agent_profile_matrix.csv (same shape, kept for notebook convenience)
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import DERIVED_DIR  # noqa: E402


def load_agent_profile_matrix() -> pd.DataFrame:
    matrix_path = DERIVED_DIR / "violation_rate_matrix.csv"
    if not matrix_path.exists():
        raise FileNotFoundError(
            f"{matrix_path} not found — run s1_1_violation_heatmap.py first, "
            "this stage reuses its output rather than recomputing it."
        )
    return pd.read_csv(matrix_path, index_col=0)


def main() -> None:
    matrix = load_agent_profile_matrix()

    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    matrix.to_csv(DERIVED_DIR / "agent_profile_matrix.csv")

    print("agent_profile_matrix.csv (agent x category mean introduced findings):")
    print(matrix.round(2).to_string())
    if len(matrix) > 1:
        # A quick numeric hint at whether profiles differ in shape (rank
        # correlation of categories within each agent) vs just in overall size.
        ranked = matrix.rank(axis=1)
        print("\nWithin-agent category rank (1 = agent's worst category):")
        print(ranked.to_string())


if __name__ == "__main__":
    main()
