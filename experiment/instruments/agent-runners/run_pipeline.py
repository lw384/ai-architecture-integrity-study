#!/usr/bin/env python3
# experiment/instruments/agent-runners/run_pipeline.py
import argparse
import subprocess
from datetime import datetime
from pathlib import Path

from config import get_agent_config
from prompt_builder import build_mega_prompt
from docker_runner import setup_and_run_agent
from evaluator import run_harness_evaluation


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
        "--live-output",
        action="store_true",
        help="流式打印 Agent 输出，并在静默时输出工作区心跳",
    )
    parser.add_argument(
        "--heartbeat-seconds",
        type=int,
        default=30,
        help="实时模式下，长时间无输出时打印心跳的秒数间隔",
    )
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
        baseline_dir,
        workspace_dir,
        run_id,
        args.agent,
        final_prompt,
        config,
        live_output=args.live_output,
        heartbeat_seconds=args.heartbeat_seconds,
    )

    # 4. 运行 Harness 评估
    print("🔍 [4/4] 触发 Harness 自动化评估...")

    git_context = build_run_git_context(workspace_dir, baseline_dir)

    evaluation_result = run_harness_evaluation(
        root_dir=root_dir,
        baseline_dir=baseline_dir,
        trajectory_dir=workspace_dir,
        run_id=run_id,
        task_id=args.task,
        pre_commit=git_context["pre_commit"],
        post_commit=git_context["post_commit"],
        baseline_commit=git_context["baseline_commit"],
    )

    status = evaluation_result.get("status", "unknown (or skipped)")
    print(f"📊 评估最终状态: {status}")

    print(f"🎉 实验全流程结束！产物位于: {workspace_dir}")


if __name__ == "__main__":
    main()
