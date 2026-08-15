#!/usr/bin/env python3
"""Aggregate experiment Harness JSON files into CSV data and an HTML dashboard.

The script intentionally uses only the Python standard library so it can run in
the repository without installing pandas, matplotlib, or seaborn.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean
from typing import Any, Iterable


# STATUS_COLOURS = { ... }  # Redundant: status colors are defined in dashboard CSS.
SERIES_COLOURS = ["#175cd3", "#7a5af8", "#039855", "#dc6803", "#d92d20", "#0e7090"]

SVG_EMBEDDED_STYLE = """<style>
.chart-bg { fill:#ffffff; }
.chart-title { fill:#101828; font-size:17px; font-weight:650; }
.plot-frame { fill:#ffffff; stroke:#d0d5dd; }
.grid { stroke:#d0d5dd; stroke-width:1; opacity:.65; }
.tick, .legend, .row-label, .axis-title, .value { fill:#344054; font-size:11px; }
.row-label { font-size:10.5px; }
.axis-title { font-size:12px; font-weight:600; }
.value { font-weight:650; }
</style>"""


def e(value: Any) -> str:
    return html.escape(str(value), quote=True)


def svg_start(title: str, width: int, height: int, css_class: str = "chart") -> list[str]:
    """Create a self-contained light SVG that is independent of editor theme."""
    return [
        f'<svg class="{css_class}" viewBox="0 0 {width} {height}" role="img" aria-label="{e(title)}" style="background:#ffffff;color:#101828">',
        SVG_EMBEDDED_STYLE,
        f'<rect class="chart-bg" x="0" y="0" width="{width}" height="{height}"/>',
    ]


def task_sort_key(task_id: str) -> tuple[int, str]:
    match = re.search(r"(\d+)", task_id or "")
    return (int(match.group(1)) if match else 10**9, task_id or "")


def short_session(session_id: str) -> str:
    match = re.fullmatch(r"session_(\d{8})_(\d{6})", session_id)
    if not match:
        return session_id
    date, time = match.groups()
    return f"{date[4:6]}-{date[6:8]} {time[:2]}:{time[2:4]}"


def parse_scalar(value: str) -> Any:
    value = value.strip().strip("'\"")
    if value.lower() in {"true", "false"}:
        return value.lower() == "true"
    if value.lower() in {"none", "null"}:
        return None
    return value


def read_session_config(session_dir: Path) -> dict[str, Any]:
    """Read the small session YAML without adding a PyYAML dependency."""
    path = session_dir / "session_manifest.yaml"
    result: dict[str, Any] = {}
    if not path.exists():
        return result

    in_initial_config = False
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        if raw_line.strip() == "initial_config:":
            in_initial_config = True
            continue
        if in_initial_config and raw_line and not raw_line.startswith("  "):
            in_initial_config = False
        if in_initial_config:
            match = re.match(r"^\s{2}([A-Za-z0-9_]+):\s*(.*?)\s*$", raw_line)
            if match:
                result[match.group(1)] = parse_scalar(match.group(2))
        else:
            match = re.match(r"^(session_id|created_at):\s*(.*?)\s*$", raw_line)
            if match:
                result[match.group(1)] = parse_scalar(match.group(2))
    return result


def discover_evaluations(experiments_dir: Path, include_reruns: bool) -> list[Path]:
    pattern = "session_*/**/harness_evaluation.json" if include_reruns else "session_*/T*/harness_evaluation.json"
    paths = sorted(experiments_dir.glob(pattern))
    if not paths:
        raise FileNotFoundError(
            f"No harness_evaluation.json files found under {experiments_dir}"
        )
    return paths


def finding_file(finding: dict[str, Any], scope_id: str) -> str:
    location = finding.get("location") or {}
    path = location.get("file") or ""
    if not path:
        return ""
    # Absolute workspace paths make the same logical file look session-specific.
    normalized = str(path).replace("\\", "/")
    for marker in ("/backend/", "/frontend/"):
        if marker in normalized:
            return marker.strip("/") + "/" + normalized.split(marker, 1)[1]
    if scope_id in {"backend", "frontend"} and not normalized.startswith(f"{scope_id}/"):
        return f"{scope_id}/{normalized.lstrip('/')}"
    return normalized


def append_constraint_rows(
    rows: list[dict[str, Any]],
    findings: Iterable[dict[str, Any]],
    record: dict[str, Any],
    scope_id: str,
) -> None:
    for finding in findings:
        rows.append(
            {
                "evaluation_id": record["evaluation_id"],
                "session_id": record["session_id"],
                "task_id": record["task_id"],
                "agent": record["agent"],
                "strategy": record["strategy"],
                "scope_id": scope_id,
                "rule_id": finding.get("rule_id") or "unknown-rule",
                "severity": finding.get("severity") or "unknown",
                "file": finding_file(finding, scope_id),
                "message": finding.get("message") or "",
            }
        )


def load_data(paths: list[Path], experiments_dir: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    runs: list[dict[str, Any]] = []
    constraints: list[dict[str, Any]] = []
    metrics: list[dict[str, Any]] = []
    label_counts: Counter[tuple[str, str]] = Counter()

    for path in paths:
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("schema_version") != "0.2.0":
            raise ValueError(f"Unsupported evaluation schema in {path}")
        relative = path.relative_to(experiments_dir)
        session_id = relative.parts[0]
        config = read_session_config(experiments_dir / session_id)
        task_id = str(data.get("task_id") or (relative.parts[1] if len(relative.parts) > 1 else "unknown"))
        label_counts[(session_id, task_id)] += 1
        suffix = label_counts[(session_id, task_id)]
        evaluation_id = f"{session_id}/{task_id}" + (f"#{suffix}" if suffix > 1 else "")
        scopes = data.get("scopes") or []

        record: dict[str, Any] = {
            "evaluation_id": evaluation_id,
            "source_file": str(path),
            "session_id": session_id,
            "session_label": short_session(session_id),
            "task_id": task_id,
            "agent": config.get("agent") or "unknown",
            "model": config.get("model") or "unknown",
            "strategy": config.get("strategy") or "unknown",
            "memory": bool(config.get("write_memory_md", False)),
            "execution_status": data.get("execution_status") or "unknown",
            "compliance_status": data.get("compliance_status") or "unknown",
            "comparison_status": data.get("comparison_status") or "unknown",
            "duration_ms": data.get("duration_ms"),
            "backend_status": "none",
            "frontend_status": "none",
            "cross_status": "none",
            "backend_findings": 0,
            "frontend_findings": 0,
            "cross_findings": 0,
            "rules_evaluated": 0,
            "metrics_total": 0,
            "metrics_scored": 0,
            "metric_errors": 0,
            "scope_errors": 0,
        }

        for scope in scopes:
            scope_id = str(scope.get("scope_id") or "unknown")
            scope_type = str(scope.get("scope_type") or "unknown")
            scope_status = scope.get("status") or "unknown"
            if scope_id in {"backend", "frontend"}:
                record[f"{scope_id}_status"] = scope_status
            if scope_type == "cross-stack":
                record["cross_status"] = scope_status
            if scope_status in {"error", "failed"}:
                record["scope_errors"] += 1

            layers = scope.get("layers") or {}
            constraint_layer = layers.get("constraints") or {}
            findings = constraint_layer.get("findings") or []
            record["rules_evaluated"] += int(constraint_layer.get("rules_evaluated") or 0)
            if scope_id in {"backend", "frontend"}:
                record[f"{scope_id}_findings"] += len(findings)
            if scope_type == "cross-stack":
                record["cross_findings"] += len(findings)
            append_constraint_rows(constraints, findings, record, scope_id)

            for metric in layers.get("metrics") or []:
                score = metric.get("score") or {}
                status = metric.get("status") or "unknown"
                record["metrics_total"] += 1
                if isinstance(score.get("value"), (int, float)):
                    record["metrics_scored"] += 1
                if status == "error":
                    record["metric_errors"] += 1
                metrics.append(
                    {
                        "evaluation_id": evaluation_id,
                        "session_id": session_id,
                        "task_id": task_id,
                        "agent": record["agent"],
                        "strategy": record["strategy"],
                        "scope_id": scope_id,
                        "metric_name": metric.get("name") or "unknown-metric",
                        "status": status,
                        "value": score.get("value"),
                        "unit": score.get("unit"),
                        "direction": score.get("direction"),
                        "delta_vs_baseline": metric.get("delta_vs_baseline"),
                        "findings": " | ".join(str(item) for item in (metric.get("findings") or [])),
                    }
                )

        record["total_findings"] = (
            record["backend_findings"]
            + record["frontend_findings"]
            + record["cross_findings"]
        )
        record["metric_coverage"] = (
            record["metrics_scored"] / record["metrics_total"]
            if record["metrics_total"]
            else 0.0
        )
        runs.append(record)

    runs.sort(key=lambda row: (row["session_id"], task_sort_key(row["task_id"]), row["evaluation_id"]))
    return runs, constraints, metrics


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows and not fieldnames:
        path.write_text("", encoding="utf-8")
        return
    columns = fieldnames or list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def svg_line_chart(
    title: str,
    x_values: list[str],
    series: list[tuple[str, list[float | None]]],
    y_title: str,
) -> str:
    width, height = max(760, 170 * len(x_values)), 390
    margin = {"left": 68, "right": 28, "top": 52, "bottom": 82}
    plot_w = width - margin["left"] - margin["right"]
    plot_h = height - margin["top"] - margin["bottom"]
    values = [value for _, items in series for value in items if isinstance(value, (int, float))]
    y_max = max(values, default=1)
    y_max = max(1.0, y_max * 1.12)

    def x_pos(index: int) -> float:
        return margin["left"] + (plot_w * index / max(1, len(x_values) - 1))

    def y_pos(value: float) -> float:
        return margin["top"] + plot_h * (1 - value / y_max)

    parts = svg_start(title, width, height) + [
        f'<text class="chart-title" x="{margin["left"]}" y="24">{e(title)}</text>',
        f'<rect class="plot-frame" x="{margin["left"]}" y="{margin["top"]}" width="{plot_w}" height="{plot_h}"/>',
    ]
    for tick in range(5):
        value = y_max * tick / 4
        y = y_pos(value)
        parts.append(f'<line class="grid" x1="{margin["left"]}" y1="{y:.1f}" x2="{width-margin["right"]}" y2="{y:.1f}"/>')
        parts.append(f'<text class="tick" x="{margin["left"]-9}" y="{y+4:.1f}" text-anchor="end">{value:.0f}</text>')
    for index, label in enumerate(x_values):
        x = x_pos(index)
        parts.append(f'<text class="tick" x="{x:.1f}" y="{height-52}" text-anchor="middle">{e(label)}</text>')
    parts.append(f'<text class="axis-title" transform="translate(18 {margin["top"]+plot_h/2}) rotate(-90)" text-anchor="middle">{e(y_title)}</text>')

    for series_index, (name, items) in enumerate(series):
        colour = SERIES_COLOURS[series_index % len(SERIES_COLOURS)]
        points = [(x_pos(i), y_pos(float(v)), float(v)) for i, v in enumerate(items) if isinstance(v, (int, float))]
        if len(points) > 1:
            coords = " ".join(f"{x:.1f},{y:.1f}" for x, y, _ in points)
            parts.append(f'<polyline points="{coords}" fill="none" stroke="{colour}" stroke-width="3"/>')
        for x, y, value in points:
            parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="5" fill="{colour}"><title>{e(name)}: {value:g}</title></circle>')
            parts.append(f'<text class="value" x="{x:.1f}" y="{y-10:.1f}" text-anchor="middle">{value:g}</text>')
    legend_x = margin["left"]
    for index, (name, _) in enumerate(series):
        colour = SERIES_COLOURS[index % len(SERIES_COLOURS)]
        x = legend_x + index * max(150, plot_w / max(1, len(series)))
        parts.append(f'<line x1="{x}" y1="{height-18}" x2="{x+22}" y2="{height-18}" stroke="{colour}" stroke-width="4"/>')
        parts.append(f'<text class="legend" x="{x+29}" y="{height-14}">{e(name)}</text>')
    parts.append("</svg>")
    return "".join(parts)


def svg_grouped_bar(
    title: str,
    categories: list[str],
    series: list[tuple[str, list[float]]],
    y_title: str,
) -> str:
    width, height = max(840, 165 * len(categories)), 420
    left, right, top, bottom = 70, 24, 50, 105
    plot_w, plot_h = width - left - right, height - top - bottom
    maximum = max((value for _, values in series for value in values), default=1)
    maximum = max(1, maximum)
    group_w = plot_w / max(1, len(categories))
    bar_w = min(34, group_w * 0.72 / max(1, len(series)))
    parts = svg_start(title, width, height) + [
        f'<text class="chart-title" x="{left}" y="24">{e(title)}</text>',
        f'<rect class="plot-frame" x="{left}" y="{top}" width="{plot_w}" height="{plot_h}"/>',
    ]
    for tick in range(5):
        value = maximum * tick / 4
        y = top + plot_h * (1 - value / maximum)
        parts.append(f'<line class="grid" x1="{left}" y1="{y:.1f}" x2="{width-right}" y2="{y:.1f}"/>')
        parts.append(f'<text class="tick" x="{left-9}" y="{y+4:.1f}" text-anchor="end">{value:.0f}</text>')
    for category_index, category in enumerate(categories):
        center = left + group_w * (category_index + 0.5)
        start = center - bar_w * len(series) / 2
        for series_index, (name, values) in enumerate(series):
            value = values[category_index]
            height_px = plot_h * value / maximum
            x = start + series_index * bar_w
            y = top + plot_h - height_px
            colour = SERIES_COLOURS[series_index % len(SERIES_COLOURS)]
            parts.append(f'<rect x="{x+2:.1f}" y="{y:.1f}" width="{max(2,bar_w-4):.1f}" height="{height_px:.1f}" fill="{colour}"><title>{e(category)} · {e(name)}: {value:g}</title></rect>')
        parts.append(f'<text class="tick" x="{center:.1f}" y="{height-76}" text-anchor="middle">{e(category)}</text>')
    parts.append(f'<text class="axis-title" transform="translate(18 {top+plot_h/2}) rotate(-90)" text-anchor="middle">{e(y_title)}</text>')
    for index, (name, _) in enumerate(series):
        x = left + index * 170
        colour = SERIES_COLOURS[index % len(SERIES_COLOURS)]
        parts.append(f'<rect x="{x}" y="{height-28}" width="14" height="14" fill="{colour}"/>')
        parts.append(f'<text class="legend" x="{x+21}" y="{height-16}">{e(name)}</text>')
    parts.append("</svg>")
    return "".join(parts)


def heat_colour(value: float | None, maximum: float, missing: bool = False) -> str:
    if missing or value is None:
        return "#eaecf0"
    ratio = 0 if maximum <= 0 else min(1.0, max(0.0, value / maximum))
    # Light amber to deep red: more findings / badness is visually worse.
    start, end = (255, 244, 229), (180, 35, 24)
    rgb = tuple(round(start[i] + (end[i] - start[i]) * ratio) for i in range(3))
    return "#" + "".join(f"{channel:02x}" for channel in rgb)


def svg_heatmap(
    title: str,
    row_labels: list[str],
    column_labels: list[str],
    matrix: list[list[float | None]],
    value_label: str,
    maximum: float | None = None,
) -> str:
    cell_w, cell_h = 82, 30
    left = min(360, max(190, max((len(label) for label in row_labels), default=10) * 6.4))
    top, right, bottom = 62, 24, 112
    width = int(left + right + cell_w * len(column_labels))
    height = int(top + bottom + cell_h * len(row_labels))
    all_values = [value for row in matrix for value in row if isinstance(value, (int, float))]
    scale_max = maximum if maximum is not None else max(all_values, default=1)
    parts = svg_start(title, width, height, "chart heatmap") + [
        f'<text class="chart-title" x="{left}" y="24">{e(title)}</text>',
    ]
    for col, label in enumerate(column_labels):
        x = left + col * cell_w + cell_w / 2
        parts.append(f'<text class="tick" transform="translate({x:.1f} {top-10}) rotate(-42)" text-anchor="start">{e(label)}</text>')
    for row, label in enumerate(row_labels):
        y = top + row * cell_h
        parts.append(f'<text class="row-label" x="{left-9}" y="{y+20}" text-anchor="end">{e(label)}</text>')
        for col in range(len(column_labels)):
            value = matrix[row][col]
            colour = heat_colour(value, scale_max, missing=value is None)
            x = left + col * cell_w
            text_value = "—" if value is None else (f"{value:.0f}" if float(value).is_integer() else f"{value:.2f}")
            text_colour = "#ffffff" if value is not None and scale_max > 0 and value / scale_max > 0.62 else "#344054"
            parts.append(f'<rect x="{x}" y="{y}" width="{cell_w-2}" height="{cell_h-2}" fill="{colour}"><title>{e(label)} · {e(column_labels[col])}: {e(text_value)} {e(value_label)}</title></rect>')
            parts.append(f'<text x="{x+cell_w/2-1:.1f}" y="{y+19}" text-anchor="middle" fill="{text_colour}" font-size="11">{e(text_value)}</text>')
    parts.append(f'<text class="legend" x="{left}" y="{height-22}">浅 → 深：{e(value_label)}由低到高；灰色：缺失或未执行</text>')
    parts.append("</svg>")
    return "".join(parts)


def svg_horizontal_bar(title: str, items: list[tuple[str, int]], x_title: str) -> str:
    width, bar_h = 980, 30
    left, right, top, bottom = 330, 42, 50, 55
    height = top + bottom + max(1, len(items)) * bar_h
    plot_w = width - left - right
    maximum = max((value for _, value in items), default=1)
    parts = svg_start(title, width, height) + [
        f'<text class="chart-title" x="{left}" y="24">{e(title)}</text>',
    ]
    for index, (label, value) in enumerate(items):
        y = top + index * bar_h
        bar_width = plot_w * value / max(1, maximum)
        parts.append(f'<text class="row-label" x="{left-10}" y="{y+19}" text-anchor="end">{e(label)}</text>')
        parts.append(f'<rect x="{left}" y="{y+4}" width="{bar_width:.1f}" height="18" fill="#175cd3"><title>{e(label)}: {value}</title></rect>')
        parts.append(f'<text class="value" x="{left+bar_width+7:.1f}" y="{y+18}">{value}</text>')
    parts.append(f'<text class="axis-title" x="{left+plot_w/2}" y="{height-12}" text-anchor="middle">{e(x_title)}</text>')
    parts.append("</svg>")
    return "".join(parts)


def make_run_table(runs: list[dict[str, Any]]) -> str:
    rows = []
    for run in runs:
        duration = f"{run['duration_ms']/1000:.2f}" if isinstance(run.get("duration_ms"), (int, float)) else "—"
        coverage = f"{run['metric_coverage']*100:.0f}%"
        rows.append(
            "<tr>"
            f"<td>{e(run['session_label'])}</td><td>{e(run['task_id'])}</td>"
            f"<td>{e(run['agent'])} / {e(run['strategy'])}</td>"
            f"<td><span class='status status-{e(run['execution_status'])}'>{e(run['execution_status'])}</span></td>"
            f"<td><span class='status status-{e(run['compliance_status'])}'>{e(run['compliance_status'])}</span></td>"
            f"<td><span class='status status-{e(run['comparison_status'])}'>{e(run['comparison_status'])}</span></td>"
            f"<td>{e(run['backend_status'])}</td><td>{e(run['frontend_status'])}</td><td>{e(run['cross_status'])}</td>"
            f"<td class='num'>{run['backend_findings']}</td><td class='num'>{run['frontend_findings']}</td>"
            f"<td class='num'>{run['cross_findings']}</td><td class='num'>{coverage}</td>"
            f"<td class='num'>{run['metric_errors']}</td><td class='num'>{duration}</td>"
            "</tr>"
        )
    return (
        "<div class='table-wrap'><table><thead><tr>"
        "<th>Session</th><th>Task</th><th>Condition</th><th>Execution</th>"
        "<th>Compliance</th><th>Comparison</th>"
        "<th>Backend</th><th>Frontend</th><th>Cross</th>"
        "<th>BE findings</th><th>FE findings</th><th>Cross findings</th>"
        "<th>Metric coverage</th><th>Metric errors</th><th>Runtime (s)</th>"
        "</tr></thead><tbody>" + "".join(rows) + "</tbody></table></div>"
    )


def metric_badness(metrics: list[dict[str, Any]], run_ids: list[str]) -> tuple[list[str], list[list[float | None]]]:
    by_metric: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for row in metrics:
        by_metric[row["metric_name"]][row["evaluation_id"]] = row

    ranked: list[tuple[float, int, str, dict[str, float]]] = []
    for name, observations in by_metric.items():
        numeric = {
            run_id: float(row["value"])
            for run_id, row in observations.items()
            if isinstance(row.get("value"), (int, float))
        }
        if not numeric:
            continue
        values = list(numeric.values())
        low, high = min(values), max(values)
        direction = next((row.get("direction") for row in observations.values() if row.get("direction")), "lower_is_better")
        badness: dict[str, float] = {}
        for run_id, value in numeric.items():
            normalized = 0.0 if math.isclose(high, low) else (value - low) / (high - low)
            if direction == "higher_is_better":
                normalized = 1.0 - normalized
            badness[run_id] = normalized * 100
        ranked.append((high - low, len(numeric), name, badness))

    # Keep every metric visible; sorting groups the most widely observed metrics first.
    ranked.sort(key=lambda item: (-item[1], item[2]))
    selected = ranked
    labels = [name for _, _, name, _ in selected]
    matrix = [[badness.get(run_id) for run_id in run_ids] for _, _, _, badness in selected]
    return labels, matrix


def build_dashboard(
    runs: list[dict[str, Any]],
    constraints: list[dict[str, Any]],
    metrics: list[dict[str, Any]],
) -> str:
    sessions = sorted({row["session_id"] for row in runs})
    tasks = sorted({row["task_id"] for row in runs}, key=task_sort_key)
    run_by_key = {(row["session_id"], row["task_id"]): row for row in runs}

    trajectory_series: list[tuple[str, list[float | None]]] = []
    for session in sessions:
        condition = next((row for row in runs if row["session_id"] == session), {})
        name = f"{condition.get('agent','?')}/{condition.get('strategy','?')}"
        trajectory_series.append(
            (name, [run_by_key.get((session, task), {}).get("total_findings") for task in tasks])
        )
    trajectory_chart = svg_line_chart(
        "各实验条件的约束问题演化",
        tasks,
        trajectory_series,
        "Constraint findings (count)",
    )

    categories = []
    backend_values, frontend_values, cross_values = [], [], []
    for session in sessions:
        condition = next((row for row in runs if row["session_id"] == session), {})
        label = f"{condition.get('agent','?')}\n{condition.get('strategy','?')}"
        categories.append(label.replace("\n", " / "))
        session_runs = [row for row in runs if row["session_id"] == session]
        backend_values.append(sum(row["backend_findings"] for row in session_runs))
        frontend_values.append(sum(row["frontend_findings"] for row in session_runs))
        cross_values.append(sum(row["cross_findings"] for row in session_runs))
    condition_chart = svg_grouped_bar(
        "实验条件累计约束问题（描述性比较）",
        categories,
        [("Backend", backend_values), ("Frontend", frontend_values), ("Cross-stack", cross_values)],
        "Findings across tasks (count)",
    )

    run_ids = [row["evaluation_id"] for row in runs]
    run_labels = [f"{row['session_label']} {row['task_id']}" for row in runs]
    rule_totals = Counter(row["rule_id"] for row in constraints)
    top_rules = [name for name, _ in rule_totals.most_common(16)]
    rule_lookup = Counter((row["rule_id"], row["evaluation_id"]) for row in constraints)
    rule_matrix = [[float(rule_lookup[(rule, run_id)]) for run_id in run_ids] for rule in top_rules]
    rule_heatmap = svg_heatmap(
        "规则热点矩阵",
        top_rules,
        run_labels,
        rule_matrix,
        "finding count",
    )

    metric_labels, metric_matrix = metric_badness(metrics, run_ids)
    metric_heatmap = svg_heatmap(
        "指标相对劣化矩阵（按指标内部归一化）",
        metric_labels,
        run_labels,
        metric_matrix,
        "relative badness (0–100)",
        maximum=100,
    )

    file_counts = Counter(row["file"] for row in constraints if row.get("file"))
    file_chart = svg_horizontal_bar(
        "跨 session 重复出现的问题文件",
        file_counts.most_common(15),
        "Findings across evaluations (count)",
    )

    runtime_series = []
    for session in sessions:
        condition = next((row for row in runs if row["session_id"] == session), {})
        name = f"{condition.get('agent','?')}/{condition.get('strategy','?')}"
        runtime_series.append(
            (
                name,
                [
                    (run_by_key.get((session, task), {}).get("duration_ms") or 0) / 1000
                    if run_by_key.get((session, task))
                    else None
                    for task in tasks
                ],
            )
        )
    runtime_chart = svg_line_chart("Harness 运行时长", tasks, runtime_series, "Duration (seconds)")

    error_rows = [row for row in metrics if row["status"] == "error"]
    error_table_rows = "".join(
        "<tr>"
        f"<td>{e(row['evaluation_id'])}</td><td>{e(row['scope_id'])}</td>"
        f"<td>{e(row['metric_name'])}</td><td class='message'>{e(row['findings'])}</td>"
        "</tr>"
        for row in error_rows
    ) or "<tr><td colspan='4'>No metric errors.</td></tr>"

    all_partial = all(row["execution_status"] == "partial" for row in runs)
    status_note = (
        "当前所有 evaluation 的 overall status 都是 partial；在比较架构质量前，应先把 metric/adapter error 与真实规则失败分开。"
        if all_partial
        else "Overall status 存在差异，可结合下方 metric error 表判断是代码问题还是测量失败。"
    )
    max_rule = rule_totals.most_common(1)[0] if rule_totals else ("none", 0)
    avg_coverage = mean(row["metric_coverage"] for row in runs) if runs else 0
    generated_summary = (
        f"共纳入 {len(runs)} 次 evaluation、{len(sessions)} 个 session、{len(constraints)} 条约束 finding。"
        f"最高频规则是 {max_rule[0]}（{max_rule[1]} 条）；平均 metric coverage 为 {avg_coverage:.0%}。"
    )

    css = """
    :root { color-scheme: light dark; --bg:#f8fafc; --surface:#fff; --text:#101828; --muted:#475467; --line:#d0d5dd; --soft:#f2f4f7; }
    @media (prefers-color-scheme: dark) { :root { --bg:#0b1220; --surface:#111827; --text:#f2f4f7; --muted:#cbd5e1; --line:#344054; --soft:#1f2937; } }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { max-width:1500px; margin:0 auto; padding:34px 24px 60px; }
    h1 { margin:0 0 8px; font-size:30px; letter-spacing:-0.02em; }
    h2 { margin:38px 0 8px; font-size:21px; }
    h3 { margin:22px 0 8px; font-size:16px; }
    p { color:var(--muted); line-height:1.65; max-width:1100px; }
    .summary { padding:14px 16px; border-left:4px solid #175cd3; background:var(--surface); }
    .chart-shell { overflow-x:auto; background:var(--surface); border:1px solid var(--line); margin:14px 0 22px; }
    .chart { display:block; min-width:760px; width:100%; height:auto; background:var(--surface); }
    .chart-title { fill:var(--text); font-size:17px; font-weight:650; }
    .plot-frame { fill:var(--surface); stroke:var(--line); }
    .grid { stroke:var(--line); stroke-width:1; opacity:.65; }
    .tick, .legend, .row-label, .axis-title, .value { fill:var(--text); font-size:11px; }
    .row-label { font-size:10.5px; }
    .axis-title { font-size:12px; font-weight:600; }
    .value { font-weight:650; }
    .table-wrap { overflow:auto; border:1px solid var(--line); background:var(--surface); }
    table { width:100%; border-collapse:collapse; font-size:12px; white-space:nowrap; }
    th { position:sticky; top:0; z-index:1; background:var(--soft); text-align:left; }
    th, td { padding:9px 10px; border-bottom:1px solid var(--line); }
    td.num { text-align:right; font-variant-numeric:tabular-nums; }
    td.message { white-space:normal; min-width:460px; max-width:760px; line-height:1.45; }
    .status { display:inline-block; padding:2px 7px; border-radius:10px; background:#fff4e5; color:#93370d; font-weight:650; }
    .status-completed, .status-pass, .status-passed, .status-valid { background:#ecfdf3; color:#027a48; }
    .status-failed, .status-error, .status-fail, .status-invalid { background:#fef3f2; color:#b42318; }
    .method { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; margin-top:14px; }
    .method section { background:var(--surface); border:1px solid var(--line); padding:14px; }
    .method h3 { margin:0 0 6px; }
    .method p { margin:0; font-size:13px; }
    code { color:var(--text); }
    """

    return f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Harness Evaluation Analysis</title><style>{css}</style></head>
<body><main>
<h1>Harness Evaluation 可视化分析</h1>
<p>{e(generated_summary)}</p>
<div class="summary"><strong>解释优先级：</strong>{e(status_note)}</div>

<h2>分析框架</h2>
<div class="method">
  <section><h3>1. 测量可靠性</h3><p>先看 overall/scope status、metric coverage 和 error。回答“结果是否可比”，避免把工具崩溃解释成架构退化。</p></section>
  <section><h3>2. 任务内演化</h3><p>以 session 为轨迹，观察 T1→T2→T3 的 finding 数变化。回答“持续开发是否累积架构债务”。</p></section>
  <section><h3>3. 实验条件</h3><p>按 agent × strategy 做描述性比较。当前每个条件只有一个 session，只能观察，不能作因果或显著性结论。</p></section>
  <section><h3>4. 规则与文件热点</h3><p>规则×evaluation 热图定位系统性违规；文件排名定位反复承载问题的架构边界。</p></section>
  <section><h3>5. 连续指标</h3><p>不同 metric 单位不可直接相加，因此在每个 metric 内按方向做 0–100 相对劣化归一化；原值保存在 CSV。</p></section>
  <section><h3>6. 性能与完整性</h3><p>运行时长用于发现 Harness 成本和异常；缺失值保持为缺失，不用 0 填充。</p></section>
</div>

<h2>Evaluation 总览表</h2>
<p>这是分析入口：先筛出 metric error 和 subject error，再阅读 finding 数。Metric coverage = 有数值 score 的 metrics / 已返回 metrics。</p>
{make_run_table(runs)}

<h2>轨迹与实验条件</h2>
<p>折线保留每个 session 的任务顺序；柱状图按条件累计所有任务，仅用于描述当前样本。</p>
<div class="chart-shell">{trajectory_chart}</div>
<div class="chart-shell">{condition_chart}</div>

<h2>架构违规热点</h2>
<p>热图使用原始 finding 数。它适合识别重复失败的规则，但不应把不同规则的绝对数量直接当作严重度。</p>
<div class="chart-shell">{rule_heatmap}</div>
<div class="chart-shell">{file_chart}</div>

<h2>连续指标的相对变化</h2>
<p>每一行只在同一 metric 内比较：0 表示当前观测中较好，100 表示较差；higher_is_better 已反向处理。行与行之间不能比较绝对质量。</p>
<div class="chart-shell">{metric_heatmap}</div>

<h2>Harness 运行成本</h2>
<div class="chart-shell">{runtime_chart}</div>

<h2>Metric 错误明细</h2>
<p>这些属于测量失败，不是架构违规。修复后应重跑 Harness，再进行条件比较。</p>
<div class="table-wrap"><table><thead><tr><th>Evaluation</th><th>Subject</th><th>Metric</th><th>Error evidence</th></tr></thead><tbody>{error_table_rows}</tbody></table></div>
</main></body></html>"""


def build_file_hotspots(constraints: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counter = Counter(row["file"] for row in constraints if row.get("file"))
    sessions_by_file: dict[str, set[str]] = defaultdict(set)
    rules_by_file: dict[str, set[str]] = defaultdict(set)
    for row in constraints:
        if row.get("file"):
            sessions_by_file[row["file"]].add(row["session_id"])
            rules_by_file[row["file"]].add(row["rule_id"])
    return [
        {
            "file": path,
            "finding_count": count,
            "session_count": len(sessions_by_file[path]),
            "rule_count": len(rules_by_file[path]),
            "rules": " | ".join(sorted(rules_by_file[path])),
        }
        for path, count in counter.most_common()
    ]


def main() -> None:
    script_dir = Path(__file__).resolve().parent
    reports_dir = script_dir.parent
    parser = argparse.ArgumentParser(description="Analyze all Harness evaluation JSON files")
    parser.add_argument(
        "--experiments-dir",
        type=Path,
        default=reports_dir / "experiments",
        help="Directory containing session_* folders",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=script_dir / "output",
        help="Directory for dashboard, CSVs, and summary JSON",
    )
    parser.add_argument(
        "--include-reruns",
        action="store_true",
        help="Include nested rerun harness_evaluation.json files in addition to canonical task outputs",
    )
    args = parser.parse_args()

    experiments_dir = args.experiments_dir.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    paths = discover_evaluations(experiments_dir, args.include_reruns)
    runs, constraints, metrics = load_data(paths, experiments_dir)
    hotspots = build_file_hotspots(constraints)

    output_dir.mkdir(parents=True, exist_ok=True)
    write_csv(output_dir / "run_summary.csv", runs)
    write_csv(output_dir / "constraint_findings.csv", constraints)
    write_csv(output_dir / "metric_values.csv", metrics)
    write_csv(output_dir / "file_hotspots.csv", hotspots)

    summary = {
        "evaluation_count": len(runs),
        "session_count": len({row["session_id"] for row in runs}),
        "tasks": sorted({row["task_id"] for row in runs}, key=task_sort_key),
        "execution_status_counts": dict(
            Counter(row["execution_status"] for row in runs)
        ),
        "compliance_status_counts": dict(
            Counter(row["compliance_status"] for row in runs)
        ),
        "comparison_status_counts": dict(
            Counter(row["comparison_status"] for row in runs)
        ),
        "constraint_finding_count": len(constraints),
        "metric_observation_count": len(metrics),
        "metric_error_count": sum(row["status"] == "error" for row in metrics),
        "average_metric_coverage": mean(row["metric_coverage"] for row in runs),
        "top_rules": Counter(row["rule_id"] for row in constraints).most_common(20),
        "top_files": [[row["file"], row["finding_count"]] for row in hotspots[:20]],
        "source_files": [str(path) for path in paths],
    }
    (output_dir / "analysis_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (output_dir / "index.html").write_text(
        build_dashboard(runs, constraints, metrics),
        encoding="utf-8",
    )

    print(f"Analyzed {len(runs)} evaluations from {len(summary['source_files'])} JSON files.")
    print(f"Dashboard: {output_dir / 'index.html'}")
    print(f"CSV tables: {output_dir}")


if __name__ == "__main__":
    main()
