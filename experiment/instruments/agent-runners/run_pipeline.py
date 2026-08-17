import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

from comparison_resolver import resolve_comparison_evaluations
from config import get_agent_config
from docker_runner import (
    DEFAULT_RUNTIME_IMAGE,
    run_agent_task,
    run_workspace_container_command,
)
from evaluator import run_harness_evaluation
from prompt_builder import build_mega_prompt
from test_runner import run_functional_tests

INITIAL_MEMORY_TEMPLATE = Path("experiment/design/memory/initial_memory.md")

WORKSPACE_COPY_IGNORE = shutil.ignore_patterns(
    ".git",
    "node_modules",
    "dist",
    "coverage",
    "build",
    ".next",
    ".cache",
    ".pnpm-store",
)
WORKSPACE_PROJECTS = ("backend", "frontend")
GENERATED_DIRECTORY_NAMES = frozenset(
    {
        "node_modules",
        "dist",
        "coverage",
        "build",
        ".next",
        ".cache",
        ".pnpm-store",
    }
)
NPM_CI_EXTRA_ARGS = {
    # This lockfile was generated with legacy peer dependency resolution, so
    # npm ci must use the same setting to reproduce it.
    "frontend": ("--legacy-peer-deps",),
}
DEPENDENCY_MARKER_FILENAME = ".experiment-runtime.json"


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


def copy_workspace_source(baseline_dir: Path, workspace_dir: Path) -> None:
    """Copy source inputs without dependency trees or generated output."""
    shutil.copytree(
        baseline_dir,
        workspace_dir,
        ignore=WORKSPACE_COPY_IGNORE,
    )


def dependency_install_command(project_dir: Path, project_name: str) -> list[str]:
    """Select a reproducible install command from the project's lockfile."""
    if (project_dir / "package-lock.json").is_file():
        return ["npm", "ci", *NPM_CI_EXTRA_ARGS.get(project_name, ())]

    if (project_dir / "pnpm-lock.yaml").is_file():
        return ["pnpm", "install", "--frozen-lockfile"]

    raise FileNotFoundError(f"Dependency lockfile not found: {project_dir}")


def dependency_lockfile(project_dir: Path) -> Path:
    for filename in ("package-lock.json", "pnpm-lock.yaml"):
        lockfile = project_dir / filename
        if lockfile.is_file():
            return lockfile
    raise FileNotFoundError(f"Dependency lockfile not found: {project_dir}")


def dependency_marker_data(project_dir: Path, image: str) -> dict[str, str]:
    lockfile = dependency_lockfile(project_dir)
    return {
        "image": image,
        "lockfile": lockfile.name,
        "lockfile_sha256": hashlib.sha256(lockfile.read_bytes()).hexdigest(),
        "platform": "linux",
    }


def dependencies_are_current(project_dir: Path, image: str) -> bool:
    marker_path = project_dir / "node_modules" / DEPENDENCY_MARKER_FILENAME
    if not marker_path.is_file():
        return False

    try:
        marker = json.loads(marker_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return False
    return marker == dependency_marker_data(project_dir, image)


def install_workspace_dependencies_in_container(
    workspace_dir: Path,
    run_id: str,
    image: str,
    project_names: tuple[str, ...] = WORKSPACE_PROJECTS,
) -> None:
    """Install project dependencies with npm/pnpm inside a Linux container."""
    for project_name in project_names:
        project_dir = workspace_dir / project_name

        if not (project_dir / "package.json").is_file():
            raise FileNotFoundError(f"Project package.json not found: {project_dir}")

        command = dependency_install_command(project_dir, project_name)
        print(
            f"📦 Linux 容器安装 {project_name} 依赖: "
            f"{' '.join(command)} ({image})"
        )
        result = run_workspace_container_command(
            workspace_dir=workspace_dir,
            run_id=f"{run_id}-deps-{project_name}",
            image=image,
            command=command,
            working_directory=f"/workspace/{project_name}",
            timeout_seconds=900,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"Container dependency installation failed for {project_name} "
                f"with exit code {result.returncode}:\n"
                f"{result.stderr.strip() or result.stdout.strip()}"
            )

        marker_path = project_dir / "node_modules" / DEPENDENCY_MARKER_FILENAME
        marker_path.write_text(
            json.dumps(
                dependency_marker_data(project_dir, image),
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )


def ensure_workspace_dependencies_in_container(
    workspace_dir: Path,
    run_id: str,
    image: str,
) -> None:
    """Restore missing, stale, or non-Linux dependency trees in a container."""
    projects_to_install = tuple(
        project_name
        for project_name in WORKSPACE_PROJECTS
        if not dependencies_are_current(workspace_dir / project_name, image)
    )
    if not projects_to_install:
        return

    status_before = git(workspace_dir, "status", "--porcelain").stdout
    install_workspace_dependencies_in_container(
        workspace_dir=workspace_dir,
        run_id=run_id,
        image=image,
        project_names=projects_to_install,
    )

    status_after = git(workspace_dir, "status", "--porcelain").stdout
    if status_after != status_before:
        raise RuntimeError(
            "Dependency restoration modified tracked workspace files:\n"
            f"{status_after.strip()}"
        )


def assert_clean_after_dependency_install(workspace_dir: Path) -> None:
    """Ensure a frozen dependency install did not alter source inputs."""
    status = git(workspace_dir, "status", "--porcelain").stdout.strip()
    if status:
        raise RuntimeError(
            "Dependency installation modified tracked workspace files:\n"
            f"{status}"
        )


def staged_generated_paths(workspace_dir: Path) -> list[str]:
    """Return staged paths that belong to dependency or generated trees."""
    staged_paths = git(
        workspace_dir,
        "diff",
        "--cached",
        "--name-only",
        "--diff-filter=ACMRTUXBD",
    ).stdout.splitlines()

    return [
        file_path
        for file_path in staged_paths
        if GENERATED_DIRECTORY_NAMES.intersection(file_path.split("/"))
    ]


def create_new_workspace(root_dir, baseline_dir, args, config):
    """Copy baseline and initialize an independent session repository."""
    session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    workspace_dir = root_dir / "experiment" / "workspace" / session_id

    # The session owns its Git history; dependencies and generated output are
    # rebuilt from committed inputs instead of copied from the baseline tree.
    copy_workspace_source(baseline_dir, workspace_dir)

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

    generated_paths = staged_generated_paths(workspace_dir)
    if generated_paths:
        rendered_paths = "\n".join(f"  - {path}" for path in generated_paths[:20])
        remaining_count = len(generated_paths) - 20
        if remaining_count > 0:
            rendered_paths += f"\n  - ... and {remaining_count} more"
        raise RuntimeError(
            "Refusing to commit dependency or generated files:\n"
            f"{rendered_paths}"
        )

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
                f"  runtime_image: {args.runtime_image}",
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
    parser.add_argument(
        "--runtime-image",
        default=DEFAULT_RUNTIME_IMAGE,
        help=(
            "依赖安装和功能验收测试使用的纯 Node Linux 镜像 "
            f"(默认: {DEFAULT_RUNTIME_IMAGE})"
        ),
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

    run_id = f"{session_id}_{args.task}_{datetime.now().strftime('%H%M%S')}"
    ensure_workspace_dependencies_in_container(
        workspace_dir=workspace_dir,
        run_id=run_id,
        image=args.runtime_image,
    )
    assert_clean_after_dependency_install(workspace_dir)

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
        image=args.runtime_image,
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
