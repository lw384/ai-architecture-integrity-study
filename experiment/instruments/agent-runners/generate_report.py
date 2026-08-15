#!/usr/bin/env python3
"""
Generate markdown reports from harness evaluation.json outputs.

Usage:
    python generate_report.py --evaluation PATH/TO/evaluation.json --output PATH/TO/report.md
    python generate_report.py --evaluation /path/to/workspace/evaluation.json  # auto-infer output
"""

import json
import argparse
from pathlib import Path
from collections import defaultdict


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate markdown reports from evaluation.json"
    )
    parser.add_argument(
        "--evaluation",
        type=Path,
        required=True,
        help="Path to evaluation.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output markdown file path (default: evaluation_report.md in same directory)",
    )
    return parser.parse_args()


def load_evaluation(eval_path):
    """Load and validate evaluation.json"""
    with open(eval_path) as f:
        return json.load(f)


def extract_violations_by_scope(evaluation):
    """
    Extract constraint violations organized by evaluation scope and rule.
    Returns dict: {scope_id: {rule_id: [{file, line, column, message}, ...]}}
    """
    violations_by_scope = defaultdict(lambda: defaultdict(list))

    for scope in evaluation.get("scopes", []):
        scope_id = scope["scope_id"]
        
        # Extract findings from constraints layer
        constraints = scope.get("layers", {}).get("constraints", {})
        findings = constraints.get("findings", [])

        for finding in findings:
            rule_id = finding.get("rule_id")
            location = finding.get("location", {})
            file_path = location.get("file", "unknown")
            line = location.get("line", "?")
            column = location.get("column", "?")
            message = finding.get("message", "")

            # Shorten file path for readability
            if "/frontend/" in file_path:
                file_display = file_path.split("/frontend/", 1)[-1]
            elif "/backend/" in file_path:
                file_display = file_path.split("/backend/", 1)[-1]
            else:
                file_display = file_path

            violations_by_scope[scope_id][rule_id].append({
                "file": file_display,
                "line": line,
                "column": column,
                "message": message,
                "full_path": file_path,
            })

    return violations_by_scope


def generate_markdown_report(evaluation, violations_by_scope):
    """Generate a markdown report with tables for all evaluation scopes."""
    lines = []

    # Header
    run_id = evaluation.get("run_id", "unknown")
    task_id = evaluation.get("task_id", "T0")
    lines.append(f"# Architecture Evaluation Report\n")
    lines.append(f"**Run ID:** `{run_id}`  \n")
    lines.append(f"**Task ID:** `{task_id}`  \n")

    # Summary
    total_violations = sum(
        sum(len(v) for v in rules.values())
        for rules in violations_by_scope.values()
    )
    total_rules_affected = sum(
        len(rules) for rules in violations_by_scope.values()
    )
    lines.append(f"\n## Summary\n")
    lines.append(f"- **Total Violations:** {total_violations}\n")
    lines.append(f"- **Rules with Violations:** {total_rules_affected}\n")
    lines.append(f"- **Scopes Evaluated:** {len(violations_by_scope)}\n")

    # Violations by scope
    for scope_id in sorted(violations_by_scope.keys()):
        violations_by_rule = violations_by_scope[scope_id]
        
        if not violations_by_rule:
            continue
            
        scope_total = sum(len(v) for v in violations_by_rule.values())
        lines.append(f"\n## {scope_id.upper()} ({scope_total} violations)\n")

        for rule_id in sorted(violations_by_rule.keys()):
            violations = violations_by_rule[rule_id]
            count = len(violations)

            lines.append(f"\n### {rule_id} ({count} violations)\n")
            lines.append("| File | Line | Column | Message |\n")
            lines.append("|------|------|--------|----------|\n")

            for v in violations:
                file_short = v["file"].replace("|", "\\|")  # Escape pipe in markdown tables
                msg = v["message"].replace("|", "\\|").replace("\n", " ")
                lines.append(f"| `{file_short}` | {v['line']} | {v['column']} | {msg} |\n")

    # Footer
    lines.append(f"\n---\n")
    lines.append(f"*Report generated from evaluation.json*\n")

    return "".join(lines)


def main():
    args = parse_args()

    # Load evaluation
    print(f"Loading evaluation from {args.evaluation}...")
    evaluation = load_evaluation(args.evaluation)

    # Extract violations
    violations_by_scope = extract_violations_by_scope(evaluation)

    # Determine output path
    output_path = args.output or args.evaluation.parent / "violations_report.md"

    # Generate report
    report_md = generate_markdown_report(evaluation, violations_by_scope)

    # Write report
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        f.write(report_md)

    print(f"✓ Report generated: {output_path}")
    total_violations = sum(
        sum(len(v) for v in rules.values())
        for rules in violations_by_scope.values()
    )
    print(f"✓ Total violations: {total_violations}")
    print(f"✓ Scopes evaluated: {list(violations_by_scope.keys())}")


if __name__ == "__main__":
    main()
