#!/usr/bin/env python3
# experiment/instruments/agent-runners/evaluator.py

import json
import subprocess
import sys
from pathlib import Path


def resolve_task_config_path(harness_dir: Path, task_id: str) -> Path:
    task_config_path = harness_dir / "tasks" / f"{task_id}.eval.yaml"

    if not task_config_path.exists():
        raise FileNotFoundError(f"Harness task config not found: {task_config_path}")

    return task_config_path


def build_manifest_data(
    task_id: str, baseline_commit: str, pre_commit: str, rulepack_id: str
) -> dict:
    return {
        "status": "ready_for_evaluation",
        "events": ["agent_started", "agent_completed"],
        "task_id": task_id,
        "baseline_commit": baseline_commit,
        "pre_commit": pre_commit,
        "rulepack_id": rulepack_id,
    }


def write_manifest(manifest_path: Path, manifest_data: dict) -> None:
    manifest_path.write_text(json.dumps(manifest_data, indent=2), encoding="utf-8")


def build_harness_command(
    harness_dir: Path,
    trajectory_dir: Path,
    manifest_path: Path,
    task_config_path: Path,
    eval_output_path: Path,
    baseline_dir: Path,
    run_id: str,
    trajectory_id: str,
    pre_commit: str,
    post_commit: str,
) -> list[str]:
    return [
        "node",
        "core/evaluate.mjs",
        "--target",
        str(trajectory_dir),
        "--manifest",
        str(manifest_path),
        "--task-config",
        str(task_config_path),
        "--rulepack",
        str(harness_dir / "rulepacks"),
        "--baseline",
        str(baseline_dir),
        "--pre-commit",
        pre_commit,
        "--post-commit",
        post_commit,
        "--run-id",
        run_id,
        "--trajectory-id",
        trajectory_id,
        "--output",
        str(eval_output_path),
        "--mode",
        "full",
    ]


def run_harness_cli(
    harness_dir: Path, cmd: list[str]
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=str(harness_dir),
        capture_output=True,
        text=True,
        check=False,
        timeout=600,
    )


def read_evaluation_output(eval_output_path: Path) -> dict:
    if not eval_output_path.exists():
        print(
            "🚨 [Evaluator] Harness exited with code 0 but did not produce evaluation.json."
        )
        sys.exit(1)

    with open(eval_output_path, "r", encoding="utf-8") as f:
        return json.load(f)


def run_harness_evaluation(
    root_dir: Path,
    baseline_dir: Path,
    trajectory_dir: Path,
    artifact_dir: Path | None,
    run_id: str,
    task_id: str,
    pre_commit: str,
    post_commit: str,
    baseline_commit: str = "baseline-sha-000",
) -> dict:
    """
    Thin bridge from experiment runs into the harness CLI.
    It resolves the task config, writes a run manifest, invokes evaluate.mjs,
    and returns the resulting evaluation artifact.
    """
    harness_dir = root_dir / "harness"
    output_dir = artifact_dir if artifact_dir is not None else trajectory_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    eval_output_path = output_dir / "evaluation.json"
    manifest_path = output_dir / "manifest.json"
    task_config_path = resolve_task_config_path(harness_dir, task_id)

    # Manifest currently still requires a rulepack_id even though actual rulepack
    # selection now comes from the task config.
    manifest_data = build_manifest_data(
        task_id=task_id,
        baseline_commit=baseline_commit,
        pre_commit=pre_commit,
        rulepack_id=f"task::{task_id}",
    )
    write_manifest(manifest_path, manifest_data)
    print(f"📄 [Evaluator] Manifest written to: {manifest_path}")
    print(f"🧭 [Evaluator] Using task config: {task_config_path}")

    cmd = build_harness_command(
        harness_dir=harness_dir,
        trajectory_dir=trajectory_dir,
        manifest_path=manifest_path,
        task_config_path=task_config_path,
        eval_output_path=eval_output_path,
        baseline_dir=baseline_dir,
        run_id=run_id,
        trajectory_id=trajectory_dir.name,
        pre_commit=pre_commit,
        post_commit=post_commit,
    )

    print("⏳ [Evaluator] Starting harness evaluation (timeout: 10 minutes)...")

    try:
        result = run_harness_cli(harness_dir, cmd)

        if result.returncode == 0:
            print("✅ [Evaluator] Harness evaluation completed.")
        elif result.returncode == 1:
            print(
                f"🚨 [Evaluator] Fatal harness failure.\nSTDOUT: {result.stdout}\nSTDERR: {result.stderr}"
            )
            sys.exit(1)
        elif result.returncode == 2:
            print(
                f"⚠️ [Evaluator] Harness skipped evaluation.\nSTDERR: {result.stderr}"
            )
            return {}
        else:
            print(
                f"💥 [Evaluator] Unknown harness exit code ({result.returncode}).\nSTDERR: {result.stderr}"
            )
            sys.exit(result.returncode)

    except subprocess.TimeoutExpired:
        print("⏰ [Evaluator] Harness evaluation timed out after 10 minutes.")
        sys.exit(1)

    return read_evaluation_output(eval_output_path)
