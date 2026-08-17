#!/usr/bin/env python3
"""analysis.md §6.4 — Agent self-assessment calibration.

T5 asks the agent to review its own T1-T3 workspace and self-report
architecture-consistency issues, without seeing the Harness's objective
findings. This stage checks whether the agent's self-review is actually
calibrated against what the Harness found at the same commit
(`reviewed_from_tag`, currently always `task-T3-done`):

  1. Volume: did the agent claim "no issues found" while the Harness shows
     real net-new violations at that commit? -> blind_spot.
  2. Location: do the files the agent names in its findings overlap with
     files the Harness actually flagged?

Both checks are heuristic (free-text self-review vs structured rule
findings can't be matched exactly) and only informative to the extent T5
has actually been run — as of this dataset, 2 of 4 sessions.

Reads only data/review_runs.csv, data/review_findings.csv, data/runs.csv,
and data/constraint_findings.csv. Writes:
    data/derived/review_ground_truth.csv
    data/derived/review_location_overlap.csv
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import DATA_DIR, DERIVED_DIR  # noqa: E402


def compute_review_ground_truth(review_runs: pd.DataFrame, runs: pd.DataFrame) -> pd.DataFrame:
    """Join each T5 review to the Harness's actual absolute findings at T3."""
    t3_facts = runs.loc[
        runs["task_id"] == "T3",
        ["session_id", "total_findings_absolute", "constraint_result"],
    ].rename(columns={"total_findings_absolute": "harness_findings_at_t3", "constraint_result": "harness_constraint_result_at_t3"})

    merged = review_runs.merge(t3_facts, on="session_id", how="left")
    merged["blind_spot"] = (merged["review_status"] == "no_issues_found") & (merged["harness_findings_at_t3"] > 0)
    merged["under_reported"] = (
        (merged["review_status"] == "issues_found")
        & (merged["n_findings"] < merged["harness_findings_at_t3"])
    )
    return merged


def _basename_matches(referenced_files: str, harness_basenames: set[str]) -> bool:
    for path in str(referenced_files or "").split(";"):
        path = path.strip()
        if path and os.path.basename(path) in harness_basenames:
            return True
    return False


def compute_location_overlap(review_findings: pd.DataFrame, constraint_findings: pd.DataFrame) -> pd.DataFrame:
    """Per T5 review: share of self-reported findings that name a file the
    Harness also flagged (absolute findings at the reviewed T3 commit)."""
    rows = []
    for session_id, group in review_findings.groupby("session_id"):
        harness_files = constraint_findings.loc[
            (constraint_findings["session_id"] == session_id)
            & (constraint_findings["task_id"] == "T3")
            & (constraint_findings["delta_scope"] == "absolute"),
            "file",
        ]
        harness_basenames = {os.path.basename(f) for f in harness_files.dropna() if f}

        matched = group["referenced_files"].apply(lambda f: _basename_matches(f, harness_basenames))
        rows.append(
            {
                "session_id": session_id,
                "n_self_reported_findings": len(group),
                "n_harness_files_at_t3": len(harness_basenames),
                "n_matched_to_harness_file": int(matched.sum()),
                "match_ratio": float(matched.mean()) if len(group) else None,
            }
        )
    return pd.DataFrame(rows)


def main() -> None:
    review_runs = pd.read_csv(DATA_DIR / "review_runs.csv")
    review_findings = pd.read_csv(DATA_DIR / "review_findings.csv")
    runs = pd.read_csv(DATA_DIR / "runs.csv")
    constraint_findings = pd.read_csv(DATA_DIR / "constraint_findings.csv")

    if review_runs.empty:
        print("No T5 reviews found yet — nothing to calibrate.")
        return

    ground_truth = compute_review_ground_truth(review_runs, runs)
    overlap = compute_location_overlap(review_findings, constraint_findings) if not review_findings.empty else pd.DataFrame()

    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    ground_truth.to_csv(DERIVED_DIR / "review_ground_truth.csv", index=False)
    overlap.to_csv(DERIVED_DIR / "review_location_overlap.csv", index=False)

    print(
        ground_truth[
            ["session_id", "agent", "strategy", "review_status", "n_findings",
             "harness_findings_at_t3", "blind_spot", "under_reported"]
        ].to_string(index=False)
    )
    print()
    if not overlap.empty:
        print(overlap.to_string(index=False))

    blind_spots = ground_truth["blind_spot"].sum()
    if blind_spots:
        print(f"\n{blind_spots} review(s) claimed no issues while the Harness found real violations.")


if __name__ == "__main__":
    main()
