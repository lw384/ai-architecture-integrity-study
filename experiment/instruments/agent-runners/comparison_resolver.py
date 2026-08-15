#!/usr/bin/env python3
"""Resolve baseline and pre-task evaluation artifacts for one trajectory step."""

import json
from pathlib import Path


BASELINE_REFS = frozenset({"baseline", "baseline-with-memory"})


def load_evaluation(path: Path) -> dict:
    """Read one complete v0.3 artifact suitable for trajectory comparison."""
    if not path.is_file():
        raise FileNotFoundError(f"Evaluation artifact not found: {path}")

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"Evaluation artifact is invalid JSON: {path}") from error

    if not isinstance(data, dict):
        raise ValueError(f"Evaluation artifact must contain a JSON object: {path}")

    if data.get("schema_version") != "0.3.0":
        raise ValueError(f"Evaluation artifact is not schema v0.3.0: {path}")
    if data.get("execution_status") != "completed":
        raise ValueError(f"Evaluation artifact is not complete: {path}")
    if data.get("comparison_status") != "valid":
        raise ValueError(f"Evaluation artifact comparison is not valid: {path}")
    if not data.get("evaluation_profile_hash"):
        raise ValueError(f"Evaluation artifact has no profile hash: {path}")

    return data


def resolve_baseline_evaluation(root_dir: Path) -> Path:
    """Return the canonical E0 artifact produced by baseline Harness mode."""
    path = root_dir / "reports" / "baseline" / "harness_evaluation.json"
    if not path.is_file():
        raise FileNotFoundError(
            "Baseline evaluation does not exist. "
            "Run run_harness.py --baseline before starting a trajectory."
        )

    resolved_path = path.resolve()
    load_evaluation(resolved_path)
    return resolved_path


def evaluation_post_commit(path: Path) -> str | None:
    """Extract the evaluated post commit from one artifact."""
    evaluation = load_evaluation(path)
    target = evaluation.get("target")
    if not isinstance(target, dict):
        return None

    post_commit = target.get("post_commit")
    return post_commit if isinstance(post_commit, str) and post_commit else None


def find_evaluation_by_post_commit(
    session_archive_dir: Path,
    pre_commit: str,
    excluded_task_id: str | None = None,
) -> Path:
    """Find the unique canonical task artifact that evaluated ``pre_commit``."""
    matches: list[Path] = []

    for path in sorted(session_archive_dir.glob("T*/harness_evaluation.json")):
        if excluded_task_id and path.parent.name == excluded_task_id:
            continue
        if evaluation_post_commit(path) == pre_commit:
            matches.append(path.resolve())

    if not matches:
        raise FileNotFoundError(
            f"No evaluation in {session_archive_dir} matches pre_commit={pre_commit}"
        )

    if len(matches) > 1:
        rendered = ", ".join(str(path) for path in matches)
        raise RuntimeError(
            f"Multiple evaluations match pre_commit={pre_commit}: {rendered}"
        )

    return matches[0]


def resolve_comparison_evaluations(
    root_dir: Path,
    session_archive_dir: Path,
    task_id: str,
    start_ref: str,
    pre_commit: str,
) -> tuple[Path, Path]:
    """Resolve E0 and the artifact representing the current task's pre state."""
    baseline_evaluation = resolve_baseline_evaluation(root_dir)

    if start_ref in BASELINE_REFS:
        return baseline_evaluation, baseline_evaluation

    pre_evaluation = find_evaluation_by_post_commit(
        session_archive_dir=session_archive_dir,
        pre_commit=pre_commit,
        excluded_task_id=task_id,
    )
    return baseline_evaluation, pre_evaluation
