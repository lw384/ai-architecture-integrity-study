#!/usr/bin/env python3
"""Parse raw experiment artifacts into tidy CSV tables under data/.

This is the ONLY module in reports/analysis that reads
reports/experiments/**/*.json, reports/baseline/*.json, or
session_manifest.yaml. Every stage script downstream reads data/*.csv
instead — if a raw artifact's schema changes, this is the one file that
needs to change.

Produces seven tables:
  data/runs.csv                one row per harness evaluation (+ baseline)
  data/constraint_findings.csv one row per constraint finding
  data/metric_observations.csv one row per metric observation
  data/task_completion.csv     one row per agent execution attempt
                                (T1-T3 acceptance-gate data; see
                                docs/methodology/analysis.md §2.3)
  data/acceptance_failures.csv one row per failed assertion, unresolved
                                adapter target, or suite-level test error
  data/review_runs.csv         one row per T4 self-review (agent x strategy),
                                even when it reported zero findings
  data/review_findings.csv     one row per T4 self-reported finding
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

# Codex CLI's execution.json never sets metrics.total_cost_usd (unlike the
# Claude Agent SDK, which prices each run itself) — usage.usage only gives
# token counts. Estimate cost from those counts using the gpt-5.3-codex
# pricing tier below (USD per 1M tokens; the model used throughout this
# dataset — see execution.json metrics.model). Provided by the user
# 2026-08-19 from the OpenAI pricing page:
#   Category  Model          Input   Cached input   Output
#   Codex     gpt-5.3-codex  $1.75   $0.175         $14.00
# Caveat: reasoning_output_tokens is treated as already included in
# output_tokens (not billed separately); no other API-side fees are
# modeled. Claude rows use the SDK-reported total_cost_usd directly and
# never take this path.
CODEX_PRICE_PER_MILLION_USD = {
    "input": 1.75,
    "cached_input": 0.175,
    "output": 14.00,
}


def estimate_codex_cost_usd(usage: dict[str, Any]) -> float | None:
    """USD estimate for one Codex run from its raw token usage, or None if
    usage is missing/incomplete."""
    input_tokens = usage.get("input_tokens")
    cached_tokens = usage.get("cached_input_tokens")
    output_tokens = usage.get("output_tokens")
    if input_tokens is None or cached_tokens is None or output_tokens is None:
        return None
    fresh_input_tokens = max(input_tokens - cached_tokens, 0)
    return (
        fresh_input_tokens * CODEX_PRICE_PER_MILLION_USD["input"]
        + cached_tokens * CODEX_PRICE_PER_MILLION_USD["cached_input"]
        + output_tokens * CODEX_PRICE_PER_MILLION_USD["output"]
    ) / 1_000_000


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


def adapter_version_key(version: str | None) -> tuple[int, ...]:
    """Numeric ordering for v2/v2.1; legacy unversioned results sort first."""
    numbers = re.findall(r"\d+", version or "")
    return tuple(int(number) for number in numbers) if numbers else (-1,)


def select_acceptance_artifacts(
    task_dir: Path,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, str | None]:
    """Select the newest run from the highest adapter version, preserving raw runs.

    The pipeline-time result remains at <task>/test_result.json. Acceptance-only
    reruns live under <task>/acceptance_runs/<run_id>/, so no historical file is
    overwritten. Unversioned legacy results are used only when no versioned run
    exists for that task.
    """
    result_paths = [task_dir / "test_result.json"]
    runs_dir = task_dir / "acceptance_runs"
    if runs_dir.exists():
        result_paths.extend(sorted(runs_dir.glob("*/test_result.json")))

    candidates = []
    for result_path in result_paths:
        result = read_json(result_path)
        if result is None:
            continue
        version = result.get("adapter_version") or (result.get("adapter") or {}).get("version")
        timestamp = result.get("completed_at") or result.get("run_id") or result_path.parent.name
        candidates.append((adapter_version_key(version), str(timestamp), str(result_path), result_path, result))

    if not candidates:
        return None, None, None

    _, _, _, selected_path, selected_result = max(candidates)
    execution = read_json(selected_path.parent / "test_execution.json")
    return selected_result, execution, str(selected_path.relative_to(task_dir))


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
    test_result_source: str | None = None,
) -> dict[str, Any]:
    metrics = execution.get("metrics") or {}
    usage = metrics.get("usage") or {}
    suites = (test_result or {}).get("suites") or []
    failed_suite_ids = [s.get("suite_id") for s in suites if s.get("status") == "fail"]
    adapter = (test_result or {}).get("adapter") or {}
    unresolved = adapter.get("unresolved") or []
    suite_outcomes = [s.get("outcome") for s in suites if s.get("outcome")]

    def sum_suite_test_cases(field: str) -> int | None:
        """Sum a test-case count across selected acceptance suites.

        Return None rather than zero when no suites exist or a suite omits the
        requested count, so missing acceptance evidence is never presented as
        a legitimate zero-test run.
        """
        values = [suite.get(field) for suite in suites]
        if not values or not all(isinstance(value, (int, float)) for value in values):
            return None
        return int(sum(values))

    test_cases_total = sum_suite_test_cases("total")
    test_cases_passed = sum_suite_test_cases("passed")
    test_cases_failed = sum_suite_test_cases("failed")
    if all(value is not None for value in (test_cases_total, test_cases_passed, test_cases_failed)):
        if test_cases_passed + test_cases_failed != test_cases_total:
            raise ValueError(
                f"Acceptance test counts do not reconcile for {session_id}/{task_id}: "
                f"passed={test_cases_passed}, failed={test_cases_failed}, total={test_cases_total}"
            )

    # Token accounting differs by agent, so normalize into a common
    # fresh/cached-input + output shape rather than dumping each SDK's raw
    # field names side by side:
    #   Claude usage: input_tokens (fresh), cache_creation_input_tokens
    #                 (written to cache), cache_read_input_tokens (served
    #                 from cache), output_tokens
    #   Codex usage:  input_tokens (fresh + cached combined),
    #                 cached_input_tokens (the cached subset of the above),
    #                 cache_write_input_tokens, output_tokens,
    #                 reasoning_output_tokens (subset of output_tokens)
    agent = config.get("agent") or "unknown"
    if agent == "codex":
        cached_input_tokens = usage.get("cached_input_tokens")
        total_input_tokens = usage.get("input_tokens")
        fresh_input_tokens = (
            max(total_input_tokens - cached_input_tokens, 0)
            if total_input_tokens is not None and cached_input_tokens is not None
            else None
        )
        cache_write_tokens = usage.get("cache_write_input_tokens")
        output_tokens = usage.get("output_tokens")
        reasoning_output_tokens = usage.get("reasoning_output_tokens")
        total_cost_usd = metrics.get("total_cost_usd")  # always null for codex, kept for schema symmetry
        estimated_cost_usd = estimate_codex_cost_usd(usage)
        cost_usd = total_cost_usd if total_cost_usd is not None else estimated_cost_usd
        cost_basis = (
            "reported" if total_cost_usd is not None
            else "estimated_gpt-5.3-codex_pricing" if estimated_cost_usd is not None
            else "unknown"
        )
    else:
        fresh_input_tokens = usage.get("input_tokens")
        cached_input_tokens = usage.get("cache_read_input_tokens")
        cache_write_tokens = usage.get("cache_creation_input_tokens")
        output_tokens = usage.get("output_tokens")
        reasoning_output_tokens = None  # not applicable to Claude
        total_cost_usd = metrics.get("total_cost_usd")
        cost_usd = total_cost_usd
        cost_basis = "reported" if total_cost_usd is not None else "unknown"

    return {
        "session_id": session_id,
        "task_id": task_id,
        "task_order": task_order(task_id),
        "agent": agent,
        "strategy": config.get("strategy") or "unknown",
        "model": config.get("model") or "unknown",
        "agent_status": metrics.get("status") or "unknown",
        "completion_marker_found": metrics.get("completion_marker_found"),
        "agent_reported_error": metrics.get("agent_reported_error"),
        "exit_code": metrics.get("exit_code"),
        "num_turns": metrics.get("num_turns"),
        "duration_seconds": metrics.get("duration_seconds"),
        "tokens_input_fresh": fresh_input_tokens,
        "tokens_input_cached": cached_input_tokens,
        "tokens_cache_write": cache_write_tokens,
        "tokens_output": output_tokens,
        "tokens_reasoning_output": reasoning_output_tokens,
        "total_cost_usd": total_cost_usd,
        "cost_usd": cost_usd,
        "cost_basis": cost_basis,
        "test_status": (test_result or {}).get("status") or ("no_data" if test_result is None else "unknown"),
        "test_reason": (test_result or {}).get("reason"),
        "test_suite_count": len(suites) if suites else ((test_execution or {}).get("suites") and len(test_execution["suites"])) or 0,
        "test_cases_total": test_cases_total,
        "test_cases_passed": test_cases_passed,
        "test_cases_failed": test_cases_failed,
        "test_failed_suite_ids": " | ".join(str(s) for s in failed_suite_ids),
        "test_run_id": (test_result or {}).get("run_id"),
        "adapter_version": (test_result or {}).get("adapter_version") or adapter.get("version"),
        "adapter_outcomes": " | ".join(str(outcome) for outcome in suite_outcomes),
        "adapter_unresolved_count": len(unresolved),
        "test_result_source": test_result_source,
    }


def _acceptance_execution_suite_lookup(
    test_execution: dict[str, Any] | None,
) -> dict[str, dict[str, Any]]:
    """Index detailed suite execution records by suite id."""
    return {
        str(suite.get("suite_id")): suite
        for suite in (test_execution or {}).get("suites") or []
        if suite.get("suite_id")
    }


def _failure_details_lookup(execution_suite: dict[str, Any]) -> dict[str, list[str]]:
    """Map assertion/suite ids to the detailed Jest/Vitest failure messages."""
    details = (execution_suite.get("summary") or {}).get("failed_details") or []
    return {
        str(detail.get("id")): [
            str(message) for message in detail.get("failure_messages") or []
        ]
        for detail in details
        if detail.get("id")
    }


def _failure_attribution(
    *,
    raw_classification: str,
    suite_status: str,
    suite_reason: str | None,
    has_matching_unresolved: bool,
) -> tuple[str, str, bool]:
    """Conservative automatic attribution for acceptance failures.

    This is deliberately not a binary oracle. An unresolved route/field may
    mean either naming variance or a missing feature, so it stays indeterminate
    until a human or a stronger semantic probe resolves it. Only failures that
    occur after transport adaptation are labelled requirement-noncompliance
    *candidates*, never confirmed defects.
    """
    if suite_status == "error":
        return "infrastructure_error", "high", False
    if suite_reason == "adapter_unresolved" or has_matching_unresolved:
        return "interface_unresolved", "medium", True
    if raw_classification in {"route_variance", "selector_variance", "field_variance"}:
        return "interface_unresolved", "medium", True
    if raw_classification == "status_variance":
        return "interface_contract_variance", "medium", True
    if raw_classification == "harness_context":
        return "test_harness_context", "high", True
    if raw_classification == "behaviour_or_unclassified":
        return "requirement_noncompliance_candidate", "medium", True
    return "unclassified", "low", True


def extract_acceptance_failure_rows(
    test_result: dict[str, Any] | None,
    test_execution: dict[str, Any] | None,
    session_id: str,
    task_id: str,
    config: dict[str, Any],
    test_result_source: str | None,
) -> list[dict[str, Any]]:
    """Flatten selected acceptance evidence to one row per diagnostic event.

    Assertion failures are joined to their full failure messages from
    test_execution.json. Adapter targets that do not correspond to an assertion
    become their own rows, as do suite-level infrastructure errors. This keeps
    representation variance separate from behavioural noncompliance candidates.
    """
    if not test_result:
        return []

    agent = config.get("agent") or "unknown"
    strategy = config.get("strategy") or "unknown"
    run_id = test_result.get("run_id")
    adapter_version = test_result.get("adapter_version") or (
        (test_result.get("adapter") or {}).get("version")
    )
    execution_suites = _acceptance_execution_suite_lookup(test_execution)
    global_unresolved = (test_result.get("adapter") or {}).get("unresolved") or []
    unresolved_by_suite: dict[str, list[dict[str, Any]]] = {}
    for item in global_unresolved:
        unresolved_by_suite.setdefault(str(item.get("suite_id") or "unknown"), []).append(item)

    rows: list[dict[str, Any]] = []
    for suite in test_result.get("suites") or []:
        suite_id = str(suite.get("suite_id") or "unknown")
        suite_status = str(suite.get("status") or "unknown")
        suite_reason = suite.get("reason")
        execution_suite = execution_suites.get(suite_id, {})
        details_by_id = _failure_details_lookup(execution_suite)
        classifications = {
            str(item.get("id")): item
            for item in suite.get("failure_classifications") or []
            if item.get("id")
        }
        failed_ids = {
            str(value) for value in suite.get("failed_ids") or [] if value
        }
        failed_ids.update(classifications)
        failed_ids.update(details_by_id)
        suite_unresolved = unresolved_by_suite.get(suite_id, [])

        total = suite.get("total")
        failed = suite.get("failed")
        failure_rate = (
            failed / total
            if isinstance(failed, (int, float))
            and isinstance(total, (int, float))
            and total > 0
            else None
        )
        cascade_candidate = bool(
            isinstance(failed, (int, float))
            and failed >= 3
            and failure_rate is not None
            and failure_rate >= 0.5
        )

        emitted_unresolved: set[tuple[str, str]] = set()
        for failure_id in sorted(failed_ids):
            classification = classifications.get(failure_id) or {}
            raw_classification = str(
                classification.get("classification") or "behaviour_or_unclassified"
            )
            matching_unresolved = [
                item
                for item in suite_unresolved
                if str(item.get("semantic_target") or "") == failure_id
            ]
            for item in matching_unresolved:
                emitted_unresolved.add(
                    (str(item.get("kind") or "unknown"), str(item.get("semantic_target") or ""))
                )
            attribution, confidence, manual_review = _failure_attribution(
                raw_classification=raw_classification,
                suite_status=suite_status,
                suite_reason=suite_reason,
                has_matching_unresolved=bool(matching_unresolved),
            )
            messages = details_by_id.get(failure_id, [])
            rows.append(
                {
                    "session_id": session_id,
                    "task_id": task_id,
                    "task_order": task_order(task_id),
                    "agent": agent,
                    "strategy": strategy,
                    "suite_id": suite_id,
                    "event_type": "assertion_failure",
                    "failure_id": failure_id,
                    "checkpoint": (
                        (re.search(r"checkpoint\s+(\d+)", failure_id, re.IGNORECASE) or [None, None])[1]
                    ),
                    "raw_classification": raw_classification,
                    "final_attribution": attribution,
                    "attribution_confidence": confidence,
                    "review_required": bool(
                        classification.get("review_required", manual_review)
                    ),
                    "suite_status": suite_status,
                    "suite_outcome": suite.get("outcome"),
                    "suite_reason": suite_reason,
                    "suite_total": total,
                    "suite_failed": failed,
                    "suite_failure_rate": failure_rate,
                    "cascade_candidate": cascade_candidate,
                    "failure_message": "\n\n".join(messages),
                    "adapter_unresolved_kind": " | ".join(
                        str(item.get("kind") or "unknown") for item in matching_unresolved
                    ),
                    "adapter_version": adapter_version,
                    "test_run_id": run_id,
                    "test_result_source": test_result_source,
                }
            )

        # Preserve unresolved adapter targets even when no assertion id exists
        # (for example a missing adapter report or an undiscovered route).
        for item in suite_unresolved:
            unresolved_key = (
                str(item.get("kind") or "unknown"),
                str(item.get("semantic_target") or ""),
            )
            if unresolved_key in emitted_unresolved:
                continue
            rows.append(
                {
                    "session_id": session_id,
                    "task_id": task_id,
                    "task_order": task_order(task_id),
                    "agent": agent,
                    "strategy": strategy,
                    "suite_id": suite_id,
                    "event_type": "adapter_unresolved",
                    "failure_id": item.get("semantic_target") or f"adapter:{item.get('kind', 'unknown')}",
                    "checkpoint": None,
                    "raw_classification": item.get("kind") or "adapter_unresolved",
                    "final_attribution": "interface_unresolved",
                    "attribution_confidence": "medium",
                    "review_required": True,
                    "suite_status": suite_status,
                    "suite_outcome": suite.get("outcome"),
                    "suite_reason": suite_reason,
                    "suite_total": total,
                    "suite_failed": failed,
                    "suite_failure_rate": failure_rate,
                    "cascade_candidate": cascade_candidate,
                    "failure_message": json.dumps(item.get("attempted"), ensure_ascii=False),
                    "adapter_unresolved_kind": item.get("kind"),
                    "adapter_version": adapter_version,
                    "test_run_id": run_id,
                    "test_result_source": test_result_source,
                }
            )

        if suite_status == "error" and not failed_ids:
            install = execution_suite.get("install") or {}
            test = execution_suite.get("test") or {}
            reason = suite_reason or execution_suite.get("reason") or "suite_error"
            evidence = [install.get("stderr"), test.get("stderr"), install.get("stdout"), test.get("stdout")]
            rows.append(
                {
                    "session_id": session_id,
                    "task_id": task_id,
                    "task_order": task_order(task_id),
                    "agent": agent,
                    "strategy": strategy,
                    "suite_id": suite_id,
                    "event_type": "suite_error",
                    "failure_id": f"suite:{suite_id}:{reason}",
                    "checkpoint": None,
                    "raw_classification": "infrastructure_error",
                    "final_attribution": "infrastructure_error",
                    "attribution_confidence": "high",
                    "review_required": False,
                    "suite_status": suite_status,
                    "suite_outcome": suite.get("outcome"),
                    "suite_reason": reason,
                    "suite_total": total,
                    "suite_failed": failed,
                    "suite_failure_rate": failure_rate,
                    "cascade_candidate": False,
                    "failure_message": "\n\n".join(str(value) for value in evidence if value),
                    "adapter_unresolved_kind": "",
                    "adapter_version": adapter_version,
                    "test_run_id": run_id,
                    "test_result_source": test_result_source,
                }
            )

    # A database failure occurs before suites exist.
    if test_result.get("status") == "error" and not (test_result.get("suites") or []):
        rows.append(
            {
                "session_id": session_id,
                "task_id": task_id,
                "task_order": task_order(task_id),
                "agent": agent,
                "strategy": strategy,
                "suite_id": "all",
                "event_type": "run_error",
                "failure_id": f"run:{test_result.get('reason') or 'infrastructure_error'}",
                "checkpoint": None,
                "raw_classification": "infrastructure_error",
                "final_attribution": "infrastructure_error",
                "attribution_confidence": "high",
                "review_required": False,
                "suite_status": "error",
                "suite_outcome": "infrastructure_error",
                "suite_reason": test_result.get("reason"),
                "suite_total": None,
                "suite_failed": None,
                "suite_failure_rate": None,
                "cascade_candidate": False,
                "failure_message": json.dumps((test_execution or {}).get("db"), ensure_ascii=False),
                "adapter_unresolved_kind": "",
                "adapter_version": adapter_version,
                "test_run_id": run_id,
                "test_result_source": test_result_source,
            }
        )

    return rows


# ---------------------------------------------------------------------------
# T4/review.md + T4/task_manifest.yaml -> review_runs / review_findings
# ---------------------------------------------------------------------------
#
# T4 findings.json (written by experiment/instruments/agent-runners/
# review_runner.py) is itself a *derived* artifact of review.md, and its
# parser only recognizes the bullet-list format T4.md asks for. One real
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
# Agents wrap the field name in whatever markdown emphasis they feel like —
# seen so far: `severity` (backticks, codex) and **severity** (bold,
# claude). Tolerate any run of backtick/asterisk/underscore around the name.
REVIEW_BULLET_PATTERN = re.compile(
    r"-\s*[`*_]*(" + "|".join(REVIEW_FINDING_FIELDS) + r")[`*_]*\s*:\s*(.*)"
)
REVIEW_LOCATION_PATH_PATTERN = re.compile(r"`([^`]+)`")
# Some agents wrap the whole *value* in backticks too (e.g. `- **severity**:
# \`high\``). Only unwrap when the entire value is one backtick span — a
# multi-file `location` value has several separate backtick spans and must
# be left alone for extract_referenced_files() to split.
_FULL_WRAP_BACKTICK_PATTERN = re.compile(r"^`([^`]*)`$")


def _unwrap_single_backtick_value(value: str) -> str:
    match = _FULL_WRAP_BACKTICK_PATTERN.match(value)
    return match.group(1) if match else value


def _parse_review_bullets(text: str) -> list[dict[str, str]]:
    blocks: list[list[tuple[str, str]]] = []
    for line in text.splitlines():
        match = REVIEW_BULLET_PATTERN.match(line.strip())
        if not match:
            continue
        field = match.group(1)
        value = _unwrap_single_backtick_value(match.group(2).strip())
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
        "task_id": "T4",
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
                "task_id": "T4",
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
    acceptance_failure_rows: list[dict[str, Any]] = []
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
            test_result, test_execution, test_result_source = select_acceptance_artifacts(task_dir)
            completion_rows.append(
                build_task_completion_record(
                    execution,
                    test_result,
                    test_execution,
                    session_id,
                    task_id,
                    config,
                    test_result_source,
                )
            )
            acceptance_failure_rows.extend(
                extract_acceptance_failure_rows(
                    test_result,
                    test_execution,
                    session_id,
                    task_id,
                    config,
                    test_result_source,
                )
            )

        if task_id == "T4" and (task_dir / "review.md").exists() and (task_dir / "task_manifest.yaml").exists():
            review_run, findings = build_review_records(task_dir, session_id, config)
            review_run_rows.append(review_run)
            review_finding_rows.extend(findings)

    return {
        "runs": runs,
        "constraint_findings": constraint_rows,
        "metric_observations": metric_rows,
        "task_completion": completion_rows,
        "acceptance_failures": acceptance_failure_rows,
        "review_runs": review_run_rows,
        "review_findings": review_finding_rows,
    }


# Explicit schemas for tables that can legitimately be empty this early in
# data collection (e.g. no T4 review has produced a parseable finding yet).
# Without this, pd.DataFrame([]).to_csv() writes a file with no header row
# at all, and every downstream pd.read_csv() on it raises EmptyDataError —
# "no data yet" should read as an empty table, not a crash.
TABLE_COLUMNS: dict[str, list[str]] = {
    "acceptance_failures": [
        "session_id", "task_id", "task_order", "agent", "strategy",
        "suite_id", "event_type", "failure_id", "checkpoint",
        "raw_classification", "final_attribution", "attribution_confidence",
        "review_required", "suite_status", "suite_outcome", "suite_reason",
        "suite_total", "suite_failed", "suite_failure_rate",
        "cascade_candidate", "failure_message", "adapter_unresolved_kind",
        "adapter_version", "test_run_id", "test_result_source",
    ],
    "review_runs": [
        "session_id", "task_id", "agent", "strategy",
        "reviewed_from_tag", "reviewed_commit", "review_status", "n_findings",
    ],
    "review_findings": [
        "session_id", "task_id", "agent", "strategy", "reviewed_commit",
        "severity", "location", "issue", "impact", "recommended_improvement",
        "referenced_files",
    ],
}


def write_csv(rows: list[dict[str, Any]], path: Path, table_name: str | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame = pd.DataFrame(rows)
    if frame.empty and table_name in TABLE_COLUMNS:
        frame = pd.DataFrame(columns=TABLE_COLUMNS[table_name])
    frame.to_csv(path, index=False)


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

    write_csv(tables["runs"], output_dir / "runs.csv", "runs")
    write_csv(tables["constraint_findings"], output_dir / "constraint_findings.csv", "constraint_findings")
    write_csv(tables["metric_observations"], output_dir / "metric_observations.csv", "metric_observations")
    write_csv(tables["task_completion"], output_dir / "task_completion.csv", "task_completion")
    write_csv(tables["acceptance_failures"], output_dir / "acceptance_failures.csv", "acceptance_failures")
    write_csv(tables["review_runs"], output_dir / "review_runs.csv", "review_runs")
    write_csv(tables["review_findings"], output_dir / "review_findings.csv", "review_findings")

    print(f"runs.csv:                 {len(tables['runs'])} rows")
    print(f"constraint_findings.csv:  {len(tables['constraint_findings'])} rows")
    print(f"metric_observations.csv:  {len(tables['metric_observations'])} rows")
    print(f"task_completion.csv:      {len(tables['task_completion'])} rows")
    print(f"acceptance_failures.csv:  {len(tables['acceptance_failures'])} rows")
    print(f"review_runs.csv:          {len(tables['review_runs'])} rows")
    print(f"review_findings.csv:      {len(tables['review_findings'])} rows")
    print(f"Written to {output_dir}")


if __name__ == "__main__":
    main()
