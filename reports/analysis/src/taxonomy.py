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
