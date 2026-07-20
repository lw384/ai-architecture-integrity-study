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

### Run a full experiment

Run from the `experiment/` directory:

```bash
cd /Users/luowei/project/ai-architecture-integrity-study/experiment
./venv/bin/python instruments/agent-runners/run_pipeline.py \
	--agent claude \
	--task T0 \
	--strategy minimal
```

To stream agent output and print heartbeat messages while the container is running:

```bash
cd /Users/luowei/project/ai-architecture-integrity-study/experiment
./venv/bin/python instruments/agent-runners/run_pipeline.py \
	--agent claude \
	--task T0 \
	--strategy minimal \
	--live-output \
	--heartbeat-seconds 30
```

Optional flags supported by the current Python runner:

- `--model` — override the default model for the selected agent
- `--interface` — attach one interface document from `docs/interface/`
- `--baseline-dir` — override the baseline source directory copied into the isolated workspace; supports absolute paths or paths relative to the repository root
- `--live-output` — stream the container output instead of waiting for the run to finish
- `--heartbeat-seconds` — when live output is enabled, print periodic workspace heartbeat messages during long quiet periods

### Run the shell wrapper

Shell example:

```bash
cd /Users/luowei/project/ai-architecture-integrity-study/experiment/instruments/agent-runners
BASELINE_DIR=/absolute/path/to/other-baseline \
bash run_pipeline.sh
```

### Evaluate the current baseline with Harness only

This path skips the agent run and writes the Harness result directly into `baseline/evaluation.json`.

```bash
cd /Users/luowei/project/ai-architecture-integrity-study && \
BASELINE_SHA="$(cd baseline && git rev-parse HEAD)" && \
POST_SHA="$BASELINE_SHA$( [ -n "$(cd baseline && git status --porcelain)" ] && printf '+dirty' )" && \
cat > baseline/manifest.json <<EOF
{
	"status": "ready_for_evaluation",
	"events": ["agent_started", "agent_completed"],
	"task_id": "T0",
	"baseline_commit": "$BASELINE_SHA",
	"pre_commit": "$BASELINE_SHA",
	"rulepack_id": "task::T0"
}
EOF
cd harness && \
node core/evaluate.mjs \
	--target /Users/luowei/project/ai-architecture-integrity-study/baseline \
	--manifest /Users/luowei/project/ai-architecture-integrity-study/baseline/manifest.json \
	--task-config /Users/luowei/project/ai-architecture-integrity-study/harness/tasks/T0.eval.yaml \
	--rulepack /Users/luowei/project/ai-architecture-integrity-study/harness/rulepacks \
	--baseline /Users/luowei/project/ai-architecture-integrity-study/baseline \
	--pre-commit "$BASELINE_SHA" \
	--post-commit "$POST_SHA" \
	--run-id baseline_eval_T0 \
	--trajectory-id baseline_eval_T0 \
	--output /Users/luowei/project/ai-architecture-integrity-study/baseline/evaluation.json \
	--mode full
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

Useful inspection commands:

```bash
cd /Users/luowei/project/ai-architecture-integrity-study
ls -dt experiment/workspace/run_* | head -n 3
```

```bash
cd /Users/luowei/project/ai-architecture-integrity-study/experiment/workspace/<run_id>
git status --short
git diff --stat
sed -n '1,120p' agent_execution.log
sed -n '1,120p' execution_metrics.json
sed -n '1,160p' evaluation.json
```

`runs/` currently exists as a study data area for curated bundles, but the current Python and shell runners do not automatically write completed runs there.
