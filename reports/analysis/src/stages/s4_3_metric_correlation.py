#!/usr/bin/env python3
"""analysis.md §6.3 — Metric correlation structure.

Checks whether the ~19 continuous metrics are largely independent signals
or several of them are measuring the same underlying thing (e.g. DEP/DOM
both derive from the same dependency graph). PCA is attempted as an
optional next step; with this study's still-small run count it needs
complete-case rows, so it may legitimately return None early on — that is
reported, not treated as an error.

Reads only data/metric_observations.csv. Writes:
    data/derived/metric_correlation.csv
    data/derived/metric_pca_scores.csv     (only if enough complete rows)
    data/derived/metric_pca_loadings.csv   (only if enough complete rows)
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import DATA_DIR, DERIVED_DIR  # noqa: E402

MIN_COMPLETE_ROWS_FOR_PCA = 4
MIN_COMPLETE_METRICS_FOR_PCA = 2


def compute_metric_correlation(metric_observations: pd.DataFrame) -> pd.DataFrame:
    pivot = metric_observations.pivot_table(index="evaluation_id", columns="metric_name", values="value")
    # Drop metrics that never varied (e.g. always 0) — a constant column has
    # undefined correlation and would otherwise show up as all-NaN.
    varying = pivot.loc[:, pivot.nunique(dropna=True) > 1]
    return varying.corr()


def compute_pca(metric_observations: pd.DataFrame, n_components: int = 2) -> dict | None:
    """A small numpy-only PCA (no sklearn dependency) via SVD on standardized,
    complete-case metric values."""
    pivot = metric_observations.pivot_table(index="evaluation_id", columns="metric_name", values="value")
    varying = pivot.loc[:, pivot.nunique(dropna=True) > 1]
    complete = varying.dropna(axis=0, how="any")

    if complete.shape[0] < MIN_COMPLETE_ROWS_FOR_PCA or complete.shape[1] < MIN_COMPLETE_METRICS_FOR_PCA:
        return None

    std = complete.std(ddof=0).replace(0, 1)
    standardized = (complete - complete.mean()) / std
    u, s, vt = np.linalg.svd(standardized.values, full_matrices=False)

    n_components = min(n_components, vt.shape[0])
    scores = pd.DataFrame(
        u[:, :n_components] * s[:n_components],
        index=complete.index,
        columns=[f"PC{i + 1}" for i in range(n_components)],
    )
    loadings = pd.DataFrame(
        vt[:n_components].T,
        index=complete.columns,
        columns=[f"PC{i + 1}" for i in range(n_components)],
    )
    explained_variance_ratio = (s**2 / np.sum(s**2))[:n_components]

    return {
        "scores": scores,
        "loadings": loadings,
        "explained_variance_ratio": explained_variance_ratio.tolist(),
        "n_rows_used": complete.shape[0],
        "n_metrics_used": complete.shape[1],
    }


def main() -> None:
    metric_observations = pd.read_csv(DATA_DIR / "metric_observations.csv")
    correlation = compute_metric_correlation(metric_observations)

    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    correlation.to_csv(DERIVED_DIR / "metric_correlation.csv")

    print(f"metric_correlation.csv: {correlation.shape[0]}x{correlation.shape[1]} matrix")

    pca = compute_pca(metric_observations)
    if pca is None:
        print(
            f"PCA skipped: fewer than {MIN_COMPLETE_ROWS_FOR_PCA} complete-case runs "
            f"or {MIN_COMPLETE_METRICS_FOR_PCA} varying metrics available yet."
        )
        return

    pca["scores"].to_csv(DERIVED_DIR / "metric_pca_scores.csv")
    pca["loadings"].to_csv(DERIVED_DIR / "metric_pca_loadings.csv")
    print(
        f"PCA: {pca['n_rows_used']} runs x {pca['n_metrics_used']} metrics, "
        f"explained variance ratio {[round(v, 3) for v in pca['explained_variance_ratio']]}"
    )


if __name__ == "__main__":
    main()
