#!/usr/bin/env python3
import argparse
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from comparison_resolver import resolve_comparison_evaluations
from evaluator import run_harness_evaluation


HARNESS_OUTPUT_FILES = (
    "manifest.json",
    "harness_execution.json",
    "harness_evaluation.json",
)


def format_evaluation_status(evaluation: dict) -> str:
    """Render v0.3 execution status and the finding-derived constraint result."""
    execution_status = evaluation.get("execution_status", "unknown")
    introduced_count = (
        evaluation.get("deltas", {})
        .get("run_local", {})
        .get("constraints", {})
        .get("introduced_count")
    )
    constraint_result = (
        "indeterminate"
        if execution_status != "completed"
        else "passed"
        if introduced_count == 0
        else "failed"
        if isinstance(introduced_count, int)
        else "unknown"
    )
    return ", ".join(
        [
            f"execution={execution_status}",
            f"constraints={constraint_result} (introduced={introduced_count})",
            f"comparison={evaluation.get('comparison_status', 'unknown')}",
        ]
    )


def resolve_baseline_dir(root_dir: Path, baseline_dir_arg: str | None) -> Path:
    if baseline_dir_arg is None:
        baseline_dir = root_dir / "baseline"
    else:
        candidate = Path(baseline_dir_arg).expanduser()
        baseline_dir = candidate if candidate.is_absolute() else root_dir / candidate

    baseline_dir = baseline_dir.resolve()
    if not baseline_dir.is_dir():
        raise NotADirectoryError(f"Baseline directory not found: {baseline_dir}")

    return baseline_dir


def resolve_workspace_dir(
    root_dir: Path,
    run_id: str | None,
    workspace_dir_arg: str | None,
) -> Path:
    if run_id and workspace_dir_arg:
        raise ValueError("Provide either --run-id or --workspace-dir, not both")

    if not run_id and not workspace_dir_arg:
        raise ValueError("Either --run-id or --workspace-dir is required")

    if run_id:
        workspace_dir = root_dir / "experiment" / "workspace" / run_id
    else:
        candidate = Path(workspace_dir_arg).expanduser()
        workspace_dir = candidate if candidate.is_absolute() else root_dir / candidate

    workspace_dir = workspace_dir.resolve()
    if not workspace_dir.is_dir():
        raise NotADirectoryError(f"Workspace directory not found: {workspace_dir}")
    if not (workspace_dir / ".git").exists():
        raise ValueError(f"Workspace is not a Git repository: {workspace_dir}")

    return workspace_dir


def resolve_output_dir(
    root_dir: Path,
    default_relative_path: Path,
    output_dir_arg: str | None,
) -> Path:
    if output_dir_arg is None:
        return (root_dir / default_relative_path).resolve()

    candidate = Path(output_dir_arg).expanduser()
    return (candidate if candidate.is_absolute() else root_dir / candidate).resolve()


def resolve_evaluation_file(root_dir: Path, path_arg: str, label: str) -> Path:
    """Resolve an explicit evaluation artifact and verify it is readable."""
    candidate = Path(path_arg).expanduser()
    path = candidate if candidate.is_absolute() else root_dir / candidate
    path = path.resolve()

    if not path.is_file():
        raise FileNotFoundError(f"{label} evaluation not found: {path}")

    return path


def git_output(repo_dir: Path, *args: str, check: bool = True) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=repo_dir,
        capture_output=True,
        text=True,
        check=check,
    )
    return result.stdout.strip()


def is_worktree_dirty(repo_dir: Path) -> bool:
    return bool(git_output(repo_dir, "status", "--porcelain"))


def git_ref_commit(repo_dir: Path, ref: str) -> str | None:
    result = subprocess.run(
        ["git", "rev-parse", "--verify", f"{ref}^{{commit}}"],
        cwd=repo_dir,
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else None


def git_tag_commit(repo_dir: Path, tag_name: str) -> str | None:
    return git_ref_commit(repo_dir, f"refs/tags/{tag_name}")


def checkout_tag(repo_dir: Path, tag_name: str) -> str:
    tag_commit = git_tag_commit(repo_dir, tag_name)
    if tag_commit is None:
        raise ValueError(f"Tag does not exist: {tag_name}")

    if is_worktree_dirty(repo_dir):
        raise ValueError(
            f"Workspace has uncommitted or untracked changes: {repo_dir}. "
            "Commit or clean them before using --from-tag."
        )

    subprocess.run(
        ["git", "checkout", "--detach", tag_commit],
        cwd=repo_dir,
        text=True,
        check=True,
    )

    checked_out_commit = git_output(repo_dir, "rev-parse", "HEAD")
    if checked_out_commit != tag_commit:
        raise RuntimeError(
            f"Checked-out HEAD does not match tag {tag_name}: "
            f"HEAD={checked_out_commit}, tag={tag_commit}"
        )

    return checked_out_commit


def read_task_manifest_field(manifest_path: Path, field: str) -> str | None:
    if not manifest_path.exists():
        return None

    pattern = re.compile(rf"^{re.escape(field)}:\s*(.*?)\s*$")
    for line in manifest_path.read_text(encoding="utf-8").splitlines():
        match = pattern.match(line)
        if match:
            value = match.group(1).strip().strip("'\"")
            return None if value in {"", "none", "null"} else value

    return None


def detect_pre_state(
    workspace_dir: Path,
    source_task_manifest: Path,
    override: str | None,
) -> tuple[str, str]:
    """Return the human-readable start ref and its immutable commit SHA."""
    start_ref = override or read_task_manifest_field(
        source_task_manifest,
        "start_ref",
    )
    if start_ref is None:
        start_ref = "HEAD^" if git_ref_commit(workspace_dir, "HEAD^") else "HEAD"

    pre_commit = git_ref_commit(workspace_dir, start_ref)
    if pre_commit is None:
        raise ValueError(f"Cannot resolve task start ref: {start_ref}")

    return start_ref, pre_commit


def resolve_workspace_comparisons(
    root_dir: Path,
    session_archive_dir: Path,
    task_id: str,
    start_ref: str,
    pre_commit: str,
    baseline_evaluation_arg: str | None,
    pre_evaluation_arg: str | None,
) -> tuple[Path, Path]:
    """Use explicit comparison files or resolve canonical trajectory history."""
    if bool(baseline_evaluation_arg) != bool(pre_evaluation_arg):
        raise ValueError(
            "--baseline-evaluation and --pre-evaluation must be provided together"
        )

    if baseline_evaluation_arg and pre_evaluation_arg:
        return (
            resolve_evaluation_file(
                root_dir,
                baseline_evaluation_arg,
                "Baseline",
            ),
            resolve_evaluation_file(root_dir, pre_evaluation_arg, "Pre"),
        )

    return resolve_comparison_evaluations(
        root_dir=root_dir,
        session_archive_dir=session_archive_dir,
        task_id=task_id,
        start_ref=start_ref,
        pre_commit=pre_commit,
    )


def describe_post_commit(workspace_dir: Path) -> str:
    head = git_output(workspace_dir, "rev-parse", "HEAD")
    return f"{head}+dirty" if is_worktree_dirty(workspace_dir) else head


def describe_baseline_commit(baseline_dir: Path) -> str:
    return git_output(baseline_dir, "rev-parse", "HEAD", check=False) or (
        f"external-dir:{baseline_dir}"
    )


def validate_task_snapshot(
    workspace_dir: Path,
    task_id: str,
    allow_task_ref_mismatch: bool,
) -> None:
    task_tag = f"task-{task_id}-done"
    task_commit = git_ref_commit(workspace_dir, task_tag)
    if task_commit is None:
        return

    head_commit = git_output(workspace_dir, "rev-parse", "HEAD")
    if head_commit == task_commit or allow_task_ref_mismatch:
        return

    raise ValueError(
        f"Workspace HEAD ({head_commit[:12]}) does not match {task_tag} "
        f"({task_commit[:12]}). Harness evaluates the current working tree, not the tag. "
        f"Check out {task_tag}, or pass --allow-task-ref-mismatch if this is intentional."
    )


def find_existing_outputs(output_dir: Path) -> list[Path]:
    existing_outputs = [output_dir / name for name in HARNESS_OUTPUT_FILES]
    return [path for path in existing_outputs if path.exists()]


def validate_output_dir(output_dir: Path, force: bool) -> None:
    existing_outputs = find_existing_outputs(output_dir)

    if existing_outputs and not force:
        names = ", ".join(path.name for path in existing_outputs)
        raise FileExistsError(
            f"Harness outputs already exist in {output_dir}: {names}. "
            "Use --force to replace them or --output-dir to keep a separate rerun."
        )


def prepare_output_dir(output_dir: Path, force: bool) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    # Avoid leaving a stale success result behind if a forced rerun fails.
    if force:
        for path in find_existing_outputs(output_dir):
            path.unlink()


def validate_mode_args(parser: argparse.ArgumentParser, args: argparse.Namespace) -> str:
    if args.baseline:
        incompatible = [
            option
            for option, value in (
                ("--run-id", args.run_id),
                ("--workspace-dir", args.workspace_dir),
                ("--from-tag", args.from_tag),
                ("--pre-ref", args.pre_ref),
                ("--baseline-evaluation", args.baseline_evaluation),
                ("--pre-evaluation", args.pre_evaluation),
                ("--allow-task-ref-mismatch", args.allow_task_ref_mismatch),
            )
            if value
        ]
        if incompatible:
            parser.error(
                "--baseline cannot be combined with " + ", ".join(incompatible)
            )
        return args.task or "Base"

    if not args.task:
        parser.error("--task is required unless --baseline is used")
    if not args.run_id and not args.workspace_dir:
        parser.error("either --run-id or --workspace-dir is required")

    return args.task


def run_baseline_mode(
    root_dir: Path,
    baseline_dir: Path,
    output_dir: Path,
    task_id: str,
) -> dict:
    baseline_commit = describe_baseline_commit(baseline_dir)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_id = f"baseline_{task_id}_{timestamp}"

    print(f"🎯 Baseline target: {baseline_dir}")
    print(f"🧭 Task: {task_id}")
    print(f"📍 Revision: {baseline_commit}")
    print(f"🗂️ Output: {output_dir}")

    return run_harness_evaluation(
        root_dir=root_dir,
        baseline_dir=baseline_dir,
        workspace_dir=baseline_dir,
        task_archive_dir=output_dir,
        run_id=run_id,
        task_id=task_id,
        pre_commit=baseline_commit,
        post_commit=baseline_commit,
        comparison_mode="self",
        baseline_evaluation_path=None,
        pre_evaluation_path=None,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run Harness for the baseline or an existing pipeline workspace"
    )
    parser.add_argument(
        "--baseline",
        action="store_true",
        help="Evaluate the baseline itself; defaults to task Base",
    )
    parser.add_argument(
        "--run-id",
        help="Workspace session id under experiment/workspace, e.g. session_20260813_211609",
    )
    parser.add_argument(
        "--workspace-dir",
        help="Workspace path (absolute or repository-root-relative)",
    )
    parser.add_argument(
        "--task",
        help="Harness task id; required for workspace mode, defaults to Base in baseline mode",
    )
    parser.add_argument(
        "--from-tag",
        help=(
            "Check out this workspace Git tag in detached-HEAD mode before evaluation; "
            "the workspace must be clean"
        ),
    )
    parser.add_argument(
        "--baseline-dir",
        help="Baseline source directory; defaults to <repo>/baseline",
    )
    parser.add_argument(
        "--output-dir",
        help=(
            "Harness artifact directory; defaults to reports/baseline in baseline "
            "mode or reports/experiments/<session>/<task> in workspace mode"
        ),
    )
    parser.add_argument(
        "--pre-ref",
        help=(
            "Override the task start ref; defaults to task_manifest.yaml start_ref, "
            "then HEAD^"
        ),
    )
    parser.add_argument(
        "--baseline-evaluation",
        help=(
            "Explicit E0 evaluation path for workspace mode; must be paired with "
            "--pre-evaluation"
        ),
    )
    parser.add_argument(
        "--pre-evaluation",
        help=(
            "Explicit evaluation of the workspace pre-state; must be paired with "
            "--baseline-evaluation"
        ),
    )
    parser.add_argument(
        "--allow-task-ref-mismatch",
        action="store_true",
        help="Allow evaluating HEAD even when it differs from task-<task>-done",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Replace existing harness outputs in the selected output directory",
    )
    args = parser.parse_args()

    root_dir = Path(__file__).resolve().parent.parent.parent.parent
    task_id = validate_mode_args(parser, args)
    baseline_dir = resolve_baseline_dir(root_dir, args.baseline_dir)
    if args.baseline:
        output_dir = resolve_output_dir(
            root_dir,
            Path("reports") / "baseline",
            args.output_dir,
        )
        validate_output_dir(output_dir, force=args.force)
        prepare_output_dir(output_dir, force=args.force)
        harness_run = run_baseline_mode(
            root_dir=root_dir,
            baseline_dir=baseline_dir,
            output_dir=output_dir,
            task_id=task_id,
        )

        if harness_run["harness_status"] != "success":
            raise RuntimeError(
                "Baseline Harness failed. "
                f"See execution details: {harness_run['execution_path']}"
            )

        evaluation = harness_run.get("evaluation") or {}
        print(
            "✅ Baseline evaluation finished. "
            f"{format_evaluation_status(evaluation)}"
        )
        print(f"📄 Evaluation: {harness_run['evaluation_path']}")
        return

    workspace_dir = resolve_workspace_dir(root_dir, args.run_id, args.workspace_dir)
    session_id = workspace_dir.name

    source_task_dir = root_dir / "reports" / "experiments" / session_id / task_id
    source_task_manifest = source_task_dir / "task_manifest.yaml"
    output_dir = resolve_output_dir(
        root_dir,
        Path("reports") / "experiments" / session_id / task_id,
        args.output_dir,
    )

    # Check this before changing the workspace checkout. A rejected output target
    # must not leave the user's workspace on a different ref.
    validate_output_dir(output_dir, force=args.force)

    checked_out_tag_commit = None
    if args.from_tag:
        checked_out_tag_commit = checkout_tag(workspace_dir, args.from_tag)
    else:
        validate_task_snapshot(
            workspace_dir,
            task_id,
            allow_task_ref_mismatch=args.allow_task_ref_mismatch,
        )

    start_ref, pre_commit = detect_pre_state(
        workspace_dir,
        source_task_manifest,
        override=args.pre_ref,
    )
    baseline_evaluation_path, pre_evaluation_path = resolve_workspace_comparisons(
        root_dir=root_dir,
        session_archive_dir=source_task_dir.parent,
        task_id=task_id,
        start_ref=start_ref,
        pre_commit=pre_commit,
        baseline_evaluation_arg=args.baseline_evaluation,
        pre_evaluation_arg=args.pre_evaluation,
    )

    prepare_output_dir(output_dir, force=args.force)

    post_commit = describe_post_commit(workspace_dir)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_id = f"{session_id}_{task_id}_harness_{timestamp}"

    print(f"🎯 Workspace: {workspace_dir}")
    print(f"🧭 Task: {task_id}")
    if args.from_tag:
        print(f"🏷️ Checked out tag: {args.from_tag} ({checked_out_tag_commit})")
    print(f"📍 Start ref: {start_ref}")
    print(f"📍 Pre-commit: {pre_commit}")
    print(f"📍 Post-commit: {post_commit}")
    print(f"📦 Baseline: {baseline_dir}")
    print(f"📊 Baseline evaluation: {baseline_evaluation_path}")
    print(f"📊 Pre evaluation: {pre_evaluation_path}")
    print(f"🗂️ Output: {output_dir}")

    harness_run = run_harness_evaluation(
        root_dir=root_dir,
        baseline_dir=baseline_dir,
        workspace_dir=workspace_dir,
        task_archive_dir=output_dir,
        run_id=run_id,
        task_id=task_id,
        pre_commit=pre_commit,
        post_commit=post_commit,
        comparison_mode="trajectory",
        baseline_evaluation_path=baseline_evaluation_path,
        pre_evaluation_path=pre_evaluation_path,
    )

    if harness_run["harness_status"] != "success":
        raise RuntimeError(
            "Harness failed. "
            f"See execution details: {harness_run['execution_path']}"
        )

    evaluation = harness_run.get("evaluation") or {}
    print(
        "✅ Harness-only evaluation finished. "
        f"{format_evaluation_status(evaluation)}"
    )
    print(f"📄 Evaluation: {harness_run['evaluation_path']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"❌ run_harness failed: {exc}", file=sys.stderr)
        sys.exit(1)
