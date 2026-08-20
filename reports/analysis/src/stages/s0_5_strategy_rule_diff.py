#!/usr/bin/env python3
"""Notebook §2.0f — Which rules drove the Minimal -> Structured change.

Companion to §2.0e's slope chart: that chart shows *how much* run-local
introduced violations moved between Minimal and Structured for each
(agent, task) pair; this stage explains *which rules* the movement is made
of, at full rule_id granularity (not the concern/category rollup used
elsewhere) — e.g. distinguishing BE-DUP-C-002 (single policy
implementation) from BE-DUP-C-003 (no equivalent production code) instead
of collapsing both into "BE-DUP".

Basis is deltas.run_local "introduced" (this task step's own net-new
findings, same as §2.0/§2.0e), split minimal vs structured per rule_id.
Self-checks that each (agent, task) pair's rule-level diffs sum to the
same structured-minus-minimal gap already reported in
data/runs.csv's run_local_introduced_count — this reuses runs.csv
directly (not strategy_comparison_pairs.csv from s2_1) so this script has
no ordering dependency on s2_1_strategy_comparison.py.

Reads only data/runs.csv and data/constraint_findings.csv. Writes:
    data/derived/strategy_rule_diff.csv
    data/derived/strategy_rule_diff_self_check.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import DATA_DIR, DERIVED_DIR  # noqa: E402

RULE_DIFF_COLUMNS = [
    "agent", "task_id", "rule_id", "category",
    "minimal_count", "structured_count", "diff",
]


def compute_strategy_rule_diff(constraint_findings: pd.DataFrame) -> pd.DataFrame:
    """One row per (agent, task, rule_id) that fired under Minimal and/or
    Structured, with the count under each and their difference."""
    introduced = constraint_findings.query(
        "delta_scope == 'run_local' and change_type == 'introduced' and session_id != 'baseline'"
    )
    counts = (
        introduced.groupby(["agent", "task_id", "strategy", "rule_id", "category"]).size()
        .rename("n").reset_index()
    )
    pivot = counts.pivot_table(
        index=["agent", "task_id", "rule_id", "category"],
        columns="strategy", values="n", fill_value=0,
    ).reset_index()

    for col in ("minimal", "structured"):
        if col not in pivot.columns:
            pivot[col] = 0
    pivot = pivot.rename(columns={"minimal": "minimal_count", "structured": "structured_count"})
    pivot["diff"] = pivot["structured_count"] - pivot["minimal_count"]
    pivot = pivot[(pivot["minimal_count"] != 0) | (pivot["structured_count"] != 0)]

    return pivot.sort_values(
        ["agent", "task_id", "diff", "rule_id"]
    )[RULE_DIFF_COLUMNS].reset_index(drop=True)


def self_check(rule_diff: pd.DataFrame, runs: pd.DataFrame) -> dict:
    """Each (agent, task) pair's summed rule-level diff must equal the
    structured-minus-minimal gap in runs.csv's own run_local_introduced_count
    — otherwise the rule breakdown doesn't actually add up to the totals
    §2.0e's chart already reported."""
    summed = rule_diff.groupby(["agent", "task_id"])["diff"].sum()

    totals = runs.loc[
        runs["session_id"] != "baseline",
        ["agent", "strategy", "task_id", "run_local_introduced_count"],
    ]
    wide = totals.pivot_table(
        index=["agent", "task_id"], columns="strategy", values="run_local_introduced_count",
    )
    expected = wide.get("structured", 0) - wide.get("minimal", 0)

    mismatches = []
    for key in expected.index:
        got = float(summed.get(key, 0.0))
        want = float(expected.loc[key])
        if got != want:
            mismatches.append({"agent": key[0], "task_id": key[1], "summed_diff": got, "expected_diff": want})

    return {"passes_self_check": len(mismatches) == 0, "mismatches": mismatches}


def main() -> None:
    runs = pd.read_csv(DATA_DIR / "runs.csv")
    constraint_findings = pd.read_csv(DATA_DIR / "constraint_findings.csv")

    rule_diff = compute_strategy_rule_diff(constraint_findings)
    check = self_check(rule_diff, runs)

    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    rule_diff.to_csv(DERIVED_DIR / "strategy_rule_diff.csv", index=False)
    (DERIVED_DIR / "strategy_rule_diff_self_check.json").write_text(
        json.dumps(check, indent=2), encoding="utf-8"
    )

    print(rule_diff.to_string(index=False))
    print(f"\nSelf-check passes: {check['passes_self_check']}")
    if not check["passes_self_check"]:
        print(json.dumps(check["mismatches"], indent=2))


if __name__ == "__main__":
    main()
