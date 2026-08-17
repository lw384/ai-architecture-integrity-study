#!/usr/bin/env python3
# experiment/instruments/agent-runners/review_runner.py
#
# Runs a non-mutating "insight" task (e.g. T5: architecture-consistency
# self-review) against an existing workspace snapshot and archives the
# agent's textual output — mirroring evaluator.py / test_runner.py's role:
# this module holds the reusable logic, run_review.py is the thin CLI
# wrapper.
#
# Unlike T1-T3, these tasks must not modify the workspace, commit, or run
# the Harness. run_review_task() enforces the read-only contract with a hard
# failure instead of trusting the prompt alone — a violation leaves no
# review.md / findings.json / task_manifest.yaml behind, only prompt.md and
# execution.json for debugging.

import json
import re
import subprocess
from pathlib import Path

from docker_runner import run_agent_task

REQUIRED_FINDING_FIELDS = (
    "severity",
    "location",
    "issue",
    "impact",
    "recommended_improvement",
)
NO_ISSUES_MARKER = "NO_ARCHITECTURE_CONSISTENCY_ISSUES_FOUND"
COMPLETION_MARKER = "[TASK_COMPLETED]"

FINDING_FIELD_PATTERN = re.compile(
    r"-\s*`(" + "|".join(REQUIRED_FINDING_FIELDS) + r")`\s*:\s*(.*)"
)


def write_json(path: Path, data) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def workspace_status(workspace_dir: Path) -> str:
    return subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=workspace_dir,
        capture_output=True,
        text=True,
        check=True,
    ).stdout


def verify_workspace_unchanged(workspace_dir: Path, task_id: str) -> None:
    """Hard-fail if a review-only task mutated tracked or untracked files."""
    status = workspace_status(workspace_dir)
    if status.strip():
        raise RuntimeError(
            f"Agent 违反了 {task_id} 的只读约束，跑完之后 workspace 出现改动:\n"
            f"{status}\n"
            "已保留 prompt.md / execution.json 供排查，未写入 review.md / "
            "findings.json / task_manifest.yaml。"
        )


def extract_review_text(execution_record: dict) -> str:
    """Pull the agent's final text out of execution.json and strip the
    completion marker so review.md holds exactly the reviewed content."""
    agent_text = (execution_record.get("metrics") or {}).get("agent_text") or ""
    review_text = agent_text.replace(COMPLETION_MARKER, "").strip()

    if not review_text:
        raise ValueError("Agent 未产出任何文本结果（agent_text 为空）")

    return review_text


def parse_findings(review_markdown: str) -> dict:
    """Best-effort structured extraction of T5.md's finding bullet format.

    review.md stays the ground truth; this is a derived convenience for
    analysis/ scripts. A malformed or unexpected block must not fail the
    task — it is recorded as a parse_warning on that finding instead.
    """
    if NO_ISSUES_MARKER in review_markdown:
        return {"status": "no_issues_found", "findings": []}

    # Findings are runs of "- `field`: value" bullets, in the field order
    # T5.md specifies. A new "severity" bullet starts the next finding.
    blocks: list[list[tuple[str, str]]] = []
    for line in review_markdown.splitlines():
        match = FINDING_FIELD_PATTERN.match(line.strip())
        if not match:
            continue

        field, value = match.group(1), match.group(2).strip()
        if field == "severity" or not blocks:
            blocks.append([])
        blocks[-1].append((field, value))

    if not blocks:
        return {
            "status": "parse_incomplete",
            "findings": [],
            "parse_warning": "未在 Markdown 中找到符合 T5.md 字段格式的 finding，也没有找到 "
            f"{NO_ISSUES_MARKER} 标记",
        }

    findings = []
    for block in blocks:
        finding = dict(block)
        missing_fields = [
            field for field in REQUIRED_FINDING_FIELDS if field not in finding
        ]
        if missing_fields:
            finding["parse_warning"] = f"缺少字段: {', '.join(missing_fields)}"
        findings.append(finding)

    return {"status": "issues_found", "findings": findings}


def write_review_artifacts(
    task_archive_dir: Path,
    review_text: str,
    parsed_findings: dict,
) -> dict:
    review_path = task_archive_dir / "review.md"
    findings_path = task_archive_dir / "findings.json"

    review_path.write_text(review_text + "\n", encoding="utf-8")
    write_json(findings_path, {"source_file": "review.md", **parsed_findings})

    return {"review_file": "review.md", "findings_file": "findings.json"}


def write_review_task_manifest(
    task_archive_dir: Path,
    session_id: str,
    task_id: str,
    run_id: str,
    reviewed_from_tag: str,
    reviewed_commit: str,
    review_file: str,
    findings_file: str,
) -> None:
    manifest_path = task_archive_dir / "task_manifest.yaml"

    # Strategy is deliberately not recorded here, matching T1-T3's
    # task_manifest.yaml: it lives once in session_manifest.yaml, not
    # duplicated per task. It also wouldn't mean anything for T5 specifically
    # — resolve_task_file() always falls back to the same strategy-agnostic
    # T5.md regardless of which condition's workspace is being reviewed.
    manifest_path.write_text(
        "\n".join(
            [
                f"session_id: {session_id}",
                f"task_id: {task_id}",
                f"run_id: {run_id}",
                "task_type: review",
                f"reviewed_from_tag: {reviewed_from_tag}",
                f"reviewed_commit: {reviewed_commit}",
                "prompt_file: prompt.md",
                "execution_file: execution.json",
                f"review_file: {review_file}",
                f"findings_file: {findings_file}",
                # Reaching this point means verify_workspace_unchanged already
                # passed; a violation raises before any manifest is written.
                "workspace_unchanged: true",
                "",
            ]
        ),
        encoding="utf-8",
    )


def run_review_task(
    workspace_dir: Path,
    task_archive_dir: Path,
    session_id: str,
    task_id: str,
    run_id: str,
    reviewed_from_tag: str,
    reviewed_commit: str,
    agent_name: str,
    final_prompt: str,
    config: dict,
) -> dict:
    """Run one non-mutating insight task and archive its output.

    Returns {"review_status", "review_file", "findings_file"} for the caller
    to print/inspect.
    """
    agent_run = run_agent_task(
        workspace_dir=workspace_dir,
        task_artifact_dir=task_archive_dir,
        run_id=run_id,
        agent_name=agent_name,
        final_prompt=final_prompt,
        config=config,
    )

    if agent_run["status"] != "success":
        raise RuntimeError(
            "Agent 未按任务协议成功结束。"
            f"请查看: {task_archive_dir / 'execution.json'}"
        )

    # Enforce the read-only contract before trusting anything the agent said.
    verify_workspace_unchanged(workspace_dir, task_id)

    execution_record = json.loads(
        (task_archive_dir / "execution.json").read_text(encoding="utf-8")
    )
    review_text = extract_review_text(execution_record)
    parsed_findings = parse_findings(review_text)

    artifact_files = write_review_artifacts(
        task_archive_dir=task_archive_dir,
        review_text=review_text,
        parsed_findings=parsed_findings,
    )

    write_review_task_manifest(
        task_archive_dir=task_archive_dir,
        session_id=session_id,
        task_id=task_id,
        run_id=run_id,
        reviewed_from_tag=reviewed_from_tag,
        reviewed_commit=reviewed_commit,
        review_file=artifact_files["review_file"],
        findings_file=artifact_files["findings_file"],
    )

    return {"review_status": parsed_findings["status"], **artifact_files}
