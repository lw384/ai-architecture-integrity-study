# Harness evaluation analysis

Run from any directory:

```bash
python3 /Users/luowei/project/ai-architecture-integrity-study/reports/analysis/harness_analysis.py
```

The default input is `reports/experiments/session_*/T*/harness_evaluation.json`.
The default output directory is `reports/analysis/output/`.

Generated artifacts:

- `harness_analysis_notebook.ipynb` — cell-by-cell visual exploration notebook
- `index.html` — self-contained visual analysis dashboard
- `run_summary.csv` — one row per evaluation
- `constraint_findings.csv` — one row per constraint finding
- `metric_values.csv` — one row per metric observation
- `file_hotspots.csv` — findings aggregated by normalized source path
- `analysis_summary.json` — machine-readable headline statistics

Use `--include-reruns` to include nested rerun outputs. By default, only the
canonical Harness result directly under each task directory is included so a
rerun of the same code does not receive extra statistical weight.

The dashboard follows this interpretation order:

1. Check measurement reliability: status, metric coverage, and metric errors.
2. Inspect T1 → T2 → T3 trajectories within each session.
3. Compare agent × strategy conditions descriptively.
4. Locate recurring rule and file hotspots.
5. Compare continuous metrics only within the same metric and direction.

Current condition cells contain one session each. Treat condition plots as
descriptive evidence, not causal or statistically significant comparisons.

## Notebook

Open `harness_analysis_notebook.ipynb` in JupyterLab, Jupyter Notebook, VS Code,
or another notebook environment with a Python kernel, then run all cells. It
uses the standard-library analysis functions from `harness_analysis.py` and
IPython's built-in HTML display; pandas, matplotlib, and seaborn are not
required.
