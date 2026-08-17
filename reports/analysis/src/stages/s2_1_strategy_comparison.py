#!/usr/bin/env python3
"""analysis.md §4.1 — Prompt strategy comparison (minimal vs structured).

Pairs each (agent, task) run's minimal vs structured net-new violation
count and runs a paired Wilcoxon signed-rank test rather than a paired
t-test, since the sample sizes here don't support a normality assumption.
Always reports the median difference alongside the p-value.

Reads only data/runs.csv. Writes:
    data/derived/strategy_comparison_pairs.csv
    data/derived/strategy_comparison_test.json
"""

from __future__ import annotations

import json
import sys
from dataclasses import asdict
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import DATA_DIR, DERIVED_DIR  # noqa: E402
from stats_utils import paired_wilcoxon  # noqa: E402


def compute_strategy_pairs(runs: pd.DataFrame) -> pd.DataFrame:
    """One row per (agent, task) with both a minimal and a structured run."""
    subset = runs.loc[runs["session_id"] != "baseline", ["agent", "strategy", "task_id", "run_local_introduced_count"]]
    pivot = subset.pivot_table(index=["agent", "task_id"], columns="strategy", values="run_local_introduced_count")
    complete = pivot.dropna(subset=[c for c in ("minimal", "structured") if c in pivot.columns], how="any")
    return complete.reset_index()


def compute_strategy_tests(pairs: pd.DataFrame) -> dict:
    if not {"minimal", "structured"}.issubset(pairs.columns):
        return {"overall": asdict(paired_wilcoxon([], []))}

    results = {
        agent: asdict(paired_wilcoxon(group["minimal"], group["structured"]))
        for agent, group in pairs.groupby("agent")
    }
    results["overall"] = asdict(paired_wilcoxon(pairs["minimal"], pairs["structured"]))
    return results


def main() -> None:
    runs = pd.read_csv(DATA_DIR / "runs.csv")
    pairs = compute_strategy_pairs(runs)
    tests = compute_strategy_tests(pairs)

    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    pairs.to_csv(DERIVED_DIR / "strategy_comparison_pairs.csv", index=False)
    (DERIVED_DIR / "strategy_comparison_test.json").write_text(
        json.dumps(tests, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(pairs.to_string(index=False))
    print()
    print(json.dumps(tests, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
