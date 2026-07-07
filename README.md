```markdown
# AI Architecture Integrity Study

This repository contains an automated empirical study framework designed to evaluate the architectural integrity of software systems iteratively modified by autonomous AI agents.

Using a full-stack Mini CRM application as a baseline, the framework measures how continuous, multi-step agent interventions impact long-term software evolution, specifically tracking structural degradation and architectural compliance over time.

## System Architecture

The project is decoupled into two primary domains: a Python-based experimental pipeline for agent orchestration, and a Node.js-based harness for strict architectural evaluation.

| Component | Description |
| :--- | :--- |
| **`baseline/`** | The initial state of the full-stack system. Contains a NestJS backend and a React Vite frontend, serving as the clean starting point for all agent trajectories. |
| **`experiment/`** | The Python-based orchestration layer. Manages task definitions, prompt assembly, and executes AI agents (e.g., Claude, Codex) in isolated Docker sandboxes. |
| **`harness/`** | The Node.js evaluation engine. An extensible microkernel architecture that runs constraints (e.g., dependency rules), metrics, and LLM judgments against the agent-modified code. |
| **`docs/`** | Documentation outlining interface contracts, business rules, and architectural principles provided as context to the AI agents during task execution. |

## Core Workflow

The system relies on a state-machine-driven `manifest.json` to synchronize between the Python runner and the Node evaluation engine.

1. **Agent Execution:** The Python pipeline (`run_pipeline.py`) clones the baseline into a temporary workspace, mounts it into a Docker sandbox, and delegates a specific task to the AI agent.
2. **State Handoff:** Upon completion, the Python layer writes a `manifest.json` setting the status to `ready_for_evaluation`.
3. **Automated Evaluation:** The Node.js Harness is triggered. It reads the manifest, captures an immutable environment snapshot, and runs a battery of tests (Constraints, Metrics, Judgments).
4. **Data Persistence:** The Harness calculates the performance delta (local run vs. baseline trajectory) and atomically commits the results to `evaluation.json`, shifting the manifest status to `evaluated`.

## Prerequisites

Ensure the following dependencies are installed before running experiments:

* **Node.js:** v18+ (with `pnpm` enabled)
* **Python:** 3.14+
* **Docker:** Required for isolating agent execution environments

## Getting Started

### 1. Setup

Install dependencies for both the Python pipeline and the Node.js harness:

```bash
# Setup experiment pipeline
cd experiment
pip install -r requirements.txt

# Setup evaluation harness
cd ../harness
pnpm install
```

### 2. Running an Experiment

Trigger a complete agent execution and evaluation cycle using the pipeline script. You can specify the agent, task, and prompting strategy:

```bash
./experiment/instruments/agent-runners/run_pipeline.py \
  --agent claude \
  --task T0 \
  --strategy minimal
```

### 3. Reviewing Artifacts

Once an experiment run completes, the output artifacts are safely stored in an isolated workspace:

`experiment/workspace/run_{agent}_{task}_{strategy}_{timestamp}/`

Inside this directory, you will find:

* The modified source code (Git initialized).
* `manifest.json`: The state-machine record of the run.
* `evaluation.json`: The atomic, rich data report containing constraint findings, metric deltas, and environment metadata for subsequent statistical analysis.

```

```