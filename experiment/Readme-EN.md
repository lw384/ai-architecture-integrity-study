# Experiment

[中文版](./Readme-CN.md)

This directory runs the T1–T3 agent tasks in sequence, preserves an isolated workspace for each experiment session, and invokes the Harness to evaluate every task result. All commands below assume that the current directory is the repository root.

## 1. Structure and responsibilities of `experiment/`

```text
experiment/
├── design/
│   ├── memory/
│   │   └── initial_memory.md
│   └── tasks/
│       ├── T1_minimal.md
│       ├── T1_structured.md
│       ├── T2_minimal.md
│       ├── T2_structured.md
│       ├── T3_minimal.md
│       └── T3_structured.md
├── instruments/
│   ├── agent-images/
│   │   ├── Dockerfile.claude
│   │   └── Dockerfile.codex
│   └── agent-runners/
│       ├── config.py
│       ├── comparison_resolver.py
│       ├── docker_runner.py
│       ├── evaluator.py
│       ├── generate_report.py
│       ├── prompt_builder.py
│       ├── run_harness.py
│       └── run_pipeline.py
├── venv/
├── workspace/
└── package.json
```

| Path | Responsibility |
| --- | --- |
| `design/tasks/T{1,2,3}_{minimal,structured}.md` | The six task templates. `--task` and `--strategy` together select the file used by a run. |
| `design/memory/initial_memory.md` | Initial content for the memory condition. It is read only when `--write-memory-md` is used while creating a new session. |
| `instruments/agent-images/` | Docker image definitions for the Claude Code and Codex agents. |
| `instruments/agent-runners/config.py` | Agent images, default models, authentication directories, memory filenames, and in-container CLI commands. |
| `instruments/agent-runners/comparison_resolver.py` | Resolves canonical E0 and the unique pre-task evaluation by immutable commit SHA. |
| `instruments/agent-runners/prompt_builder.py` | Reads the task template, removes HTML comments, and appends the memory instructions and `[TASK_COMPLETED]` completion protocol. |
| `instruments/agent-runners/docker_runner.py` | Mounts the workspace and authentication directory, launches the agent container, parses the CLI output, and writes the execution record. |
| `instruments/agent-runners/evaluator.py` | Builds and runs `harness/core/evaluate.mjs` and writes the Harness manifest, execution record, and evaluation result. |
| `instruments/agent-runners/run_pipeline.py` | Full entry point: prepares or reuses a workspace, runs the agent, commits and tags the result, invokes the Harness, and archives the artifacts. |
| `instruments/agent-runners/run_harness.py` | Harness-only entry point. It can evaluate the current snapshot of an existing workspace, a specific tag, or the baseline through `--baseline`. |
| `instruments/agent-runners/generate_report.py` | Optional utility that converts constraint violations from `harness_evaluation.json` into Markdown. |
| `venv/` | Optional local Python virtual environment. The runners currently use only the Python standard library. |
| `workspace/session_<timestamp>/` | Persistent working copy and isolated Git repository for one experiment session. T1–T3 must accumulate sequentially in the same session. |
| `package.json` | Metadata for the `experiment` package in the pnpm workspace, plus placeholder test and lint commands. |

The experiment also reads from or writes to these repository-level directories:

| Path | Role in the experiment |
| --- | --- |
| `baseline/` | Source code for every new session and the per-scope metric baseline. |
| `harness/tasks/<task>.eval.yaml` | Uniform `evaluation_scopes` and enabled rules/metrics for `Base`, `T1`, `T2`, and `T3`. |
| `harness/rulepacks/` | Backend, frontend, and cross-stack rulepacks executed by the Harness. |
| `reports/experiments/<session_id>/` | Archive for pipeline runs and workspace Harness evaluations. |
| `reports/baseline/` | Default output directory for baseline Harness evaluations. |

The pipeline source baseline path is fixed to `baseline/`. Comparison data comes from E0 and prior task artifacts, while `--baseline-dir` on the Harness-only entry point can override the source directory used by scope metrics.

## 2. Pipeline flow, inputs, and artifacts

### 2.1 Create a session and run T1

When `--from-workspace` is omitted, the pipeline performs these steps:

1. Copies `baseline/` to `experiment/workspace/session_<timestamp>/`, excluding the source repository's `.git` directory.
2. Initializes an independent Git repository in the workspace, commits the initial snapshot, and creates the `baseline` tag.
3. If `--write-memory-md` is supplied, reads `experiment/design/memory/initial_memory.md`, creates either `CLAUDE.md` or `AGENTS.md` at the workspace root, commits it, and creates the `baseline-with-memory` tag.
4. Reads `experiment/design/tasks/T1_<strategy>.md`, as selected by `--task T1 --strategy <minimal|structured>`.
5. Builds the final prompt. During execution it is temporarily written to `.agent_instruction.md` at the workspace root and is also archived as `reports/experiments/<session_id>/T1/prompt.md`.
6. Mounts the workspace and the selected agent's authentication directory into a Docker container. The agent modifies the workspace directly. An agent execution counts as successful only when the process succeeds and its final output contains `[TASK_COMPLETED]`.
7. Commits all agent changes as `task: T1 completed` and creates the `task-T1-done` tag.
8. Evaluates that commit with `harness/tasks/T1.eval.yaml` and `harness/rulepacks/`.
9. Writes the execution, evaluation, and task metadata to `reports/experiments/<session_id>/T1/`.

### 2.2 Reuse the session for T2 and T3

T2 and T3 reuse the workspace created by T1 through `--from-workspace`. Explicitly specifying `--from-tag` is recommended:

```text
baseline → task-T1-done → task-T2-done → task-T3-done
```

- T2 starts from `task-T1-done`, reads `T2_<strategy>.md`, and creates `task-T2-done` when complete.
- T3 starts from `task-T2-done`, reads `T3_<strategy>.md`, and creates `task-T3-done` when complete.
- After every successful task, the pipeline immediately runs the corresponding `harness/tasks/Tn.eval.yaml` configuration.
- Keep `--agent`, `--model`, `--strategy`, and the memory condition consistent within one experimental condition. The pipeline does not automatically prevent these conditions from being changed midway through a session.

### 2.3 Artifacts for each session

```text
experiment/workspace/<session_id>/
└── Independent Git workspace
    ├── tag: baseline
    ├── tag: baseline-with-memory       # memory condition only
    ├── tag: task-T1-done
    ├── tag: task-T2-done
    └── tag: task-T3-done

reports/experiments/<session_id>/
├── session_manifest.yaml
└── <T1|T2|T3>/
    ├── prompt.md
    ├── execution.json
    ├── task_manifest.yaml
    ├── manifest.json
    ├── harness_execution.json
    └── harness_evaluation.json
```

| Artifact | Contents |
| --- | --- |
| `session_manifest.yaml` | Session creation time and the initial agent, model, strategy, and memory conditions. |
| `prompt.md` | Complete prompt sent to the agent for this task. |
| `execution.json` | Agent, model, exit code, completion marker, duration, token/cost fields, raw agent events, and stderr. |
| `task_manifest.yaml` | Task start ref/SHA, completed commit/tag, comparison artifact references, and the Harness artifact index. |
| `manifest.json` | Task, revisions, comparison mode, and resolved comparison inputs supplied to the Harness. |
| `harness_execution.json` | Harness command, exit code, timeout status, stdout, and stderr. |
| `harness_evaluation.json` | Uniform `scopes[]` results, local/cumulative deltas, artifact identities, and execution/comparison statuses. The constraint result is derived from local introduced findings. |

If the agent or Harness fails partway through, the existing workspace and task directory remain available for diagnosis. Pass `--force` explicitly before writing to the same task archive again or replacing an existing `task-Tn-done` tag.

## 3. Step-by-step instructions

### 3.1 One-time setup

Python 3.10+, Git, Node.js, pnpm, and a running Docker daemon are required. First install the Node.js dependencies used by the Harness:

```bash
pnpm install
```

Ensure that Git has a commit identity because the pipeline automatically creates commits inside every workspace:

```bash
git config user.name
git config user.email
```

Build the image for the agent you intend to use. Only one image is required if you use only one agent:

```bash
docker build \
  -f experiment/instruments/agent-images/Dockerfile.claude \
  -t local/claude-sandbox:latest \
  .
```

```bash
docker build \
  -f experiment/instruments/agent-images/Dockerfile.codex \
  -t local/codex-sandbox:latest \
  .
```

A valid CLI authentication state must also be available before execution:

- Claude uses `~/.claude_agent_home/` on the host, mounted as `/home/codex_agent` in the container.
- Codex uses `~/.codex-docker-api-home/` on the host, mounted as `/home/codex_agent/.codex` in the container.

The current runners do not automatically load `experiment/.env`. Authentication must be present in the mounted directories above. To override the default model, add `--model <model-id>` consistently to every task command.

### 3.2 Run T1, T2, and T3 in sequence

Before starting a new trajectory, generate a current v0.2 E0 with `python3 experiment/instruments/agent-runners/run_harness.py --baseline --force`. The pipeline deliberately rejects missing, incomplete, or older-schema baseline artifacts before launching the agent.

The following example uses Claude, the `structured` strategy, and no memory for a single experiment session. For a `minimal` condition, change all three commands to `--strategy minimal`. For Codex, change all three commands to `--agent codex`.

First, run T1. This command creates a new session:

```bash
python3 experiment/instruments/agent-runners/run_pipeline.py \
  --agent claude \
  --strategy structured \
  --task T1
```

For a memory condition, add `--write-memory-md` only to the T1 command that creates the session:

```bash
python3 experiment/instruments/agent-runners/run_pipeline.py \
  --agent claude \
  --strategy structured \
  --task T1 \
  --write-memory-md
```

After T1 succeeds, and assuming that no other sessions are being created concurrently, select the newly created workspace by its timestamped directory name:

```bash
export WORKSPACE="$(find "$PWD/experiment/workspace" \
  -mindepth 1 \
  -maxdepth 1 \
  -type d \
  -name 'session_*' \
  -print | sort | tail -n 1)"
export SESSION_ID="$(basename "$WORKSPACE")"
```

If several pipelines are running concurrently, identify the session ID from this T1 run's terminal output and set `WORKSPACE` to that directory manually instead of selecting the newest directory.

Confirm that the T1 tag and archive were created:

```bash
git -C "$WORKSPACE" rev-parse --verify task-T1-done
test -f "reports/experiments/$SESSION_ID/T1/harness_evaluation.json"
```

Second, run T2 in the same workspace from the T1 completion point:

```bash
python3 experiment/instruments/agent-runners/run_pipeline.py \
  --agent claude \
  --strategy structured \
  --task T2 \
  --from-workspace "$WORKSPACE" \
  --from-tag task-T1-done
```

Confirm that T2 completed:

```bash
git -C "$WORKSPACE" rev-parse --verify task-T2-done
test -f "reports/experiments/$SESSION_ID/T2/harness_evaluation.json"
```

Third, run T3 in the same workspace from the T2 completion point:

```bash
python3 experiment/instruments/agent-runners/run_pipeline.py \
  --agent claude \
  --strategy structured \
  --task T3 \
  --from-workspace "$WORKSPACE" \
  --from-tag task-T2-done
```

Confirm the complete task chain and all three evaluation results:

```bash
git -C "$WORKSPACE" tag --list
test -f "reports/experiments/$SESSION_ID/T1/harness_evaluation.json"
test -f "reports/experiments/$SESSION_ID/T2/harness_evaluation.json"
test -f "reports/experiments/$SESSION_ID/T3/harness_evaluation.json"
```

To replace a task archive left by a failed run or rerun a task whose tag already exists, append `--force` to that pipeline command. This allows the task artifacts to be overwritten and the matching tag to be recreated. Confirm the target session and task before using it.

### 3.3 Run the Harness independently

Harness-only mode does not run an agent or create a task commit. It evaluates either the current workspace tree or a specified tag. The following command evaluates a session currently at `task-T3-done` and writes the result to a separate directory so that the original pipeline artifacts remain unchanged:

```bash
python3 experiment/instruments/agent-runners/run_harness.py \
  --run-id "$SESSION_ID" \
  --task T3 \
  --output-dir "reports/experiments/$SESSION_ID/T3/harness_rerun"
```

An absolute workspace path can also be used to evaluate a historical snapshot. For example, to reevaluate T1:

```bash
python3 experiment/instruments/agent-runners/run_harness.py \
  --workspace-dir "$WORKSPACE" \
  --task T1 \
  --from-tag task-T1-done \
  --output-dir "reports/experiments/$SESSION_ID/T1/harness_rerun"
```

`--from-tag` requires a workspace with no uncommitted or untracked changes and checks out the tag in detached-HEAD mode. It selects the code snapshot being evaluated, while `--task` selects the Harness rules; the two must correspond. If `--from-tag` is omitted but the current HEAD differs from an existing `task-<task>-done` tag, the command refuses to run unless `--allow-task-ref-mismatch` is explicitly supplied.

The default output directory is `reports/experiments/<session_id>/<task>/`. If it already contains Harness artifacts, choose a new `--output-dir`, or use `--force` to replace only `manifest.json`, `harness_execution.json`, and `harness_evaluation.json` in that directory.

By default, the Harness reads `start_ref` from the original task manifest, resolves it to a full SHA, and selects the unique pre artifact whose `target.post_commit` matches that SHA. If the ref is unavailable, it uses `HEAD^`. Supply `--pre-ref <git-ref>` only when automatic inference is incorrect. Explicit artifact overrides must provide `--baseline-evaluation` and `--pre-evaluation` together. `--baseline-dir` changes the source baseline used by metric runners.

### 3.4 Evaluate the baseline

Use `--baseline` to evaluate `baseline/` in self-comparison mode. The default task is `Base`, with rules from `harness/tasks/Base.eval.yaml`:

```bash
python3 experiment/instruments/agent-runners/run_harness.py --baseline
```

The default artifacts are:

```text
reports/baseline/manifest.json
reports/baseline/harness_execution.json
reports/baseline/harness_evaluation.json
```

If the default artifacts already exist, writing to a new directory is recommended so that the previous result is preserved:

```bash
python3 experiment/instruments/agent-runners/run_harness.py \
  --baseline \
  --output-dir reports/baseline-runs/run-01
```

To replace the three existing Harness files in `reports/baseline/`:

```bash
python3 experiment/instruments/agent-runners/run_harness.py \
  --baseline \
  --force
```

Check `harness_status` and `exit_code` in `harness_execution.json` for process success. In `harness_evaluation.json`, inspect `execution_status` and `comparison_status`. When execution is completed, `deltas.run_local.constraints.introduced_count == 0` means the current constraint evaluation passed; a value greater than `0` means it failed.
