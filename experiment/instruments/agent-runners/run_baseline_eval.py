#!/usr/bin/env python3
# experiment/instruments/agent-runners/run_baseline_eval.py

import argparse
import json
import subprocess
from datetime import datetime
from pathlib import Path

from evaluator import run_harness_evaluation


def read_git_head_if_available(repo_dir: Path) -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repo_dir,
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return None


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


def ensure_backend_depcruise_report(root_dir: Path, baseline_dir: Path) -> Path:
    backend_dir = baseline_dir / "backend"
    backend_src = backend_dir / "src"
    report_dir = backend_dir / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / "depcruise-raw.json"

    if not backend_src.exists():
        raise FileNotFoundError(f"Baseline backend src directory not found: {backend_src}")

    depcruise_bin = root_dir / "harness" / "node_modules" / "dependency-cruiser" / "bin" / "dependency-cruise.mjs"
    depcruise_config = root_dir / "harness" / "rulepacks" / "ts-nestjs-backend" / "tool-configs" / "dep-cruiser.config.cjs"

    if not depcruise_bin.exists():
        raise FileNotFoundError(
            f"dependency-cruiser binary not found: {depcruise_bin}. Please install harness dependencies first."
        )

    cmd = [
        "node",
        str(depcruise_bin),
        "src",
        "--config",
        str(depcruise_config),
        "--output-type",
        "json",
    ]

    result = subprocess.run(
        cmd,
        cwd=backend_dir,
        capture_output=True,
        text=True,
        check=False,
    )

    if result.returncode != 0:
        raise RuntimeError(
            "Failed to generate depcruise report for baseline backend.\n"
            f"STDOUT: {result.stdout}\nSTDERR: {result.stderr}"
        )

    report_path.write_text(result.stdout, encoding="utf-8")
    return report_path


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


def write_subject_reports(archive_dir: Path, evaluation_result: dict) -> None:
    subjects = evaluation_result.get("subjects", [])

    for subject in subjects:
        subject_id = subject.get("subject_id", "unknown")
        subject_dir = archive_dir / subject_id
        subject_dir.mkdir(parents=True, exist_ok=True)

        (subject_dir / "report.json").write_text(
            json.dumps(subject, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        constraints_status = subject.get("layers", {}).get("constraints", {}).get("status", "unknown")
        metrics_count = len(subject.get("layers", {}).get("metrics", []))
        (subject_dir / "report.md").write_text(
            "\n".join(
                [
                    f"# {subject_id} baseline report",
                    "",
                    f"- status: {subject.get('status', 'unknown')}",
                    f"- constraints_status: {constraints_status}",
                    f"- metrics_count: {metrics_count}",
                ],
            )
            + "\n",
            encoding="utf-8",
        )


def write_summary_csv(archive_dir: Path, evaluation_result: dict) -> None:
    lines = ["subject_id,status,constraints_status,metrics_count"]

    for subject in evaluation_result.get("subjects", []):
        subject_id = subject.get("subject_id", "unknown")
        status = subject.get("status", "unknown")
        constraints_status = subject.get("layers", {}).get("constraints", {}).get("status", "unknown")
        metrics_count = len(subject.get("layers", {}).get("metrics", []))
        lines.append(f"{subject_id},{status},{constraints_status},{metrics_count}")

    (archive_dir / "summary.csv").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run baseline-only harness evaluation and archive outputs.")
    parser.add_argument("--task", default="Base", help="Harness task ID, e.g. Base")
    parser.add_argument(
        "--baseline-dir",
        help="Baseline source directory; defaults to <repo>/baseline",
    )
    args = parser.parse_args()

    root_dir = Path(__file__).resolve().parent.parent.parent.parent
    baseline_dir = resolve_baseline_dir(root_dir, args.baseline_dir)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    archive_dir = root_dir / "reports" / "baselines" / f"baseline_{timestamp}"
    archive_dir.mkdir(parents=True, exist_ok=True)

    print(f"🚀 Running baseline-only evaluation for task: {args.task}")
    print(f"📦 Baseline source: {baseline_dir}")
    print(f"🗂️ Archive dir: {archive_dir}")

    depcruise_path = ensure_backend_depcruise_report(root_dir, baseline_dir)
    (archive_dir / "backend").mkdir(parents=True, exist_ok=True)
    (archive_dir / "backend" / "depcruise-raw.json").write_text(
        depcruise_path.read_text(encoding="utf-8"),
        encoding="utf-8",
    )

    baseline_commit = read_git_head_if_available(baseline_dir) or f"external-dir:{baseline_dir}"
    run_id = f"baseline_{timestamp}"

    evaluation_result = run_harness_evaluation(
        root_dir=root_dir,
        baseline_dir=baseline_dir,
        trajectory_dir=baseline_dir,
        artifact_dir=archive_dir,
        run_id=run_id,
        task_id=args.task,
        pre_commit=baseline_commit,
        post_commit=baseline_commit,
        baseline_commit=baseline_commit,
    )

    write_yaml_like_manifest(
        archive_dir / "manifest.yaml",
        {
            "snapshot_id": archive_dir.name,
            "task_id": args.task,
            "baseline_dir": baseline_dir,
            "baseline_commit": baseline_commit,
            "harness_version": "0.1.0",
            "recorded_at": timestamp,
            "subjects": ["backend", "frontend"],
        },
    )
    write_subject_reports(archive_dir, evaluation_result)
    write_summary_csv(archive_dir, evaluation_result)

    print("✅ Baseline evaluation completed.")
    print(f"📁 Archived outputs at: {archive_dir}")


if __name__ == "__main__":
    main()
