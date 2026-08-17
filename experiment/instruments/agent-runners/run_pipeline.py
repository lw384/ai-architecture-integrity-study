import argparse
from datetime import datetime
import os
from pathlib import Path
import shutil
import subprocess

from comparison_resolver import resolve_comparison_evaluations
from config import get_agent_config
from docker_runner import run_agent_task
from evaluator import run_harness_evaluation
from prompt_builder import build_mega_prompt
from test_runner import run_functional_tests

INITIAL_MEMORY_TEMPLATE = Path("experiment/design/memory/initial_memory.md")


def git(workspace_dir: Path, *args: str) -> subprocess.CompletedProcess[str]:
    """Run one checked Git command in the isolated workspace."""
    return subprocess.run(
        ["git", *args],
        cwd=workspace_dir,
        check=True,
        text=True,
        capture_output=True,
    )


def resolve_commit(workspace_dir: Path, ref: str) -> str:
    """Resolve a tag, branch, or SHA to an immutable commit SHA."""
    return git(
        workspace_dir,
        "rev-parse",
        "--verify",
        f"{ref}^{{commit}}",
    ).stdout.strip()


def relative_artifact_path(artifact_path: Path, archive_dir: Path) -> str:
    """Store portable artifact references relative to the task archive."""
    return os.path.relpath(artifact_path, start=archive_dir)


def load_initial_memory_content(root_dir: Path) -> str:
    template_path = root_dir / INITIAL_MEMORY_TEMPLATE

    if not template_path.exists():
        raise FileNotFoundError(f"Memory template not found: {template_path}")

    content = template_path.read_text(encoding="utf-8").strip()
    if not content:
        raise ValueError(f"Memory template is empty: {template_path}")

    return content + "\n"


def create_new_workspace(root_dir, baseline_dir, args, config):
    """Copy baseline and initialize an independent session repository."""
    session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    workspace_dir = root_dir / "experiment" / "workspace" / session_id

    # The session owns its Git history; source repository metadata is excluded.
    shutil.copytree(
        baseline_dir,
        workspace_dir,
        ignore=shutil.ignore_patterns(".git"),
    )

    git(workspace_dir, "init", "-q")
    git(workspace_dir, "add", "-A")
    git(workspace_dir, "commit", "-m", "chore: baseline snapshot")
    git(workspace_dir, "tag", "baseline")

    # Memory is committed separately so its experimental condition is explicit.
    if args.write_memory_md:
        memory_filename = config["memory_filename"]
        memory_path = workspace_dir / memory_filename

        initial_memory_content = load_initial_memory_content(root_dir)
        memory_path.write_text(initial_memory_content, encoding="utf-8")
        git(workspace_dir, "add", memory_filename)
        git(workspace_dir, "commit", "-m", "docs: initialize agent memory")
        git(workspace_dir, "tag", "baseline-with-memory")

    return workspace_dir, session_id


def reuse_existing_workspace(
    workspace_dir: Path,
    from_tag: str | None,
    force: bool,
    task_id: str,
) -> str:
    """Validate a reusable session and optionally move it to a start tag."""
    if not workspace_dir.exists():
        raise FileNotFoundError(f"workspace 不存在: {workspace_dir}")

    if not (workspace_dir / ".git").exists():
        raise ValueError(f"无GIT,不能复用: {workspace_dir}")

    if from_tag:
        result = subprocess.run(
            ["git", "rev-parse", "--verify", f"refs/tags/{from_tag}"],
            cwd=workspace_dir,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise ValueError(f"tag 不存在: {from_tag}")

        git(workspace_dir, "checkout", from_tag)

    completed_tag = f"task-{task_id}-done"
    result = subprocess.run(
        ["git", "rev-parse", "--verify", f"refs/tags/{completed_tag}"],
        cwd=workspace_dir,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode == 0 and not force:
        raise ValueError(
            f"{completed_tag} 已存在；若确认重跑，请显式传入 --force"
        )

    return workspace_dir.name


def read_current_tag_or_head(workspace_dir: Path) -> str:
    """Prefer a tag pointing at HEAD, otherwise return the current SHA."""
    result = subprocess.run(
        ["git", "tag", "--points-at", "HEAD"],
        cwd=workspace_dir,
        capture_output=True,
        text=True,
        check=True,
    )

    tags = result.stdout.strip().splitlines()
    if tags:
        return tags[0]

    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=workspace_dir,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def tag_exists(workspace_dir: Path, tag_name: str) -> bool:
    result = subprocess.run(
        ["git", "rev-parse", "--verify", f"refs/tags/{tag_name}"],
        cwd=workspace_dir,
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode == 0


def commit_and_tag_task(workspace_dir: Path, task_id: str, force: bool):
    task_tag = f"task-{task_id}-done"

    if tag_exists(workspace_dir, task_tag):
        if not force:
            raise ValueError(
                f"tag 已存在: {task_tag}；如确认覆盖，请使用 --force"
            )
        # if tag_exists(workspace_dir, task_tag):  # Duplicate check; already true.
        git(workspace_dir, "tag", "-d", task_tag)

    # Commit every agent change so the evaluated post state is immutable.
    git(workspace_dir, "add", "-A")

    staged_changes = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        cwd=workspace_dir,
        check=False,
    )

    if staged_changes.returncode == 0:
        raise RuntimeError(
            f"Agent 宣称完成 {task_id}，但 workspace 没有任何可提交的改动"
        )

    if staged_changes.returncode != 1:
        raise RuntimeError("无法检查 Git 暂存区状态")

    git(workspace_dir, "commit", "-m", f"task: {task_id} completed")

    post_commit = git(
        workspace_dir,
        "rev-parse",
        "HEAD",
    ).stdout.strip()

    git(workspace_dir, "tag", task_tag)

    return post_commit, task_tag


def initialize_session_manifest(
    workspace_dir,
    session_archive_dir,
    session_id,
    args,
    config,
):
    manifest_path = session_archive_dir / "session_manifest.yaml"

    if manifest_path.exists():
        return

    manifest_path.write_text(
        "\n".join(
            [
                f"session_id: {session_id}",
                f"workspace_dir: {workspace_dir}",
                f"created_at: {datetime.now().isoformat()}",
                "initial_config:",
                f"  agent: {args.agent}",
                f"  model: {config['model']}",
                f"  strategy: {args.strategy}",
                f"  write_memory_md: {str(args.write_memory_md).lower()}",
                f"  memory_filename: {config['memory_filename'] if args.write_memory_md else 'none'}",
                "",
            ]
        ),
        encoding="utf-8",
    )


def write_task_manifest(
    task_archive_dir,
    session_id,
    task_id,
    run_id,
    start_tag,
    pre_commit,
    post_commit,
    current_tag,
    requested_from_tag,
    baseline_evaluation_path,
    pre_evaluation_path,
    harness_run,
    test_run,
):
    manifest_path = task_archive_dir / "task_manifest.yaml"

    manifest_path.write_text(
        "\n".join(
            [
                f"session_id: {session_id}",
                f"task_id: {task_id}",
                f"run_id: {run_id}",
                f"start_ref: {start_tag}",
                f"pre_commit: {pre_commit}",
                f"post_commit: {post_commit}",
                f"post_tag: {current_tag}",
                "execution_file: execution.json",
                f"requested_from_tag: {requested_from_tag or 'none'}",
                "prompt_file: prompt.md",
                # "execution_file: execution.json",  # Duplicate legacy entry; disabled.
                "comparison_mode: trajectory",
                "baseline_evaluation_file: "
                f"{relative_artifact_path(baseline_evaluation_path, task_archive_dir)}",
                "pre_evaluation_file: "
                f"{relative_artifact_path(pre_evaluation_path, task_archive_dir)}",
                f"harness_status: {harness_run['harness_status']}",
                "harness_execution_file: harness_execution.json",
                f"harness_evaluation_file: {'harness_evaluation.json' if harness_run['harness_status'] == 'success' else 'none'}",
                # test_status covers the independent functional acceptance suite
                # (experiment/instruments/tests/<task_id>/), not the harness's
                # architecture-integrity evaluation above. "skipped" means no
                # acceptance suite is defined for this task yet, not a failure.
                f"test_status: {test_run['test_status']}",
                f"test_result_file: {test_run['test_result_file'] or 'none'}",
                f"test_execution_file: {test_run['test_execution_file'] or 'none'}",
                "",
            ]
        ),
        encoding="utf-8",
    )


def main():
    parser = argparse.ArgumentParser(description="AI 架构完整性对照实验流水线")
    parser.add_argument("--agent", choices=["claude", "codex"], default="claude")
    parser.add_argument("--model", help="覆盖默认模型 (可选)")
    parser.add_argument("--strategy", choices=["minimal", "structured"], required=True)
    parser.add_argument("--task", required=True, help="本次要执行的 task,如 T1")
    parser.add_argument(
        "--from-workspace",
        help="复用哪个 workspace 目录;不给则新建",
    )
    parser.add_argument(
        "--from-tag",
        help="从哪个 git tag 起跑;不给则用 workspace HEAD",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="覆盖已存在的 tag / 归档,不询问",
    )
    parser.add_argument(
        "--write-memory-md",
        action="store_true",
        help="仅在新建 workspace 时生效,不影响复用",
    )
    args = parser.parse_args()

    root_dir = Path(__file__).resolve().parent.parent.parent.parent
    baseline_dir = root_dir / "baseline"

    # Resolve the selected agent and optional model override.
    config = get_agent_config(args.agent, args.model)

    # workspace_dir = None  # Redundant: both branches assign the workspace.
    if args.from_workspace:
        workspace_dir = Path(args.from_workspace).expanduser().resolve()
        session_id = reuse_existing_workspace(
            workspace_dir,
            args.from_tag,
            args.force,
            args.task,
        )
        print(f"♻️  复用 workspace: {workspace_dir}-{session_id}")
    else:
        workspace_dir, session_id = create_new_workspace(
            root_dir, baseline_dir, args, config
        )
        print(f"🆕 新建 workspace: {workspace_dir}-{session_id}")

    start_tag = read_current_tag_or_head(workspace_dir)
    pre_commit = resolve_commit(workspace_dir, start_tag)
    print(f"📍 起点: {start_tag}")
    print(f"📍 起点 commit: {pre_commit}")

    session_archive_dir = root_dir / "reports" / "experiments" / session_id
    session_archive_dir.mkdir(parents=True, exist_ok=True)

    # Session-level conditions are written once, when the workspace is created.
    if not args.from_workspace:
        initialize_session_manifest(
            workspace_dir,
            session_archive_dir,
            session_id,
            args,
            config,
        )

    # Resolve comparison inputs before the agent runs. Missing history should
    # fail early rather than invalidate an otherwise completed agent task.
    baseline_evaluation_path, pre_evaluation_path = (
        resolve_comparison_evaluations(
            root_dir=root_dir,
            session_archive_dir=session_archive_dir,
            task_id=args.task,
            start_ref=start_tag,
            pre_commit=pre_commit,
        )
    )
    print(f"📊 Baseline evaluation: {baseline_evaluation_path}")
    print(f"📊 Pre evaluation: {pre_evaluation_path}")

    task_archive_dir = session_archive_dir / args.task
    if task_archive_dir.exists() and not args.force:
        raise FileExistsError(
            f"归档已存在: {task_archive_dir}\n"
            "如确认覆盖，请重新运行并加入 --force"
        )
    task_archive_dir.mkdir(parents=True, exist_ok=True)

    memory_filename = None
    candidate_memory_path = workspace_dir / config["memory_filename"]

    if candidate_memory_path.exists():
        memory_filename = config["memory_filename"]

    final_prompt = build_mega_prompt(
        root_dir=root_dir,
        task_id=args.task,
        strategy=args.strategy,
        memory_filename=memory_filename,
    )

    print(f"🧩 已加载任务模板: {args.task}_{args.strategy}.md")

    if memory_filename:
        print(f"本次启用 memory 维护: {memory_filename}")
    else:
        print("本次未启用 memory 维护")

    (task_archive_dir / "prompt.md").write_text(final_prompt, encoding="utf-8")

    run_id = f"{session_id}_{args.task}_{datetime.now().strftime('%H%M%S')}"

    agent_run = run_agent_task(
        workspace_dir=workspace_dir,
        task_artifact_dir=task_archive_dir,
        run_id=run_id,
        agent_name=args.agent,
        final_prompt=final_prompt,
        config=config,
    )

    if agent_run["status"] != "success":
        raise RuntimeError(
            "Agent 未按任务协议成功结束。"
            f"请查看: {task_archive_dir / 'agent_execution.log'}"
        )

    post_commit, current_tag = commit_and_tag_task(
        workspace_dir=workspace_dir,
        task_id=args.task,
        force=args.force,
    )

    print(f"✅ Git commit: {post_commit}")
    print(f"🏷️  Task tag: {current_tag}")
    # Evaluate the immutable task commit immediately after tagging it.
    harness_run = run_harness_evaluation(
        root_dir=root_dir,
        baseline_dir=baseline_dir,
        workspace_dir=workspace_dir,
        task_archive_dir=task_archive_dir,
        run_id=run_id,
        task_id=args.task,
        pre_commit=pre_commit,
        post_commit=post_commit,
        comparison_mode="trajectory",
        baseline_evaluation_path=baseline_evaluation_path,
        pre_evaluation_path=pre_evaluation_path,
    )

    # Independent functional acceptance suite (does the feature actually work),
    # separate from the harness's architecture-integrity evaluation above. A
    # missing suite for this task_id is not an error: run_functional_tests
    # returns test_status="skipped" and the pipeline continues.
    test_run = run_functional_tests(
        root_dir=root_dir,
        workspace_dir=workspace_dir,
        task_archive_dir=task_archive_dir,
        task_id=args.task,
        run_id=run_id,
    )
    print(f"🧪 Functional acceptance: {test_run['test_status']}")

    write_task_manifest(
        task_archive_dir=task_archive_dir,
        session_id=session_id,
        task_id=args.task,
        run_id=run_id,
        start_tag=start_tag,
        pre_commit=pre_commit,
        post_commit=post_commit,
        current_tag=current_tag,
        requested_from_tag=args.from_tag,
        baseline_evaluation_path=baseline_evaluation_path,
        pre_evaluation_path=pre_evaluation_path,
        harness_run=harness_run,
        test_run=test_run,
    )

    if test_run["test_status"] == "error":
        print(
            "⚠️  验收测试基础设施未能正常运行（不是功能失败），"
            f"请查看: {task_archive_dir / (test_run['test_execution_file'] or 'test_execution.json')}"
        )

    if harness_run["harness_status"] != "success":
        raise RuntimeError(
            "Harness 运行失败。"
            f"请查看: {harness_run['execution_path']}"
        )
    print(f"\n🎉 Task {args.task} 完成")
    print("💡 继续下一个 task:")
    # print(f"   python run_pipeline.py --task <TN> --strategy {args.strategy} \\")
    # print(f"     --from-workspace {workspace_dir}")


if __name__ == "__main__":
    main()
