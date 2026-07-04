# Experiment

Everything specific to this study's runs, analysis, and data.

## Structure

- `prompts/` — frozen prompt files (T1_minimal.md, T1_structured.md, meta-templates); each frozen version has SHA-256 hash in header
- `scripts/` — Python orchestration scripts (agent invocation, run bundle creation)
- `runs/` — completed run bundles (large; mostly gitignored, published via Zenodo)
- `baselines-ai/` — AI-generated baseline variants (Gemini etc.) for reference
- `analysis/` — Jupyter notebooks and derived figures

## Depends on

- `baseline/` as input to agent runs (referenced by SHA in each run's manifest)
- `harness/` as evaluation tool (invoked after each agent run)

## Python environment

```bash
cd experiment
python -m venv venv
./venv/bin/pip install -r requirements.txt
```
