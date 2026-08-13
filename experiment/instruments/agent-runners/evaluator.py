#!/usr/bin/env python3
# experiment/instruments/agent-runners/evaluator.py

import json
import subprocess
from pathlib import Path


def resolve_task_config_path(harness_dir: Path, task_id: str) -> Path:
    task_config_path = harness_dir / "tasks" / f"{task_id}.eval.yaml"

    if not task_config_path.exists():
        raise FileNotFoundError(f"Harness task config not found: {task_config_path}")

    return task_config_path

def read_evaluation_output(eval_output_path):
    if not eval_output_path.exists():
        raise FileNotFoundError(
            f"Harness 未生成 evaluation.json: {eval_output_path}"
        )

    try:
        return json.loads(eval_output_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(
            f"evaluation.json 不是合法 JSON: {eval_output_path}"
        ) from error

def describe_baseline_revision(baseline_dir):
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=baseline_dir,
        capture_output=True,
        text=True,
        check=False,
    )

    if result.returncode == 0:
        return result.stdout.strip()
    return f"external-dir:{baseline_dir}"

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


def build_manifest_data(task_id, baseline_commit, pre_commit):
    return {
        "status": "ready_for_evaluation",
        "task_id": task_id,
        "baseline_commit": baseline_commit,
        "pre_commit": pre_commit,
        "rulepack_id": f"task::{task_id}",
    }


def build_harness_command(
    harness_dir,
    workspace_dir,
    manifest_path,
    task_config_path,
    eval_output_path,
    baseline_dir,
    run_id,
    pre_commit,
    post_commit,
) -> list[str]:
    return [
        "node",
        "core/evaluate.mjs",
        "--target",
        str(workspace_dir),
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
        workspace_dir.name,
        "--output",
        str(eval_output_path),
        "--mode",
        "full",
    ]



def write_json(path, data):
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def run_harness_evaluation(
    root_dir,
    baseline_dir,
    workspace_dir,
    task_archive_dir,
    run_id,
    task_id,
    pre_commit,
    post_commit,
):
    """
    评估当前 workspace 的当前代码状态。

    评估输入和结果归档到：
    reports/experiments/<session_id>/<task_id>/
    """
    harness_dir = root_dir / "harness"

    if not workspace_dir.is_dir():
        raise NotADirectoryError(f"workspace 不存在: {workspace_dir}")

    if not baseline_dir.is_dir():
        raise NotADirectoryError(f"baseline 不存在: {baseline_dir}")

    manifest_path = task_archive_dir / "manifest.json"
    evaluation_path = task_archive_dir / "harness_evaluation.json"
    execution_path = task_archive_dir / "harness_execution.json"
    task_config_path = resolve_task_config_path(harness_dir, task_id)

    baseline_commit = describe_baseline_revision(baseline_dir)

    manifest_data = build_manifest_data(
        task_id=task_id,
        baseline_commit=baseline_commit,
        pre_commit=pre_commit,
    )
    write_json(manifest_path, manifest_data)

    cmd = build_harness_command(
        harness_dir=harness_dir,
        workspace_dir=workspace_dir,
        manifest_path=manifest_path,
        task_config_path=task_config_path,
        eval_output_path=evaluation_path,
        baseline_dir=baseline_dir,
        run_id=run_id,
        pre_commit=pre_commit,
        post_commit=post_commit,
    )

    print(f"📄 Harness manifest: {manifest_path}")
    print(f"🧭 Harness task config: {task_config_path}")
    print("⏳ 开始运行 harness（最长 10 分钟）...")

    try:
        result = run_harness_cli(harness_dir, cmd)
    except subprocess.TimeoutExpired as error:
        write_json(
            execution_path,
            {
                "harness_status": "failure",
                "run_id": run_id,
                "exit_code": None,
                "timed_out": True,
                "command": cmd,
                "stdout": error.stdout or "",
                "stderr": error.stderr or "",
            },
        )
        return {
            "harness_status": "failure",
            "exit_code": None,
            "evaluation_path": str(evaluation_path),
            "execution_path": str(execution_path),
            "evaluation": None,
        }

    execution_data = {
        "harness_status": "success" if result.returncode == 0 else "failure",
        "run_id": run_id,
        "exit_code": result.returncode,
        "timed_out": False,
        "command": cmd,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }
    write_json(execution_path, execution_data)

    if result.returncode != 0:
        return {
            "harness_status": "failure",
            "exit_code": result.returncode,
            "evaluation_path": str(evaluation_path),
            "execution_path": str(execution_path),
            "evaluation": None,
        }

    try:
        evaluation_data = read_evaluation_output(evaluation_path)
    except (FileNotFoundError, ValueError) as error:
        execution_data["harness_status"] = "failure"
        execution_data["output_error"] = str(error)
        write_json(execution_path, execution_data)

        return {
            "harness_status": "failure",
            "exit_code": result.returncode,
            "evaluation_path": str(evaluation_path),
            "execution_path": str(execution_path),
            "evaluation": None,
        }

    print(f"✅ Harness 完成: {evaluation_path}")

    return {
        "harness_status": "success",
        "exit_code": result.returncode,
        "evaluation_path": str(evaluation_path),
        "execution_path": str(execution_path),
        "evaluation": evaluation_data,
    }
