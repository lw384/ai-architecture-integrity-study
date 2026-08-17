#!/usr/bin/env python3
"""analysis.md §3.2 — Metric distribution overview.

Establishes each metric's "normal range" via Tukey (IQR) fences on its raw
score values across all runs. The raw per-observation distribution itself
needs no derived table — the notebook plots it straight from
data/metric_observations.csv (box_or_violin per metric_name). This stage
only computes the derived outlier-bounds table, because §6.1
(s4_1_silent_decay.py) reuses this exact threshold rather than picking its
own — see that stage's docstring for why it reads this file instead of
recomputing.

Reads only data/metric_observations.csv. Writes:
    data/derived/metric_distribution_bounds.csv
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import DATA_DIR, DERIVED_DIR  # noqa: E402
from stats_utils import iqr_outlier_bounds  # noqa: E402


def compute_metric_bounds(metric_observations: pd.DataFrame) -> pd.DataFrame:
    numeric = metric_observations.dropna(subset=["value"])
    rows = []
    for (name, category), group in numeric.groupby(["metric_name", "category"]):
        low, high = iqr_outlier_bounds(group["value"])
        rows.append(
            {
                "metric_name": name,
                "category": category,
                "direction": group["direction"].mode().iat[0] if not group["direction"].mode().empty else None,
                "n_observations": len(group),
                "median": group["value"].median(),
                "iqr_low": low,
                "iqr_high": high,
            }
        )
    return pd.DataFrame(rows).sort_values("metric_name")


def main() -> None:
    metric_observations = pd.read_csv(DATA_DIR / "metric_observations.csv")
    bounds = compute_metric_bounds(metric_observations)

    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    bounds.to_csv(DERIVED_DIR / "metric_distribution_bounds.csv", index=False)

    print(bounds.to_string(index=False))


if __name__ == "__main__":
    main()
