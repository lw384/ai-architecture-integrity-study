#!/usr/bin/env python3
"""Notebook §2.0c — Concern-level violation profile (all 19 concerns, unmerged).

Not a section of docs/methodology/analysis.md's five-stage plan — this is
an ad hoc drill-down requested straight on the notebook's §2.0 run-level
overview, one level more granular than §3.1's heatmap
(s1_1_violation_heatmap.py). Two differences from that heatmap:

1. It keeps the full 19-concern taxonomy from Appendix A / Table 3.2
   (backend: 9, frontend: 7, cross-stack: 3), including every concern that
   never actually fired a finding, instead of only the categories that
   appear in the data. That's the point: the "silent" concerns are the
   answer to "does violation concentrate in a few areas".
2. It does NOT merge same-named categories across scopes — BE-DUP and
   FE-DUP are two different rows, not one "DUP" column — because §2.0's
   layer question ("does backend carry more than frontend") depends on
   keeping that distinction.

Basis is deltas.trajectory_cumulative "introduced" (net-new since baseline,
cumulative within a session's own T1->T3 trajectory), averaged across each
agent's 6 evaluations (2 strategies x 3 tasks) — a snapshot of "how many
open violations of this concern does a typical evaluation carry", not a
running total (which would multiply-count a still-open violation across
T1/T2/T3 of the same session).

Reads only data/runs.csv and data/constraint_findings.csv. Writes:
    data/derived/concern_profile.csv        (19 rows, canonical order)
    data/derived/concern_layer_summary.csv  (3 rows: backend/frontend/cross-stack)
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import DATA_DIR, DERIVED_DIR  # noqa: E402
from taxonomy import CONCERN_ORDER, subject_and_category  # noqa: E402

# X-axis display-label mapping — edit this dict to change what a concern
# shows as on the chart's x-axis without touching any computation below
# (e.g. {"BE-STRUCT": "Structural\nIntegrity"} for a longer gloss). Keys
# must match CONCERN_ORDER's first element; any concern left unmapped
# falls back to its own id (see .get(...) below).
CONCERN_DISPLAY_LABELS: dict[str, str] = {
    "BE-STRUCT": "BE-STRUCT",
    "BE-DEP": "BE-DEP",
    "BE-DOM": "BE-DOM",
    "BE-ERR": "BE-ERR",
    "BE-CONTRACT": "BE-CONTRACT",
    "BE-ROUTE": "BE-ROUTE",
    "BE-SIZE": "BE-SIZE",
    "BE-DUP": "BE-DUP",
    "BE-TEST": "BE-TEST",
    "FE-COM": "FE-COM",
    "FE-STATE": "FE-STATE",
    "FE-ROUTE": "FE-ROUTE",
    "FE-STYLE": "FE-STYLE",
    "FE-DATA": "FE-DATA",
    "FE-COMM": "FE-COMM",
    "FE-DUP": "FE-DUP",
    "CROSS-EP": "CROSS-EP",
    "CROSS-TYPE": "CROSS-TYPE",
    "CROSS-PROP": "CROSS-PROP",
}

PROFILE_COLUMNS = [
    "concern", "layer", "display_label",
    "claude_mean_per_eval", "codex_mean_per_eval",
    "combined_mean_per_eval", "share_of_total_pct",
]


def compute_concern_profile(constraint_findings: pd.DataFrame, runs: pd.DataFrame) -> pd.DataFrame:
    agent_eval_counts = (
        runs.loc[runs["session_id"] != "baseline"]
        .groupby("agent")["evaluation_id"].nunique()
    )
    agents = sorted(agent_eval_counts.index)

    introduced = constraint_findings.query(
        "delta_scope == 'trajectory_cumulative' and change_type == 'introduced' and session_id != 'baseline'"
    ).copy()
    parsed = introduced["rule_id"].apply(subject_and_category)
    introduced["concern"] = [f"{subject}-{cat}" for subject, cat in parsed]

    per_agent_sum = (
        introduced.groupby(["agent", "concern"]).size()
        .unstack("agent")
        .reindex(columns=agents)
        .fillna(0.0)
    )

    rows = []
    for concern, layer in CONCERN_ORDER:
        row = {
            "concern": concern,
            "layer": layer,
            "display_label": CONCERN_DISPLAY_LABELS.get(concern, concern),
        }
        for agent in agents:
            total = float(per_agent_sum.loc[concern, agent]) if concern in per_agent_sum.index else 0.0
            row[f"{agent}_mean_per_eval"] = total / agent_eval_counts[agent]
        rows.append(row)
    profile = pd.DataFrame(rows)

    agent_mean_cols = [f"{agent}_mean_per_eval" for agent in agents]
    profile["combined_mean_per_eval"] = profile[agent_mean_cols].mean(axis=1)
    grand_total = profile["combined_mean_per_eval"].sum()
    profile["share_of_total_pct"] = (
        profile["combined_mean_per_eval"] / grand_total * 100 if grand_total else 0.0
    )
    return profile[["concern", "layer", "display_label", *agent_mean_cols, "combined_mean_per_eval", "share_of_total_pct"]]


def compute_layer_summary(profile: pd.DataFrame) -> pd.DataFrame:
    grand_total = profile["combined_mean_per_eval"].sum()
    summary = (
        profile.groupby("layer", sort=False)
        .agg(
            n_concerns=("concern", "size"),
            n_concerns_with_findings=("combined_mean_per_eval", lambda s: int((s > 0).sum())),
            total_mean_per_eval=("combined_mean_per_eval", "sum"),
        )
        .reset_index()
    )
    summary["share_of_total_pct"] = (
        summary["total_mean_per_eval"] / grand_total * 100 if grand_total else 0.0
    )
    layer_rank = {"backend": 0, "frontend": 1, "cross-stack": 2}
    return summary.sort_values("layer", key=lambda s: s.map(layer_rank)).reset_index(drop=True)


def main() -> None:
    runs = pd.read_csv(DATA_DIR / "runs.csv")
    constraint_findings = pd.read_csv(DATA_DIR / "constraint_findings.csv")

    profile = compute_concern_profile(constraint_findings, runs)
    layer_summary = compute_layer_summary(profile)

    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    profile.to_csv(DERIVED_DIR / "concern_profile.csv", index=False)
    layer_summary.to_csv(DERIVED_DIR / "concern_layer_summary.csv", index=False)

    print("concern_profile.csv (canonical order, mean trajectory_cumulative introduced per evaluation):")
    print(profile.round(2).to_string(index=False))
    print("\nconcern_layer_summary.csv:")
    print(layer_summary.round(2).to_string(index=False))

    ranked = profile.sort_values("combined_mean_per_eval", ascending=False)
    top = ranked.loc[ranked["combined_mean_per_eval"] > 0]
    zero = ranked.loc[ranked["combined_mean_per_eval"] == 0]
    print(f"\n{len(top)}/{len(profile)} concerns ever fired a net-new violation; "
          f"{len(zero)} stayed at zero across all 12 evaluations.")


if __name__ == "__main__":
    main()
