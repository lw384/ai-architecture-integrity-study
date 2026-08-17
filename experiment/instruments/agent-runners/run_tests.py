#!/usr/bin/env python3
# experiment/instruments/agent-runners/run_tests.py
#
# Acceptance-only entry point, mirroring run_harness.py's relationship to
# evaluator.py: this is the CLI wrapper, test_runner.py holds the reusable
# run_functional_tests() logic. Re-runs the functional acceptance suite
# against an existing pipeline workspace without touching the agent, the
# Harness, or Git tags/commits.
import argparse
import sys
from datetime import datetime
from pathlib import Path

from docker_runner import DEFAULT_RUNTIME_IMAGE
from run_harness import checkout_tag, resolve_output_dir, resolve_workspace_dir
from test_runner import run_functional_tests

TEST_OUTPUT_FILES = ("test_execution.json", "test_result.json")


def find_existing_outputs(output_dir: Path) -> list[Path]:
    existing_outputs = [output_dir / name for name in TEST_OUTPUT_FILES]
    return [path for path in existing_outputs if path.exists()]


def validate_output_dir(output_dir: Path, force: bool) -> None:
    existing_outputs = find_existing_outputs(output_dir)

    if existing_outputs and not force:
        names = ", ".join(path.name for path in existing_outputs)
        raise FileExistsError(
            f"Acceptance test outputs already exist in {output_dir}: {names}. "
            "Use --force to replace them or --output-dir to keep a separate rerun."
        )


def prepare_output_dir(output_dir: Path, force: bool) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    # Avoid leaving a stale result behind if a forced rerun fails.
    if force:
        for path in find_existing_outputs(output_dir):
            path.unlink()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the functional acceptance suite for one task against an existing pipeline workspace"
    )
    parser.add_argument(
        "--run-id",
        help="Workspace session id under experiment/workspace, e.g. session_20260813_211609",
    )
    parser.add_argument(
        "--workspace-dir",
        help="Workspace path (absolute or repository-root-relative)",
    )
    parser.add_argument("--task", required=True, help="Task id, e.g. T1")
    parser.add_argument(
        "--from-tag",
        help=(
            "Check out this workspace Git tag in detached-HEAD mode before running; "
            "the workspace must be clean"
        ),
    )
    parser.add_argument(
        "--output-dir",
        help=(
            "Acceptance artifact directory; defaults to "
            "reports/experiments/<session>/<task>"
        ),
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Replace existing acceptance outputs in the selected output directory",
    )
    parser.add_argument(
        "--runtime-image",
        default=DEFAULT_RUNTIME_IMAGE,
        help=f"Pure Node Linux image used for tests (default: {DEFAULT_RUNTIME_IMAGE})",
    )
    args = parser.parse_args()

    if not args.run_id and not args.workspace_dir:
        parser.error("either --run-id or --workspace-dir is required")

    root_dir = Path(__file__).resolve().parent.parent.parent.parent
    workspace_dir = resolve_workspace_dir(root_dir, args.run_id, args.workspace_dir)
    session_id = workspace_dir.name

    output_dir = resolve_output_dir(
        root_dir,
        Path("reports") / "experiments" / session_id / args.task,
        args.output_dir,
    )

    # Check this before changing the workspace checkout, same reasoning as
    # run_harness.py: a rejected output target must not leave the user's
    # workspace on a different ref.
    validate_output_dir(output_dir, force=args.force)

    checked_out_tag_commit = None
    if args.from_tag:
        checked_out_tag_commit = checkout_tag(workspace_dir, args.from_tag)

    prepare_output_dir(output_dir, force=args.force)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_id = f"{session_id}_{args.task}_test_{timestamp}"

    print(f"🎯 Workspace: {workspace_dir}")
    print(f"🧭 Task: {args.task}")
    if args.from_tag:
        print(f"🏷️  Checked out tag: {args.from_tag} ({checked_out_tag_commit})")
    print(f"🗂️  Output: {output_dir}")

    test_run = run_functional_tests(
        root_dir=root_dir,
        workspace_dir=workspace_dir,
        task_archive_dir=output_dir,
        task_id=args.task,
        run_id=run_id,
        image=args.runtime_image,
    )

    print(f"🧪 Functional acceptance: {test_run['test_status']}")
    if test_run["test_result_file"]:
        print(f"📄 Result: {output_dir / test_run['test_result_file']}")

    # "fail" is a valid experimental outcome (the suite ran and found a real
    # functional gap) and must not raise. Only "error" (the acceptance
    # infrastructure itself didn't run) is treated as a hard failure here.
    if test_run["test_status"] == "error":
        raise RuntimeError(
            "Acceptance test infrastructure failed to run. "
            "See execution details: "
            f"{output_dir / (test_run['test_execution_file'] or 'test_execution.json')}"
        )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"❌ run_tests failed: {exc}", file=sys.stderr)
        sys.exit(1)
