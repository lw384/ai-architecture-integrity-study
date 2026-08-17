#!/usr/bin/env python3
"""Shared path constants.

A data-layout contract, not business logic (same spirit as taxonomy.py) —
if reports/analysis/ ever gets reorganized, this is the one file to fix
instead of every stage script's boilerplate.
"""

from pathlib import Path

ANALYSIS_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ANALYSIS_DIR / "data"
DERIVED_DIR = DATA_DIR / "derived"
FIGURES_DIR = ANALYSIS_DIR / "figures"
