#!/usr/bin/env python3
"""Parse raw experiment artifacts into tidy CSV tables under data/.

This is the ONLY module in reports/analysis that reads
reports/experiments/**/*.json, reports/baseline/*.json, or
session_manifest.yaml. Every stage script downstream reads data/*.csv
instead — if a raw artifact's schema changes, this is the one file that
needs to change.

Produces six tables:
  data/runs.csv                one row per harness evaluation (+ baseline)
  data/constraint_findings.csv one row per constraint finding
  data/metric_observations.csv one row per metric observation
  data/task_completion.csv     one row per agent execution attempt
                                (T1-T3 acceptance-gate data; see
                                docs/methodology/analysis.md §2.3)
  data/review_runs.csv         one row per T5 self-review (agent x strategy),
                                even when it reported zero findings
  data/review_findings.csv     one row per T5 self-reported finding
                                (docs/methodology/analysis.md §6.4)

Run:
    python3 src/ingest.py
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

import pandas as pd
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from taxonomy import subject_and_category  # noqa: E402

TASK_DIGIT_PATTERN = re.compile(r"(\d+)")
BASELINE_SESSION_ID = "baseline"
BASELINE_TASK_ID = "Base"


# ---------------------------------------------------------------------------
# Small IO helpers
# ---------------------------------------------------------------------------

def task_order(task_id: str) -> int:
    """Sort key so trajectory charts run Base -> T1 -> T2 -> ... in order."""
    if task_id in {BASELINE_TASK_ID, BASELINE_SESSION_ID}:
        return 0
    match = TASK_DIGIT_PATTERN.search(task_id or "")
    return int(match.group(1)) if match else 10**9


def read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def read_session_config(session_dir: Path) -> dict[str, Any]:
    """Read session_manifest.yaml with plain PyYAML (it's a small file)."""
    manifest_path = session_dir / "session_manifest.yaml"
    if not manifest_path.exists():
        return {}
    data = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
    config = dict(data.get("initial_config") or {})
    config["created_at"] = data.get("created_at")
    return config


def normalize_finding_file(finding: dict[str, Any], scope_id: str) -> str:
    """Collapse absolute workspace paths so the same logical file reads the
    same way across sessions (e.g. .../workspace/session_x/backend/src/... ->
    backend/src/...)."""
    path = str((finding.get("location") or {}).get("file") or "").replace("\\", "/")
    if not path:
        return ""
    for marker in ("/backend/", "/frontend/"):
        if marker in path:
            return marker.strip("/") + "/" + path.split(marker, 1)[1]
    if scope_id in {"backend", "frontend"} and not path.startswith(f"{scope_id}/"):
        return f"{scope_id}/{path.lstrip('/')}"
    return path


# ---------------------------------------------------------------------------
# harness_evaluation.json -> runs / constraint_findings / metric_observations
# ---------------------------------------------------------------------------

def build_run_record(
    evaluation: dict[str, Any],
    session_id: str,
    task_id: str,
    config: dict[str, Any],
    source_file: Path,
) -> dict[str, Any]:
    scopes = evaluation.get("scopes") or []
    run_local = (evaluation.get("deltas") or {}).get("run_local", {}).get("constraints", {})
    trajectory = (evaluation.get("deltas") or {}).get("trajectory_cumulative", {}).get("constraints", {})
    execution_status = evaluation.get("execution_status") or "unknown"

    introduced_count = run_local.get("introduced_count")
    constraint_result = (
        "indeterminate" if execution_status != "completed"
        else "passed" if introduced_count == 0
        else "failed" if isinstance(introduced_count, int)
        else "unknown"
    )

    record: dict[str, Any] = {
        "evaluation_id": f"{session_id}/{task_id}",
        "session_id": session_id,
        "task_id": task_id,
        "task_order": task_order(task_id),
        "agent": config.get("agent") or "unknown",
        "strategy": config.get("strategy") or "unknown",
        "model": config.get("model") or "unknown",
        "execution_status": execution_status,
        "constraint_result": constraint_result,
        "comparison_status": evaluation.get("comparison_status") or "unknown",
        "duration_ms": evaluation.get("duration_ms"),
        "backend_status": "none",
        "frontend_status": "none",
        "cross_status": "none",
        "rules_evaluated": 0,
        "backend_findings_absolute": 0,
        "frontend_findings_absolute": 0,
        "cross_findings_absolute": 0,
        "metrics_total": 0,
        "metrics_scored": 0,
        "metric_errors": 0,
        "scope_errors": 0,
        "run_local_introduced_count": run_local.get("introduced_count"),
        "run_local_resolved_count": run_local.get("resolved_count"),
        "run_local_net_change": run_local.get("net_change"),
        "trajectory_introduced_count": trajectory.get("introduced_count"),
        "trajectory_resolved_count": trajectory.get("resolved_count"),
        "trajectory_net_change": trajectory.get("net_change"),
        "source_file": str(source_file),
    }

    for scope in scopes:
        scope_id = str(scope.get("scope_id") or "unknown")
        scope_type = str(scope.get("scope_type") or "unknown")
        scope_status = scope.get("status") or "unknown"
        if scope_id in {"backend", "frontend"}:
            record[f"{scope_id}_status"] = scope_status
        if scope_type == "cross-stack":
            record["cross_status"] = scope_status
        if scope_status == "error":
            record["scope_errors"] += 1

        layers = scope.get("layers") or {}
        constraint_layer = layers.get("constraints") or {}
        record["rules_evaluated"] += int(constraint_layer.get("rules_evaluated") or 0)
        findings = constraint_layer.get("findings") or []
        if scope_id in {"backend", "frontend"}:
            record[f"{scope_id}_findings_absolute"] += len(findings)
        if scope_type == "cross-stack":
            record["cross_findings_absolute"] += len(findings)

        for metric in layers.get("metrics") or []:
            record["metrics_total"] += 1
            score = metric.get("score") or {}
            if isinstance(score.get("value"), (int, float)):
                record["metrics_scored"] += 1
            if (metric.get("status") or "unknown") == "error":
                record["metric_errors"] += 1

    record["total_findings_absolute"] = (
        record["backend_findings_absolute"]
        + record["frontend_findings_absolute"]
        + record["cross_findings_absolute"]
    )
    record["metric_coverage"] = (
        record["metrics_scored"] / record["metrics_total"] if record["metrics_total"] else None
    )
    return record


def extract_constraint_rows(
    evaluation: dict[str, Any],
    session_id: str,
    task_id: str,
    config: dict[str, Any],
) -> list[dict[str, Any]]:
    evaluation_id = f"{session_id}/{task_id}"
    agent, strategy = config.get("agent") or "unknown", config.get("strategy") or "unknown"
    rows: list[dict[str, Any]] = []

    def base_row(scope_id: str, finding: dict[str, Any], delta_scope: str, change_type: str) -> dict[str, Any]:
        rule_id = finding.get("rule_id") or "unknown-rule"
        _, cat = subject_and_category(rule_id)
        return {
            "evaluation_id": evaluation_id,
            "session_id": session_id,
            "task_id": task_id,
            "task_order": task_order(task_id),
            "agent": agent,
            "strategy": strategy,
            "scope_id": scope_id,
            "rule_id": rule_id,
            "category": cat,
            "file": normalize_finding_file(finding, scope_id),
            "message": finding.get("message") or "",
            "delta_scope": delta_scope,
            "change_type": change_type,
        }

    # "absolute" = the finding is present in this run's current state,
    # independent of whether it's new. Needed for §2.2's baseline-debt table.
    for scope in evaluation.get("scopes") or []:
        scope_id = str(scope.get("scope_id") or "unknown")
        findings = (scope.get("layers") or {}).get("constraints", {}).get("findings") or []
        rows.extend(base_row(scope_id, finding, "absolute", "current") for finding in findings)

    # "run_local"/"trajectory_cumulative" itemized introduced/resolved lists
    # already embed a "scope" field per finding (backend/frontend/cross-stack).
    deltas = evaluation.get("deltas") or {}
    for delta_scope in ("run_local", "trajectory_cumulative"):
        constraints_delta = deltas.get(delta_scope, {}).get("constraints", {})
        for change_type in ("introduced", "resolved"):
            for finding in constraints_delta.get(change_type) or []:
                scope_id = str(finding.get("scope") or "unknown")
                rows.append(base_row(scope_id, finding, delta_scope, change_type))

    return rows


def extract_metric_rows(
    evaluation: dict[str, Any],
    session_id: str,
    task_id: str,
    config: dict[str, Any],
) -> list[dict[str, Any]]:
    evaluation_id = f"{session_id}/{task_id}"
    agent, strategy = config.get("agent") or "unknown", config.get("strategy") or "unknown"

    # deltas.run_local.metrics / deltas.trajectory_cumulative.metrics carry a
    # "from"/"to"/"delta" triple per (scope, metric name). Index them so they
    # can be joined onto each scope's absolute metric observation below.
    # NOTE: scopes[*].layers.metrics[*].delta_vs_baseline is numerically
    # identical to deltas.trajectory_cumulative.metrics[*].delta (verified
    # against real evaluation.json output) — i.e. it is baseline-relative,
    # not previous-run-relative. Both are kept as separate columns below so
    # a stage script never has to know that equivalence.
    deltas = evaluation.get("deltas") or {}
    delta_lookup: dict[str, dict[tuple[str, str], float | None]] = {"run_local": {}, "trajectory_cumulative": {}}
    for delta_scope in delta_lookup:
        for item in deltas.get(delta_scope, {}).get("metrics") or []:
            delta_lookup[delta_scope][(item.get("scope"), item.get("name"))] = item.get("delta")

    rows: list[dict[str, Any]] = []
    for scope in evaluation.get("scopes") or []:
        scope_id = str(scope.get("scope_id") or "unknown")
        for metric in (scope.get("layers") or {}).get("metrics") or []:
            name = metric.get("name") or "unknown-metric"
            _, cat = subject_and_category(name)
            score = metric.get("score") or {}
            rows.append(
                {
                    "evaluation_id": evaluation_id,
                    "session_id": session_id,
                    "task_id": task_id,
                    "task_order": task_order(task_id),
                    "agent": agent,
                    "strategy": strategy,
                    "scope_id": scope_id,
                    "metric_name": name,
                    "category": cat,
                    "status": metric.get("status") or "unknown",
                    "value": score.get("value"),
                    "unit": score.get("unit"),
                    "direction": score.get("direction"),
                    "delta_run_local": delta_lookup["run_local"].get((scope_id, name)),
                    "delta_trajectory_cumulative": delta_lookup["trajectory_cumulative"].get((scope_id, name)),
                    "findings": " | ".join(str(item) for item in (metric.get("findings") or [])),
                }
            )
    return rows


# ---------------------------------------------------------------------------
# execution.json + test_result.json + test_execution.json -> task_completion
# ---------------------------------------------------------------------------

def build_task_completion_record(
    execution: dict[str, Any],
    test_result: dict[str, Any] | None,
    test_execution: dict[str, Any] | None,
    session_id: str,
    task_id: str,
    config: dict[str, Any],
) -> dict[str, Any]:
    metrics = execution.get("metrics") or {}
    suites = (test_result or {}).get("suites") or []
    failed_suite_ids = [s.get("suite_id") for s in suites if s.get("status") == "fail"]

    return {
        "session_id": session_id,
        "task_id": task_id,
        "task_order": task_order(task_id),
        "agent": config.get("agent") or "unknown",
        "strategy": config.get("strategy") or "unknown",
        "model": config.get("model") or "unknown",
        "agent_status": metrics.get("status") or "unknown",
        "completion_marker_found": metrics.get("completion_marker_found"),
        "agent_reported_error": metrics.get("agent_reported_error"),
        "exit_code": metrics.get("exit_code"),
        "num_turns": metrics.get("num_turns"),
        "total_cost_usd": metrics.get("total_cost_usd"),
        "duration_seconds": metrics.get("duration_seconds"),
        "test_status": (test_result or {}).get("status") or ("no_data" if test_result is None else "unknown"),
        "test_reason": (test_result or {}).get("reason"),
        "test_suite_count": len(suites) if suites else ((test_execution or {}).get("suites") and len(test_execution["suites"])) or 0,
        "test_failed_suite_ids": " | ".join(str(s) for s in failed_suite_ids),
    }


# ---------------------------------------------------------------------------
# T5/review.md + T5/task_manifest.yaml -> review_runs / review_findings
# ---------------------------------------------------------------------------
#
# T5 findings.json (written by experiment/instruments/agent-runners/
# review_runner.py) is itself a *derived* artifact of review.md, and its
# parser only recognizes the bullet-list format T5.md asks for. One real
# run in this dataset had the agent answer with a Markdown table instead,
# which silently produced status="parse_incomplete" with zero findings even
# though the review clearly contains five. Rather than trust that derived
# file, this ingest step re-parses review.md (the actual ground truth)
# with a parser that accepts both forms — reports/analysis stays correct
# even when an upstream artifact's own parser has a bug. (The upstream bug
# is worth fixing separately in review_runner.py; that's outside this
# analysis package.)

REVIEW_FINDING_FIELDS = ("severity", "location", "issue", "impact", "recommended_improvement")
REVIEW_NO_ISSUES_MARKER = "NO_ARCHITECTURE_CONSISTENCY_ISSUES_FOUND"
REVIEW_COMPLETION_MARKER = "[TASK_COMPLETED]"
REVIEW_BULLET_PATTERN = re.compile(r"-\s*`(" + "|".join(REVIEW_FINDING_FIELDS) + r")`\s*:\s*(.*)")
REVIEW_LOCATION_PATH_PATTERN = re.compile(r"`([^`]+)`")


def _parse_review_bullets(text: str) -> list[dict[str, str]]:
    blocks: list[list[tuple[str, str]]] = []
    for line in text.splitlines():
        match = REVIEW_BULLET_PATTERN.match(line.strip())
        if not match:
            continue
        field, value = match.group(1), match.group(2).strip()
        if field == "severity" or not blocks:
            blocks.append([])
        blocks[-1].append((field, value))
    return [dict(block) for block in blocks if block]


def _parse_review_table(text: str) -> list[dict[str, str]]:
    lines = [line.strip() for line in text.splitlines() if line.strip().startswith("|")]
    if len(lines) < 3:
        return []
    header = [cell.strip().strip("`").lower() for cell in lines[0].strip("|").split("|")]
    if not all(field in header for field in REVIEW_FINDING_FIELDS):
        return []
    rows = []
    for line in lines[2:]:  # lines[1] is the "---|---|..." separator
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if len(cells) != len(header):
            continue
        row = dict(zip(header, cells))
        rows.append({field: row.get(field, "") for field in REVIEW_FINDING_FIELDS})
    return rows


def parse_review_markdown(review_markdown: str) -> tuple[str, list[dict[str, str]]]:
    """Return (review_status, findings) — status is one of "issues_found",
    "no_issues_found", or "parse_incomplete" (mirrors review_runner.py)."""
    text = review_markdown.replace(REVIEW_COMPLETION_MARKER, "")
    if REVIEW_NO_ISSUES_MARKER in text:
        return "no_issues_found", []

    findings = _parse_review_table(text) or _parse_review_bullets(text)
    if findings:
        return "issues_found", findings
    return "parse_incomplete", []


def extract_referenced_files(location: str) -> list[str]:
    """Pull normalized file paths out of a finding's `location` text.

    Locations are backtick-quoted `path/to/file.ts:123` fragments, possibly
    several per finding, separated by commas.
    """
    paths = REVIEW_LOCATION_PATH_PATTERN.findall(location or "")
    if not paths:
        paths = [part.strip() for part in (location or "").split(",") if part.strip()]
    return [re.sub(r":\d+(:\d+)?$", "", path.strip()) for path in paths]


def build_review_records(
    review_dir: Path, session_id: str, config: dict[str, Any]
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    review_manifest = yaml.safe_load((review_dir / "task_manifest.yaml").read_text(encoding="utf-8")) or {}
    review_markdown = (review_dir / "review.md").read_text(encoding="utf-8")
    review_status, findings = parse_review_markdown(review_markdown)

    agent, strategy = config.get("agent") or "unknown", config.get("strategy") or "unknown"
    run_record = {
        "session_id": session_id,
        "task_id": "T5",
        "agent": agent,
        "strategy": strategy,
        "reviewed_from_tag": review_manifest.get("reviewed_from_tag"),
        "reviewed_commit": review_manifest.get("reviewed_commit"),
        "review_status": review_status,
        "n_findings": len(findings),
    }

    finding_rows = []
    for finding in findings:
        location = finding.get("location", "")
        finding_rows.append(
            {
                "session_id": session_id,
                "task_id": "T5",
                "agent": agent,
                "strategy": strategy,
                "reviewed_commit": review_manifest.get("reviewed_commit"),
                "severity": finding.get("severity", ""),
                "location": location,
                "issue": finding.get("issue", ""),
                "impact": finding.get("impact", ""),
                "recommended_improvement": finding.get("recommended_improvement", ""),
                "referenced_files": ";".join(extract_referenced_files(location)),
            }
        )
    return run_record, finding_rows


# ---------------------------------------------------------------------------
# Collection
# ---------------------------------------------------------------------------

def discover_task_dirs(experiments_dir: Path) -> list[Path]:
    return sorted(experiments_dir.glob("session_*/T*"))


def collect(experiments_dir: Path, baseline_dir: Path) -> dict[str, list[dict[str, Any]]]:
    runs: list[dict[str, Any]] = []
    constraint_rows: list[dict[str, Any]] = []
    metric_rows: list[dict[str, Any]] = []
    completion_rows: list[dict[str, Any]] = []
    review_run_rows: list[dict[str, Any]] = []
    review_finding_rows: list[dict[str, Any]] = []

    baseline_evaluation_path = baseline_dir / "harness_evaluation.json"
    baseline_evaluation = read_json(baseline_evaluation_path)
    if baseline_evaluation is not None:
        baseline_config = {"agent": "baseline", "strategy": "baseline", "model": "n/a"}
        runs.append(
            build_run_record(
                baseline_evaluation, BASELINE_SESSION_ID, BASELINE_TASK_ID,
                baseline_config, baseline_evaluation_path,
            )
        )
        constraint_rows.extend(
            extract_constraint_rows(baseline_evaluation, BASELINE_SESSION_ID, BASELINE_TASK_ID, baseline_config)
        )
        metric_rows.extend(
            extract_metric_rows(baseline_evaluation, BASELINE_SESSION_ID, BASELINE_TASK_ID, baseline_config)
        )

    for task_dir in discover_task_dirs(experiments_dir):
        session_id, task_id = task_dir.parent.name, task_dir.name
        config = read_session_config(task_dir.parent)

        evaluation = read_json(task_dir / "harness_evaluation.json")
        if evaluation is not None:
            source_file = task_dir / "harness_evaluation.json"
            runs.append(build_run_record(evaluation, session_id, task_id, config, source_file))
            constraint_rows.extend(extract_constraint_rows(evaluation, session_id, task_id, config))
            metric_rows.extend(extract_metric_rows(evaluation, session_id, task_id, config))

        execution = read_json(task_dir / "execution.json")
        if execution is not None:
            test_result = read_json(task_dir / "test_result.json")
            test_execution = read_json(task_dir / "test_execution.json")
            completion_rows.append(
                build_task_completion_record(
                    execution, test_result, test_execution, session_id, task_id, config
                )
            )

        if task_id == "T5" and (task_dir / "review.md").exists() and (task_dir / "task_manifest.yaml").exists():
            review_run, findings = build_review_records(task_dir, session_id, config)
            review_run_rows.append(review_run)
            review_finding_rows.extend(findings)

    return {
        "runs": runs,
        "constraint_findings": constraint_rows,
        "metric_observations": metric_rows,
        "task_completion": completion_rows,
        "review_runs": review_run_rows,
        "review_findings": review_finding_rows,
    }


def write_csv(rows: list[dict[str, Any]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(path, index=False)


def main() -> None:
    analysis_dir = Path(__file__).resolve().parent.parent
    repo_root = analysis_dir.parent.parent

    parser = argparse.ArgumentParser(description="Parse raw experiment artifacts into data/*.csv")
    parser.add_argument("--experiments-dir", type=Path, default=repo_root / "reports" / "experiments")
    parser.add_argument("--baseline-dir", type=Path, default=repo_root / "reports" / "baseline")
    parser.add_argument("--output-dir", type=Path, default=analysis_dir / "data")
    args = parser.parse_args()

    experiments_dir = args.experiments_dir.expanduser().resolve()
    baseline_dir = args.baseline_dir.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()

    tables = collect(experiments_dir, baseline_dir)

    write_csv(tables["runs"], output_dir / "runs.csv")
    write_csv(tables["constraint_findings"], output_dir / "constraint_findings.csv")
    write_csv(tables["metric_observations"], output_dir / "metric_observations.csv")
    write_csv(tables["task_completion"], output_dir / "task_completion.csv")
    write_csv(tables["review_runs"], output_dir / "review_runs.csv")
    write_csv(tables["review_findings"], output_dir / "review_findings.csv")

    print(f"runs.csv:                 {len(tables['runs'])} rows")
    print(f"constraint_findings.csv:  {len(tables['constraint_findings'])} rows")
    print(f"metric_observations.csv:  {len(tables['metric_observations'])} rows")
    print(f"task_completion.csv:      {len(tables['task_completion'])} rows")
    print(f"review_runs.csv:          {len(tables['review_runs'])} rows")
    print(f"review_findings.csv:      {len(tables['review_findings'])} rows")
    print(f"Written to {output_dir}")


if __name__ == "__main__":
    main()
