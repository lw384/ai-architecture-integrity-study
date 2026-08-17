#!/usr/bin/env python3
"""Matplotlib/seaborn plotting primitives shared by the notebook.

Design rule: every function here only knows how to draw — it takes data
plus explicit title/xlabel/ylabel/legend strings from the caller and does
not hardcode any domain text. The notebook (not this file) decides what a
chart is called; that keeps all reader-facing text in one place (the
notebook) and in English, and lets a stage's own module stay chart-agnostic.

Every function returns the Axes it drew on so the notebook can compose
subplots or call fig.savefig() itself.
"""

from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

DEFAULT_FIGSIZE = (9, 5.5)
SEQUENTIAL_CMAP = "Reds"
DIVERGING_CMAP = "coolwarm"


def set_style() -> None:
    """Apply one consistent theme for every chart in the notebook."""
    sns.set_theme(style="whitegrid", context="notebook", font_scale=1.0)
    plt.rcParams["figure.dpi"] = 110
    plt.rcParams["savefig.dpi"] = 200
    plt.rcParams["axes.titleweight"] = "bold"
    plt.rcParams["axes.titlesize"] = 13


set_style()


def _axes(ax, figsize) -> plt.Axes:
    if ax is not None:
        return ax
    _, ax = plt.subplots(figsize=figsize or DEFAULT_FIGSIZE)
    return ax


def _finish(ax: plt.Axes, title: str, xlabel: str | None, ylabel: str | None) -> plt.Axes:
    ax.set_title(title)
    if xlabel is not None:
        ax.set_xlabel(xlabel)
    if ylabel is not None:
        ax.set_ylabel(ylabel)
    return ax


def heatmap(
    matrix,
    row_labels: list[str],
    col_labels: list[str],
    title: str,
    cbar_label: str,
    xlabel: str | None = None,
    ylabel: str | None = None,
    cmap: str = SEQUENTIAL_CMAP,
    fmt: str = ".2g",
    annot: bool = True,
    vmin: float | None = None,
    vmax: float | None = None,
    ax: plt.Axes | None = None,
    figsize: tuple[float, float] | None = None,
) -> plt.Axes:
    frame = pd.DataFrame(matrix, index=row_labels, columns=col_labels)
    ax = _axes(ax, figsize or (max(6, 0.9 * len(col_labels) + 3), max(4, 0.5 * len(row_labels) + 2)))
    sns.heatmap(
        frame,
        ax=ax,
        cmap=cmap,
        annot=annot,
        fmt=fmt,
        vmin=vmin,
        vmax=vmax,
        linewidths=0.4,
        linecolor="white",
        cbar_kws={"label": cbar_label},
        mask=frame.isna(),
    )
    ax.tick_params(axis="x", rotation=40)
    for label in ax.get_xticklabels():
        label.set_horizontalalignment("right")
    return _finish(ax, title, xlabel, ylabel)


def grouped_bar(
    data: pd.DataFrame,
    x: str,
    y: str,
    title: str,
    xlabel: str | None = None,
    ylabel: str | None = None,
    hue: str | None = None,
    ax: plt.Axes | None = None,
    figsize: tuple[float, float] | None = None,
    legend_title: str | None = None,
    **kwargs,
) -> plt.Axes:
    ax = _axes(ax, figsize)
    sns.barplot(data=data, x=x, y=y, hue=hue, ax=ax, **kwargs)
    if hue and ax.get_legend() is not None:
        ax.legend(title=legend_title or hue, frameon=False)
    ax.tick_params(axis="x", rotation=20)
    return _finish(ax, title, xlabel, ylabel)


def line_trajectory(
    data: pd.DataFrame,
    x: str,
    y: str,
    hue: str,
    title: str,
    xlabel: str | None = None,
    ylabel: str | None = None,
    ax: plt.Axes | None = None,
    figsize: tuple[float, float] | None = None,
    legend_title: str | None = None,
) -> plt.Axes:
    ax = _axes(ax, figsize)
    sns.lineplot(data=data, x=x, y=y, hue=hue, style=hue, markers=True, dashes=False, ax=ax)
    if ax.get_legend() is not None:
        ax.legend(title=legend_title or hue, frameon=False, bbox_to_anchor=(1.02, 1), loc="upper left")
    return _finish(ax, title, xlabel, ylabel)


def box_or_violin(
    data: pd.DataFrame,
    x: str,
    y: str,
    title: str,
    xlabel: str | None = None,
    ylabel: str | None = None,
    kind: str = "box",
    ax: plt.Axes | None = None,
    figsize: tuple[float, float] | None = None,
) -> plt.Axes:
    ax = _axes(ax, figsize)
    plot_fn = sns.violinplot if kind == "violin" else sns.boxplot
    plot_fn(data=data, x=x, y=y, ax=ax)
    ax.tick_params(axis="x", rotation=30)
    return _finish(ax, title, xlabel, ylabel)


def radar(
    categories: list[str],
    series: dict[str, list[float]],
    title: str,
    ax: plt.Axes | None = None,
    figsize: tuple[float, float] | None = None,
    legend_title: str | None = None,
) -> plt.Axes:
    """One closed polygon per series, categories evenly spaced on the circle."""
    n = len(categories)
    angles = np.linspace(0, 2 * np.pi, n, endpoint=False).tolist()
    angles += angles[:1]

    if ax is None:
        fig = plt.figure(figsize=figsize or (7, 7))
        ax = fig.add_subplot(111, projection="polar")

    for label, values in series.items():
        closed_values = list(values) + [values[0]]
        ax.plot(angles, closed_values, linewidth=2, label=label)
        ax.fill(angles, closed_values, alpha=0.08)

    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(categories)
    ax.set_title(title, pad=20)
    ax.legend(title=legend_title, loc="upper right", bbox_to_anchor=(1.3, 1.1), frameon=False)
    return ax


def slope_chart(
    pairs: pd.DataFrame,
    left_col: str,
    right_col: str,
    label_col: str,
    title: str,
    left_label: str,
    right_label: str,
    ylabel: str | None = None,
    ax: plt.Axes | None = None,
    figsize: tuple[float, float] | None = None,
) -> plt.Axes:
    """One line segment per row, from (0, left_col) to (1, right_col)."""
    ax = _axes(ax, figsize or (6, max(4, 0.5 * len(pairs) + 2)))
    palette = sns.color_palette("tab10", n_colors=len(pairs))

    for color, (_, row) in zip(palette, pairs.iterrows()):
        left_value, right_value = row[left_col], row[right_col]
        ax.plot([0, 1], [left_value, right_value], marker="o", color=color, linewidth=2)
        ax.annotate(
            f"{row[label_col]}: {left_value:g} → {right_value:g}",
            xy=(1.03, right_value),
            va="center",
            fontsize=9,
            color=color,
        )

    ax.set_xlim(-0.15, 1.6)
    ax.set_xticks([0, 1])
    ax.set_xticklabels([left_label, right_label])
    return _finish(ax, title, None, ylabel)


def stacked_bar(
    data: pd.DataFrame,
    title: str,
    xlabel: str | None = None,
    ylabel: str | None = None,
    ax: plt.Axes | None = None,
    figsize: tuple[float, float] | None = None,
    legend_title: str | None = None,
) -> plt.Axes:
    """data: index = x-axis categories, columns = stacked segments (counts)."""
    ax = _axes(ax, figsize)
    data.plot(kind="bar", stacked=True, ax=ax, width=0.7)
    ax.legend(title=legend_title, frameon=False, bbox_to_anchor=(1.02, 1), loc="upper left")
    ax.tick_params(axis="x", rotation=0)
    return _finish(ax, title, xlabel, ylabel)


def lorenz_curve(
    values,
    title: str,
    series_label: str = "Observed",
    xlabel: str = "Cumulative share of files",
    ylabel: str = "Cumulative share of findings",
    ax: plt.Axes | None = None,
    figsize: tuple[float, float] | None = None,
) -> plt.Axes:
    clean = np.sort(np.asarray([v for v in values if v is not None and v >= 0], dtype=float))
    ax = _axes(ax, figsize or (6, 6))

    if clean.size == 0 or clean.sum() == 0:
        ax.text(0.5, 0.5, "No data", ha="center", va="center", transform=ax.transAxes)
        return _finish(ax, title, xlabel, ylabel)

    cumulative_population = np.linspace(0, 1, clean.size + 1)
    cumulative_value = np.concatenate([[0], np.cumsum(clean) / clean.sum()])

    ax.plot([0, 1], [0, 1], linestyle="--", color="grey", label="Perfect equality")
    ax.plot(cumulative_population, cumulative_value, marker=".", label=series_label)
    ax.fill_between(cumulative_population, cumulative_value, cumulative_population, alpha=0.1)
    ax.legend(frameon=False)
    return _finish(ax, title, xlabel, ylabel)


def corr_heatmap(
    corr: pd.DataFrame,
    title: str,
    cbar_label: str = "Pearson correlation",
    ax: plt.Axes | None = None,
    figsize: tuple[float, float] | None = None,
) -> plt.Axes:
    return heatmap(
        corr.values,
        row_labels=list(corr.index),
        col_labels=list(corr.columns),
        title=title,
        cbar_label=cbar_label,
        cmap=DIVERGING_CMAP,
        fmt=".2f",
        vmin=-1,
        vmax=1,
        ax=ax,
        figsize=figsize,
    )


def savefig(fig: plt.Figure, path: str | Path) -> Path:
    """Export a figure for paper inclusion (PNG/SVG/PDF inferred from suffix)."""
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, bbox_inches="tight")
    return output_path
