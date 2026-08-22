#!/usr/bin/env python3
"""analysis.md §2.3 — Task completion gate.

harness_evaluation.json only measures architecture integrity; it has no
idea whether the agent finished its run cleanly or whether the resulting
feature passed the independent functional acceptance suite. This stage
surfaces both signals so they can be footnoted alongside the architecture
results without being used to filter them (see the scope note in §0 and
§2.3: functional `fail` is not an architecture data-quality problem —
infrastructure `error` and an incomplete agent run are).

Reads only data/task_completion.csv. Writes:
    data/derived/task_completion_gate.csv
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import DATA_DIR, DERIVED_DIR  # noqa: E402


def compute_completion_gate(task_completion: pd.DataFrame) -> pd.DataFrame:
    gated = task_completion.copy()
    gated["flagged_for_review"] = (
        (gated["agent_status"] != "success")
        | (gated["completion_marker_found"] != True)  # noqa: E712 (NaN must also flag)
        | (gated["agent_reported_error"] == True)  # noqa: E712
    )
    gated["test_infrastructure_error"] = gated["test_status"] == "error"
    if "adapter_unresolved_count" in gated:
        gated["adapter_unresolved"] = (
            pd.to_numeric(gated["adapter_unresolved_count"], errors="coerce")
            .fillna(0)
            .gt(0)
        )
    else:
        gated["adapter_unresolved"] = False
    gated["has_acceptance_suite"] = ~gated["test_status"].isin(["skipped", "no_data"])
    return gated


def main() -> None:
    task_completion = pd.read_csv(DATA_DIR / "task_completion.csv")
    gate = compute_completion_gate(task_completion)

    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    gate.to_csv(DERIVED_DIR / "task_completion_gate.csv", index=False)

    flagged = gate["flagged_for_review"].sum()
    infra_errors = gate["test_infrastructure_error"].sum()
    unresolved = gate["adapter_unresolved"].sum()
    print(f"task_completion_gate.csv: {len(gate)} rows")
    print(f"Flagged for review (agent didn't finish cleanly): {flagged}")
    print(f"Acceptance-infrastructure errors (not architecture data problems): {infra_errors}")
    print(f"Acceptance adapter unresolved targets (remain test failures): {unresolved}")
    print()
    print(
        gate.groupby(["task_id", "test_status"]).size()
        .rename("count").reset_index()
        .to_string(index=False)
    )


if __name__ == "__main__":
    main()
