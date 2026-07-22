#!/usr/bin/env python3
# experiment/instruments/agent-runners/run_pipeline.py
import argparse
import json
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

from config import get_agent_config
from prompt_builder import build_mega_prompt
from docker_runner import setup_and_run_agent
from evaluator import run_harness_evaluation


def build_reports_paths(root_dir: Path, run_id: str, timestamp: str) -> dict[str, Path]:
    reports_root = root_dir / "reports"
    experiments_root = reports_root / "experiments"
    baselines_root = reports_root / "baselines"

    experiment_run_dir = experiments_root / run_id
    baseline_snapshot_dir = baselines_root / f"baseline_{timestamp}"

    for path in [reports_root, experiments_root, baselines_root, experiment_run_dir, baseline_snapshot_dir]:
        path.mkdir(parents=True, exist_ok=True)

    return {
        "reports_root": reports_root,
        "experiment_run_dir": experiment_run_dir,
        "baseline_snapshot_dir": baseline_snapshot_dir,
    }


def write_yaml_like_manifest(path: Path, data: dict[str, object]) -> None:
    lines = []

    for key, value in data.items():
        if isinstance(value, list):
            lines.append(f"{key}:")
            for item in value:
                lines.append(f"  - {item}")
            continue

        lines.append(f"{key}: {value}")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def copy_if_exists(source: Path, target: Path) -> None:
    if not source.exists():
        return

    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def write_subject_reports(experiment_run_dir: Path, evaluation_result: dict) -> None:
    subjects = evaluation_result.get("subjects", [])

    for subject in subjects:
        subject_id = subject.get("subject_id", "unknown")
        subject_dir = experiment_run_dir / subject_id
        subject_dir.mkdir(parents=True, exist_ok=True)

        report_json_path = subject_dir / "report.json"
        report_json_path.write_text(
            json.dumps(subject, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        constraints_status = subject.get("layers", {}).get("constraints", {}).get("status", "unknown")
        metrics_count = len(subject.get("layers", {}).get("metrics", []))
        report_md_path = subject_dir / "report.md"
        report_md_path.write_text(
            "\n".join(
                [
                    f"# {subject_id} report",
                    "",
                    f"- status: {subject.get('status', 'unknown')}",
                    f"- constraints_status: {constraints_status}",
                    f"- metrics_count: {metrics_count}",
                ],
            )
            + "\n",
            encoding="utf-8",
        )


def write_experiment_summary_csv(experiment_run_dir: Path, evaluation_result: dict) -> None:
    lines = ["subject_id,status,constraints_status,metrics_count"]

    for subject in evaluation_result.get("subjects", []):
        subject_id = subject.get("subject_id", "unknown")
        status = subject.get("status", "unknown")
        constraints_status = subject.get("layers", {}).get("constraints", {}).get("status", "unknown")
        metrics_count = len(subject.get("layers", {}).get("metrics", []))
        lines.append(f"{subject_id},{status},{constraints_status},{metrics_count}")

    (experiment_run_dir / "summary.csv").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_baseline_summary_csv(
    baseline_snapshot_dir: Path,
    task_id: str,
    baseline_commit: str,
    source_run_id: str,
    recorded_at: str,
) -> None:
    lines = [
        "task_id,baseline_commit,source_run_id,recorded_at",
        f"{task_id},{baseline_commit},{source_run_id},{recorded_at}",
    ]
    (baseline_snapshot_dir / "summary.csv").write_text("\n".join(lines) + "\n", encoding="utf-8")


def archive_run_outputs(
    workspace_dir: Path,
    baseline_dir: Path,
    experiment_run_dir: Path,
    baseline_snapshot_dir: Path,
    run_id: str,
    task_id: str,
    args: argparse.Namespace,
    timestamp: str,
    git_context: dict[str, str],
    evaluation_result: dict,
) -> None:
    # Keep evaluator artifacts in archive root.
    write_subject_reports(experiment_run_dir, evaluation_result)
    write_experiment_summary_csv(experiment_run_dir, evaluation_result)

    # Copy agent outputs from workspace.
    copy_if_exists(workspace_dir / "agent_execution.log", experiment_run_dir / "agent_execution.log")
    copy_if_exists(workspace_dir / "execution_metrics.json", experiment_run_dir / "execution_metrics.json")
    copy_if_exists(workspace_dir / "violations_report.md", experiment_run_dir / "violations_report.md")
    copy_if_exists(
        workspace_dir / "frontend_violations_report.md",
        experiment_run_dir / "frontend_violations_report.md",
    )

    # Best-effort copy of backend depcruise raw graph if present.
    copy_if_exists(
        workspace_dir / "backend" / "reports" / "depcruise-raw.json",
        experiment_run_dir / "backend" / "depcruise-raw.json",
    )

    # Write experiment archive manifest.
    write_yaml_like_manifest(
        experiment_run_dir / "manifest.yaml",
        {
            "run_id": run_id,
            "task_id": task_id,
            "agent": args.agent,
            "model": args.model or "default",
            "strategy": args.strategy,
            "timestamp": timestamp,
            "workspace_dir": workspace_dir,
            "baseline_dir": baseline_dir,
            "pre_commit": git_context["pre_commit"],
            "post_commit": git_context["post_commit"],
            "baseline_commit": git_context["baseline_commit"],
            "subjects": ["backend", "frontend"],
        },
    )

    # Baseline snapshot index for this run.
    write_yaml_like_manifest(
        baseline_snapshot_dir / "manifest.yaml",
        {
            "snapshot_id": baseline_snapshot_dir.name,
            "recorded_at": timestamp,
            "source_run_id": run_id,
            "task_id": task_id,
            "baseline_dir": baseline_dir,
            "baseline_commit": git_context["baseline_commit"],
        },
    )
    write_baseline_summary_csv(
        baseline_snapshot_dir=baseline_snapshot_dir,
        task_id=task_id,
        baseline_commit=git_context["baseline_commit"],
        source_run_id=run_id,
        recorded_at=timestamp,
    )
    copy_if_exists(
        baseline_dir / "backend" / "reports" / "depcruise-raw.json",
        baseline_snapshot_dir / "backend" / "depcruise-raw.json",
    )


def read_git_head(repo_dir: Path) -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_dir,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def read_git_head_if_available(repo_dir: Path) -> str | None:
    try:
        return read_git_head(repo_dir)
    except subprocess.CalledProcessError:
        return None


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


def describe_baseline_revision(baseline_dir: Path) -> str:
    baseline_commit = read_git_head_if_available(baseline_dir)

    if baseline_commit is not None:
        return baseline_commit

    return f"external-dir:{baseline_dir}"


def build_run_git_context(workspace_dir: Path, baseline_dir: Path) -> dict[str, str]:
    baseline_commit = describe_baseline_revision(baseline_dir)
    pre_commit = read_git_head(workspace_dir)
    post_commit = describe_post_change_state(workspace_dir, pre_commit)

    return {
        "baseline_commit": baseline_commit,
        "pre_commit": pre_commit,
        "post_commit": post_commit,
    }


def main():
    parser = argparse.ArgumentParser(description="AI 架构完整性对照实验流水线")
    parser.add_argument("--agent", choices=["claude", "codex"], default="claude")
    parser.add_argument("--model", help="覆盖默认模型 (可选)")
    parser.add_argument("--task", required=True, help="任务编号，如 T1")
    parser.add_argument("--strategy", choices=["minimal", "structured"], required=True)
    parser.add_argument("--interface", help="接口文档名称，如 company.md")
    parser.add_argument(
        "--baseline-dir",
        help="baseline 源目录；默认使用仓库根目录下的 baseline",
    )
    args = parser.parse_args()

    # 路径与 ID 初始化
    root_dir = Path(__file__).resolve().parent.parent.parent.parent
    baseline_dir = resolve_baseline_dir(root_dir, args.baseline_dir)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_id = f"run_{args.agent}_{args.task}_{args.strategy}_{timestamp}"
    workspace_dir = root_dir / "experiment" / "workspace" / run_id
    reports_paths = build_reports_paths(root_dir, run_id, timestamp)
    experiment_run_dir = reports_paths["experiment_run_dir"]
    baseline_snapshot_dir = reports_paths["baseline_snapshot_dir"]

    print(
        f"🚀 启动实验 | Agent: {args.agent} | Task: {args.task} | Strategy: {args.strategy}"
    )
    print(f"📦 Baseline 源目录: {baseline_dir}")

    # 1. 获取配置
    config = get_agent_config(args.agent, args.model)

    # 2. 组装 Prompt
    final_prompt = build_mega_prompt(root_dir, args.task, args.strategy, args.interface)

    # 3. 执行容器沙盒
    setup_and_run_agent(
        baseline_dir, workspace_dir, run_id, args.agent, final_prompt, config
    )

    # 4. 运行 Harness 评估
    print("🔍 [4/4] 触发 Harness 自动化评估...")

    git_context = build_run_git_context(workspace_dir, baseline_dir)

    evaluation_result = run_harness_evaluation(
        root_dir=root_dir,
        baseline_dir=baseline_dir,
        trajectory_dir=workspace_dir,
        artifact_dir=experiment_run_dir,
        run_id=run_id,
        task_id=args.task,
        pre_commit=git_context["pre_commit"],
        post_commit=git_context["post_commit"],
        baseline_commit=git_context["baseline_commit"],
    )

    archive_run_outputs(
        workspace_dir=workspace_dir,
        baseline_dir=baseline_dir,
        experiment_run_dir=experiment_run_dir,
        baseline_snapshot_dir=baseline_snapshot_dir,
        run_id=run_id,
        task_id=args.task,
        args=args,
        timestamp=timestamp,
        git_context=git_context,
        evaluation_result=evaluation_result,
    )

    status = evaluation_result.get("status", "unknown (or skipped)")
    print(f"📊 评估最终状态: {status}")

    print(f"🎉 实验全流程结束！归档产物位于: {experiment_run_dir}")


if __name__ == "__main__":
    main()
