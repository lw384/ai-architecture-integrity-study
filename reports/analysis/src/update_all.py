#!/usr/bin/env python3
"""Regenerate every reports/analysis table after reports/experiments/ changes.

Runs src/ingest.py followed by every stage script, in the order some of
them require (s2_2_agent_profile.py reads s1_1's data/derived/ output,
s4_1_silent_decay.py reads s1_2's — see each script's docstring for why).
Stops at the first failing script instead of continuing on to stages that
would read a stale or half-written data/derived/ file.

This script does not replace the stage scripts — each remains independently
runnable (`python3 src/stages/s1_1_violation_heatmap.py`) when you only
need to re-check one thing. This is the "just refresh everything" shortcut.

Run:
    python3 src/update_all.py
    python3 src/update_all.py --notebook   # also re-execute the notebook in place
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ANALYSIS_DIR = Path(__file__).resolve().parent.parent
SRC_DIR = ANALYSIS_DIR / "src"
STAGES_DIR = SRC_DIR / "stages"

PIPELINE = [
    SRC_DIR / "ingest.py",
    STAGES_DIR / "s0_0_run_overview.py",
    STAGES_DIR / "s0_1_reliability.py",
    STAGES_DIR / "s0_2_baseline_debt.py",
    STAGES_DIR / "s0_3_task_completion.py",
    STAGES_DIR / "s0_4_concern_profile.py",
    STAGES_DIR / "s0_5_strategy_rule_diff.py",
    STAGES_DIR / "s1_1_violation_heatmap.py",
    STAGES_DIR / "s1_2_metric_distribution.py",
    STAGES_DIR / "s2_1_strategy_comparison.py",
    STAGES_DIR / "s2_2_agent_profile.py",      # depends on s1_1's derived output
    STAGES_DIR / "s3_1_trajectory_shape.py",
    STAGES_DIR / "s4_1_silent_decay.py",       # depends on s1_2's derived output
    STAGES_DIR / "s4_2_spatial_distribution.py",
    STAGES_DIR / "s4_3_metric_correlation.py",
    STAGES_DIR / "s4_4_review_calibration.py",
]


def run_script(path: Path) -> None:
    print(f"\n== {path.relative_to(ANALYSIS_DIR)} ==")
    result = subprocess.run([sys.executable, str(path)], cwd=ANALYSIS_DIR)
    if result.returncode != 0:
        raise SystemExit(
            f"\n{path.name} failed (exit {result.returncode}) — stopping here so later "
            "stages don't run against a half-updated data/ directory."
        )


def run_notebook() -> None:
    notebook_path = ANALYSIS_DIR / "notebook" / "analysis.ipynb"
    jupyter_bin = Path(sys.executable).parent / "jupyter"  # same env as this script, not $PATH's
    print(f"\n== re-executing {notebook_path.relative_to(ANALYSIS_DIR)} ==")
    result = subprocess.run(
        [
            str(jupyter_bin), "nbconvert", "--to", "notebook", "--execute", "--inplace",
            "--ExecutePreprocessor.kernel_name=aais-notebook",
            "--ExecutePreprocessor.timeout=180",
            str(notebook_path),
        ],
        cwd=ANALYSIS_DIR,
    )
    if result.returncode != 0:
        raise SystemExit(f"\nNotebook re-execution failed (exit {result.returncode}).")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--notebook",
        action="store_true",
        help="Also re-execute notebook/analysis.ipynb in place after the data refresh",
    )
    args = parser.parse_args()

    for script in PIPELINE:
        run_script(script)

    if args.notebook:
        run_notebook()

    print("\nAll tables regenerated." + (" Notebook re-executed." if args.notebook else ""))


if __name__ == "__main__":
    main()
