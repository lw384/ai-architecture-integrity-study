#!/usr/bin/env python3
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

from evaluator import run_harness_evaluation


def resolve_baseline_dir(root_dir: Path, baseline_dir_arg: str | None) -> Path:
    if baseline_dir_arg is None:
        baseline_dir = root_dir / "baseline"
    else:
        candidate = Path(baseline_dir_arg).expanduser()
        baseline_dir = candidate if candidate.is_absolute() else root_dir / candidate

    baseline_dir = baseline_dir.resolve()

    if not baseline_dir.exists():
        raise FileNotFoundError(f"Baseline directory not found: {baseline_dir}")

    if not baseline_dir.is_dir():
        raise NotADirectoryError(f"Baseline path is not a directory: {baseline_dir}")

    return baseline_dir


def resolve_workspace_dir(root_dir: Path, run_id: str | None, workspace_dir: str | None) -> Path:
    if run_id and workspace_dir:
        raise ValueError("Provide either --run-id or --workspace-dir, not both")

    if not run_id and not workspace_dir:
        raise ValueError("Either --run-id or --workspace-dir is required")

    if run_id:
        resolved = (root_dir / "experiment" / "workspace" / run_id).resolve()
    else:
        candidate = Path(workspace_dir).expanduser()
        resolved = candidate.resolve() if candidate.is_absolute() else (root_dir / candidate).resolve()

    if not resolved.exists() or not resolved.is_dir():
        raise FileNotFoundError(f"Workspace directory not found: {resolved}")

    return resolved


def read_json_if_exists(path: Path) -> dict:
    if not path.exists():
        return {}

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def read_git_head(repo_dir: Path) -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_dir,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def is_worktree_dirty(repo_dir: Path) -> bool:
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=repo_dir,
        capture_output=True,
        text=True,
        check=True,
    )
    return bool(result.stdout.strip())


def describe_post_change_state(repo_dir: Path, pre_commit: str) -> str:
    return f"{pre_commit}+dirty" if is_worktree_dirty(repo_dir) else pre_commit


def copy_if_exists(source: Path, target: Path) -> None:
    if not source.exists():
        return

    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def detect_task_id(args_task: str | None, workspace_manifest: dict) -> str:
    if args_task:
        return args_task

    task_id = workspace_manifest.get("task_id")
    if isinstance(task_id, str) and task_id.strip():
        return task_id.strip()

    raise ValueError("Cannot determine task id. Provide --task or ensure workspace manifest has task_id")


def detect_baseline_commit(workspace_manifest: dict, fallback: str) -> str:
    baseline_commit = workspace_manifest.get("baseline_commit")
    if isinstance(baseline_commit, str) and baseline_commit.strip():
        return baseline_commit.strip()

    return fallback


def main() -> None:
    parser = argparse.ArgumentParser(description="Run harness evaluation only for an existing experiment workspace")
    parser.add_argument("--run-id", help="Workspace run id under experiment/workspace")
    parser.add_argument("--workspace-dir", help="Workspace directory path (absolute or repo-relative)")
    parser.add_argument("--task", help="Task id override, e.g. T0/T1")
    parser.add_argument("--baseline-dir", help="Baseline source directory; default is repo_root/baseline")
    parser.add_argument(
        "--output-run-id",
        help="Output folder name under reports/experiments; defaults to workspace folder name",
    )
    args = parser.parse_args()

    root_dir = Path(__file__).resolve().parent.parent.parent.parent
    workspace_dir = resolve_workspace_dir(root_dir, args.run_id, args.workspace_dir)
    baseline_dir = resolve_baseline_dir(root_dir, args.baseline_dir)

    workspace_manifest = read_json_if_exists(workspace_dir / "manifest.json")
    task_id = detect_task_id(args.task, workspace_manifest)

    pre_commit = workspace_manifest.get("pre_commit") if isinstance(workspace_manifest.get("pre_commit"), str) else None
    if not pre_commit:
        pre_commit = read_git_head(workspace_dir)

    post_commit = describe_post_change_state(workspace_dir, pre_commit)
    baseline_commit = detect_baseline_commit(workspace_manifest, fallback=read_git_head(baseline_dir))

    output_run_id = args.output_run_id or workspace_dir.name
    reports_dir = (root_dir / "reports" / "experiments" / output_run_id).resolve()
    reports_dir.mkdir(parents=True, exist_ok=True)

    print(f"🎯 Workspace: {workspace_dir}")
    print(f"🧭 Task: {task_id}")
    print(f"📦 Baseline: {baseline_dir}")
    print(f"🗂️ Output: {reports_dir}")

    evaluation_result = run_harness_evaluation(
        root_dir=root_dir,
        baseline_dir=baseline_dir,
        trajectory_dir=workspace_dir,
        artifact_dir=reports_dir,
        run_id=f"harness_only_{output_run_id}",
        task_id=task_id,
        pre_commit=pre_commit,
        post_commit=post_commit,
        baseline_commit=baseline_commit,
    )

    # Mirror key workspace artifacts into reports bundle for easier auditing.
    copy_if_exists(workspace_dir / "agent_execution.log", reports_dir / "agent_execution.log")
    copy_if_exists(workspace_dir / "execution_metrics.json", reports_dir / "execution_metrics.json")
    copy_if_exists(workspace_dir / "workspace_git_status.txt", reports_dir / "workspace_git_status.txt")
    copy_if_exists(workspace_dir / "workspace_diff_stat.txt", reports_dir / "workspace_diff_stat.txt")
    copy_if_exists(workspace_dir / "workspace_diff.patch", reports_dir / "workspace_diff.patch")

    status = evaluation_result.get("status", "unknown") if isinstance(evaluation_result, dict) else "unknown"
    print(f"✅ Harness-only evaluation finished. status={status}")
    print(f"📄 Evaluation: {reports_dir / 'evaluation.json'}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"❌ run_harness failed: {exc}")
        sys.exit(1)
