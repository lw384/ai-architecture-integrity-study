#!/usr/bin/env python3
# experiment/instruments/agent-runners/run_review.py
#
# CLI entry point for non-mutating "insight" tasks (e.g. T5), mirroring
# run_harness.py's / run_tests.py's relationship to evaluator.py /
# acceptance_runner.py: this is the thin CLI wrapper, review_runner.py holds the
# reusable run_review_task() logic. Runs the agent read-only against an
# existing pipeline workspace and archives the result under the same
# reports/experiments/<session>/<task>/ directory T1-T3 use — without
# touching Git tags/commits or the Harness.
import argparse
import sys
from datetime import datetime
from pathlib import Path

from config import get_agent_config
from prompt_builder import build_mega_prompt
from review_runner import run_review_task
from run_harness import checkout_tag, resolve_output_dir, resolve_workspace_dir

REVIEW_OUTPUT_FILES = (
    "execution.json",
    "review.md",
    "findings.json",
    "task_manifest.yaml",
)


def find_existing_outputs(output_dir: Path) -> list[Path]:
    existing_outputs = [output_dir / name for name in REVIEW_OUTPUT_FILES]
    return [path for path in existing_outputs if path.exists()]


def validate_output_dir(output_dir: Path, force: bool) -> None:
    existing_outputs = find_existing_outputs(output_dir)

    if existing_outputs and not force:
        names = ", ".join(path.name for path in existing_outputs)
        raise FileExistsError(
            f"Review 产物已存在于 {output_dir}: {names}。"
            "如需覆盖请加 --force，或用 --output-dir 换一个归档目录。"
        )


def prepare_output_dir(output_dir: Path, force: bool) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    # Avoid leaving a stale result behind if a forced rerun fails.
    if force:
        for path in find_existing_outputs(output_dir):
            path.unlink()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="运行只读的洞察类任务（如 T5），归档到已有 pipeline workspace 的任务目录"
    )
    parser.add_argument(
        "--run-id",
        help="Workspace session id under experiment/workspace, e.g. session_20260817_130253",
    )
    parser.add_argument(
        "--workspace-dir",
        help="Workspace path (absolute or repository-root-relative)",
    )
    parser.add_argument("--task", required=True, help="任务 ID，如 T5")
    parser.add_argument("--agent", choices=["claude", "codex"], default="claude")
    parser.add_argument("--model", help="覆盖默认模型 (可选)")
    parser.add_argument(
        "--from-tag",
        required=True,
        help=(
            "Check out 这个 workspace tag（detached HEAD）后再运行，例如 "
            "task-T3-done；workspace 必须干净"
        ),
    )
    parser.add_argument(
        "--output-dir",
        help="产物目录；默认 reports/experiments/<session>/<task>",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="覆盖该目录下已存在的 review 产物，不询问",
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

    # Same ordering rationale as run_harness.py / run_tests.py: reject a bad
    # output target before touching the workspace checkout.
    validate_output_dir(output_dir, force=args.force)

    checked_out_commit = checkout_tag(workspace_dir, args.from_tag)
    prepare_output_dir(output_dir, force=args.force)

    config = get_agent_config(args.agent, args.model)
    final_prompt = build_mega_prompt(
        root_dir=root_dir,
        task_id=args.task,
        # No strategy: review-only tasks ship one strategy-agnostic template
        # (resolve_task_file() falls back straight to {task_id}.md). Which
        # condition's workspace this is stays recoverable via session_id ->
        # session_manifest.yaml, same as T1-T3.
        strategy=None,
        # Review-only tasks must not touch CLAUDE.md/AGENTS.md either.
        memory_filename=None,
    )
    (output_dir / "prompt.md").write_text(final_prompt, encoding="utf-8")

    timestamp = datetime.now().strftime("%H%M%S")
    run_id = f"{session_id}_{args.task}_review_{timestamp}"

    print(f"🎯 Workspace: {workspace_dir}")
    print(f"🧭 Task: {args.task} ({args.agent}/{config['model']})")
    print(f"🏷️  Checked out tag: {args.from_tag} ({checked_out_commit})")
    print(f"🗂️  Output: {output_dir}")

    review_run = run_review_task(
        workspace_dir=workspace_dir,
        task_archive_dir=output_dir,
        session_id=session_id,
        task_id=args.task,
        run_id=run_id,
        reviewed_from_tag=args.from_tag,
        reviewed_commit=checked_out_commit,
        agent_name=args.agent,
        final_prompt=final_prompt,
        config=config,
    )

    print(f"✅ Review 完成: {review_run['review_status']}")
    print(f"📄 Review: {output_dir / review_run['review_file']}")
    print(f"📄 Findings: {output_dir / review_run['findings_file']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"❌ run_review failed: {exc}", file=sys.stderr)
        sys.exit(1)
