# Experiment

Everything specific to this study's runs, analysis, and data.

## Structure

- `design/prompts/` — prompt assets and frozen prompt variants used by the study design
- `design/tasks/` — task-specific input materials such as requirements and generation prompts
- `instruments/agent-images/` — Dockerfiles for agent sandbox images
- `instruments/agent-runners/` — Python and shell entry points for assembling prompts, launching agent runs, and invoking the harness evaluator
- `runs/` — run bundles grouped under `canonical/` and `pilot/`
- `analysis/` — derived tables, figures, stats, and notebooks
- `workspace/` — per-run working directories created by the runner pipeline

## Depends on

- `baseline/` as input to agent runs (referenced by SHA in each run's manifest)
- `harness/` as evaluation tool (invoked after each agent run)

## Current runner status

- The main orchestration entry points currently live in `instruments/agent-runners/run_pipeline.py` and `instruments/agent-runners/run_pipeline.sh`.
- The Python evaluator is still experimental and contains placeholder harness wiring that should be updated before treating the end-to-end pipeline as production-ready.

## Python environment

```bash
cd experiment
python -m venv venv
./venv/bin/pip install -r requirements.txt
```

## How to run

Current entry points:

- Python pipeline: `instruments/agent-runners/run_pipeline.py`
- Shell pipeline: `instruments/agent-runners/run_pipeline.sh`

Python example:

```bash
cd experiment/instruments/agent-runners
python run_pipeline.py \
	--agent claude \
	--task T0 \
	--strategy minimal
	--baseline-dir baseline
```

Optional flags supported by the current Python runner:

- `--model` — override the default model for the selected agent
- `--interface` — attach one interface document from `docs/interface/`
- `--baseline-dir` — override the baseline source directory copied into the isolated workspace; supports absolute paths or paths relative to the repository root

Shell example:

```bash
cd experiment/instruments/agent-runners
BASELINE_DIR=/absolute/path/to/other-baseline \
bash run_pipeline.sh
```

Before running:

- Make sure Docker is available locally
- Make sure the required agent credential is exported in your shell
- Make sure `baseline/` and `harness/` are present in the repository root

## Output location

The current pipelines create one isolated working directory per run under:

- `experiment/workspace/<run_id>/`

Typical files written there by the current code path include:

- cloned baseline workspace
- `.agent_instruction.md`
- `agent_execution.log`
- `execution_metrics.json`
- `manifest.json`
- `evaluation.json`

`runs/` currently exists as a study data area for curated bundles, but the current Python and shell runners do not automatically write completed runs there.
