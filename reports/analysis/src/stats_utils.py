#!/usr/bin/env python3
"""Stage-agnostic statistics helpers.

Pure math, no knowledge of runs/tasks/agents. Kept separate from
src/stages/ so that fixing (say) the Gini coefficient formula touches one
file instead of every stage script that happens to use it — see
docs/methodology/analysis.md for which stage uses which helper.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import stats as scipy_stats


def iqr_outlier_bounds(values, k: float = 1.5) -> tuple[float, float] | tuple[None, None]:
    """Return (low, high) Tukey fences; NaNs are ignored.

    Used by analysis.md §3.2 to set the "normal range" for a metric, and
    reused as-is by §6.1 to define "significant" decay — one threshold
    definition, not a different cutoff picked per stage.
    """
    clean = np.asarray([v for v in values if v is not None and not np.isnan(v)], dtype=float)
    if clean.size == 0:
        return None, None
    q1, q3 = np.percentile(clean, [25, 75])
    iqr = q3 - q1
    return q1 - k * iqr, q3 + k * iqr


def is_outlier(value: float | None, low: float | None, high: float | None) -> bool:
    if value is None or low is None or high is None or np.isnan(value):
        return False
    return value < low or value > high


def gini_coefficient(values) -> float | None:
    """Gini coefficient of a non-negative distribution (0 = perfectly even).

    Used by analysis.md §6.2 to summarize whether findings concentrate in a
    few files (high Gini) or spread across the changeset (low Gini).
    """
    clean = np.asarray([v for v in values if v is not None and not np.isnan(v)], dtype=float)
    clean = clean[clean >= 0]
    if clean.size == 0 or clean.sum() == 0:
        return None
    sorted_values = np.sort(clean)
    n = sorted_values.size
    cumulative = np.cumsum(sorted_values)
    return float((n + 1 - 2 * (cumulative.sum() / cumulative[-1])) / n)


@dataclass
class PairedTestResult:
    n_pairs: int
    statistic: float | None
    p_value: float | None
    median_diff: float | None
    note: str | None = None


def paired_wilcoxon(before, after) -> PairedTestResult:
    """Wilcoxon signed-rank test for paired (minimal, structured) samples.

    analysis.md §4.1 asks for this instead of a paired t-test because the
    sample sizes involved are small and there's no reason to assume the
    differences are normally distributed. Always also report median_diff —
    a p-value alone doesn't communicate effect size.
    """
    before = np.asarray(before, dtype=float)
    after = np.asarray(after, dtype=float)
    mask = ~(np.isnan(before) | np.isnan(after))
    before, after = before[mask], after[mask]
    n_pairs = before.size

    if n_pairs < 2:
        return PairedTestResult(n_pairs, None, None, None, "fewer than 2 complete pairs")

    diffs = after - before
    median_diff = float(np.median(diffs))
    if np.all(diffs == 0):
        return PairedTestResult(n_pairs, 0.0, 1.0, median_diff, "all paired differences are zero")

    try:
        result = scipy_stats.wilcoxon(before, after)
    except ValueError as error:
        return PairedTestResult(n_pairs, None, None, median_diff, str(error))

    return PairedTestResult(n_pairs, float(result.statistic), float(result.pvalue), median_diff)


def classify_trend_shape(y_values, min_points: int = 3) -> str:
    """Classify a trajectory's curvature from its sequence of first differences.

    Returns one of: "insufficient_data", "flat", "linear",
    "accelerating" (convex — degradation speeding up), or
    "plateau_or_decline" (diffs shrinking or turning negative — the system
    stabilizes or improves). See analysis.md §5.1 for the interpretation of
    each shape.
    """
    clean = [v for v in y_values if v is not None and not (isinstance(v, float) and np.isnan(v))]
    if len(clean) < min_points:
        return "insufficient_data"

    diffs = np.diff(np.asarray(clean, dtype=float))
    if np.allclose(diffs, 0, atol=1e-9):
        return "flat"

    half = max(1, len(diffs) // 2)
    early_slope = float(np.mean(diffs[:half]))
    late_slope = float(np.mean(diffs[half:])) if len(diffs) > half else early_slope

    # A small absolute tolerance avoids over-classifying noise as a shape.
    tolerance = max(0.05 * (abs(early_slope) + abs(late_slope)), 1e-9)
    if late_slope > early_slope + tolerance:
        return "accelerating"
    if late_slope < early_slope - tolerance:
        return "plateau_or_decline"
    return "linear"
