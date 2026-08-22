#!/usr/bin/env python3
"""Category extraction shared by constraint findings and metric observations.

Rule IDs and metric names both follow the same "<SUBJECT>-<CATEGORY>-..."
convention, e.g.:

    BE-DOM-C-001-no-cross-module-deep-import   (a constraint rule_id)
    BE-DOM-M-001-cross-module-deep-import-count (a metric name)

This module is the single place that knows that convention. If the rulepack
ever changes its naming scheme, only this file needs to change — every stage
script that groups findings/metrics by category imports from here instead of
re-deriving the split.
"""

from __future__ import annotations

import re

_SUBJECT_CATEGORY_PATTERN = re.compile(r"^(BE|FE|CROSS)-([A-Z]+)-")

# Canonical axis order for charts (heatmaps, radar plots) so repeated runs
# draw categories in the same order instead of whatever order a groupby
# happens to produce.
BACKEND_CATEGORIES = [
    "STRUCT", "DEP", "DOM", "DUP", "ERR", "ROUTE", "SIZE", "CONTRACT", "TEST", "MOCK",
]
FRONTEND_CATEGORIES = ["COM", "COMM", "DATA", "DUP", "ROUTE", "STATE", "STYLE"]
CROSS_CATEGORIES = ["EP", "PROP", "TYPE"]


def subject_and_category(identifier: str | None) -> tuple[str, str]:
    """Split a rule_id or metric name into (subject, category).

    subject is one of "BE" / "FE" / "CROSS". Falls back to
    ("UNKNOWN", identifier) for anything that doesn't match the naming
    convention, so callers never have to handle a KeyError/None.
    """
    match = _SUBJECT_CATEGORY_PATTERN.match(identifier or "")
    if not match:
        return "UNKNOWN", (identifier or "unknown")
    return match.group(1), match.group(2)


def category(identifier: str | None) -> str:
    return subject_and_category(identifier)[1]


def subject(identifier: str | None) -> str:
    return subject_and_category(identifier)[0]


# Canonical (concern, layer) order — Appendix A's Index table, Backend ->
# Frontend -> Cross-Stack, in the order each concern's index block lists
# it. A "concern" is a rule_id/metric_name's <SUBJECT>-<CATEGORY> prefix
# (e.g. "BE-DUP", "FE-DUP" — kept distinct, never merged across scopes).
# Fixed here (not derived from the data) so a concern with zero findings
# still gets a row/chart position instead of disappearing, and so every
# stage that needs the full 19-concern taxonomy (s0_4, s4_1, ...) shares
# one definition instead of maintaining its own copy.
CONCERN_ORDER: list[tuple[str, str]] = [
    ("BE-STRUCT", "backend"),
    ("BE-DEP", "backend"),
    ("BE-DOM", "backend"),
    ("BE-ERR", "backend"),
    ("BE-CONTRACT", "backend"),
    ("BE-ROUTE", "backend"),
    ("BE-SIZE", "backend"),
    ("BE-DUP", "backend"),
    ("BE-TEST", "backend"),
    ("FE-COM", "frontend"),
    ("FE-STATE", "frontend"),
    ("FE-ROUTE", "frontend"),
    ("FE-STYLE", "frontend"),
    ("FE-DATA", "frontend"),
    ("FE-COMM", "frontend"),
    ("FE-DUP", "frontend"),
    ("CROSS-EP", "cross-stack"),
    ("CROSS-TYPE", "cross-stack"),
    ("CROSS-PROP", "cross-stack"),
]

# BE-TEST-M-001 (mock-per-test-case) is the representative metric for the
# BE-TEST concern (Table 3.2), so its current ID is classified correctly by
# the regular prefix parser. Keep the former BE-MOCK-M-001 name as a legacy
# override so the immutable historical experiment outputs remain analyzable.
# BE-COVERAGE-M-001 (formerly BE-TEST-M-001-test-coverage) is excluded from
# architectural analysis per §3.4.3 and reported separately under
# functional/efficiency outcomes (§4.8). Keep both names in the exclusion
# set for compatibility with historical observations.
METRIC_CONCERN_OVERRIDES: dict[str, str] = {"BE-MOCK-M-001-mock-per-test-case": "BE-TEST"}
ARCHITECTURAL_METRIC_EXCLUSIONS: frozenset[str] = frozenset({
    "BE-COVERAGE-M-001-test-coverage",
    "BE-TEST-M-001-test-coverage",
})


def metric_concern(metric_name: str) -> str:
    """A metric's concern id (e.g. "BE-SIZE", "FE-DUP") — same id space as
    CONCERN_ORDER — honoring the one documented override above. Callers
    that want only the metrics counted in architectural analysis should
    filter out ARCHITECTURAL_METRIC_EXCLUSIONS first."""
    if metric_name in METRIC_CONCERN_OVERRIDES:
        return METRIC_CONCERN_OVERRIDES[metric_name]
    subj, cat = subject_and_category(metric_name)
    return f"{subj}-{cat}"
