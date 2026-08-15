# Harness Core

[中文版](./README-CN.md)

`harness/core` is the deterministic evaluation engine used by both the baseline runner and every experiment task. It resolves rulepacks, evaluates the post-task code, validates comparison artifacts, calculates local and cumulative deltas, validates the v0.2 output contract, and writes the final evaluation atomically.

All commands below assume the current directory is the repository root.

## 1. Structure and responsibilities

```text
harness/core/
├── aggregators/
│   └── delta_aggregator.mjs
├── comparison/
│   ├── comparison_validator.mjs
│   ├── evaluation_profile.mjs
│   └── evaluation_snapshot.mjs
├── contracts/
│   ├── evaluation_contract.mjs
│   ├── evaluation.schema.json
│   ├── rulepack.schema.json
│   └── task_config.schema.json
├── env/
│   └── env_snapshot.mjs
├── io/
│   ├── evaluation_reader.mjs
│   ├── evaluation_writer.mjs
│   ├── manifest_reader.mjs
│   └── task_config_reader.mjs
├── layers/
│   ├── constraints_runner.mjs
│   ├── judgments_runner.mjs
│   └── metrics_runner.mjs
├── planning/
│   ├── scope_planner.mjs
│   └── subject_planner.mjs       # retired migration marker
├── runtime/
│   ├── adapter_registry.mjs
│   ├── rulepack_resolver.mjs
│   └── runtime_options.mjs
├── tests/
│   └── comparison.test.mjs
└── evaluate.mjs
```

| Path | Responsibility |
| --- | --- |
| `evaluate.mjs` | Thin orchestration entry point. It executes the stages in a fixed order and assembles the final artifact. |
| `runtime/runtime_options.mjs` | Strict CLI parsing, path normalization, and `self`/`trajectory` argument validation. |
| `io/manifest_reader.mjs` | Reads the Python-generated run manifest and verifies its state. |
| `io/task_config_reader.mjs` | Parses and validates `Base/T1/T2/T3.eval.yaml`, then normalizes optional fields. |
| `runtime/rulepack_resolver.mjs` | Resolves rulepack directories, validates manifests, pins versions, and checks referenced files. |
| `planning/scope_planner.mjs` | Converts every `evaluation_scopes` entry into the same execution-plan shape. |
| `runtime/adapter_registry.mjs` | Loads rulepack-declared adapters once and exposes callable registry entries. |
| `layers/` | Executes constraints, metrics, and enabled judgments and returns normalized layer results. |
| `comparison/evaluation_profile.mjs` | Produces a semantic SHA-256 profile for compatibility checks. |
| `comparison/evaluation_snapshot.mjs` | Normalizes metrics and finding identities into comparison-safe snapshots. |
| `comparison/comparison_validator.mjs` | Loads E0/pre artifacts and validates schema, status, profile, mode, and pre-commit identity. |
| `aggregators/delta_aggregator.mjs` | Calculates `pre → post` and `baseline → post` metric and finding deltas. |
| `contracts/evaluation_contract.mjs` | Shared Ajv validator used by both the artifact reader and writer. |
| `io/evaluation_reader.mjs` | Reads, hashes, parses, and schema-validates comparison artifacts. |
| `io/evaluation_writer.mjs` | Schema-validates and atomically writes the final artifact, then updates the manifest. |

## 2. Evaluation flow

The engine runs in this order:

1. Parse strict runtime options.
2. Read the run manifest and task configuration.
3. Resolve every evaluation scope and verify that its `scope_type` matches the rulepack `kind`.
4. Build execution plans and the semantic evaluation profile hash.
5. In trajectory mode, load and validate E0 and pre artifacts before running analyzers.
6. Evaluate post-task constraints, metrics, and enabled judgments.
7. Build normalized baseline, pre, and post snapshots.
8. Calculate local and cumulative deltas.
9. Apply centrally calculated baseline deltas to scope metric results.
10. Derive independent execution and compliance statuses.
11. Validate the complete v0.2 artifact and write it atomically.

The Python orchestration around this engine follows the same trajectory:

```text
E0 = reports/baseline/harness_evaluation.json
T1: baseline=E0, pre=E0, post=E1
T2: baseline=E0, pre=E1, post=E2
T3: baseline=E0, pre=E2, post=E3
```

The pre artifact is selected by matching its `target.post_commit` to the current task's resolved `pre_commit` SHA. It is not selected merely from the previous task name.

Task files express every runnable unit through one list:

```yaml
evaluation_scopes:
  - scope_id: backend
    scope_type: subject
    root_path: backend/
    rulepack_id: ts-nestjs-backend
    enabled: { constraints: [], metrics: [], judgments: [] }
  - scope_id: cross-stack
    scope_type: cross-stack
    root_path: .
    rulepack_id: cross
    enabled: { constraints: [CROSS-EP-C-001], metrics: [], judgments: [] }
```

An empty layer list means that layer is disabled for the scope. Scope IDs must be unique, and the resolver rejects a `scope_type` that does not match the selected rulepack manifest's `kind`.

## 3. Comparison modes

### 3.1 `self`

Baseline evaluation uses `self` mode and must not receive external artifact paths. The freshly evaluated post snapshot is used as baseline, pre, and post. Therefore:

- every numeric delta is `0` when both values are available;
- no finding is introduced or resolved;
- existing findings are counted as unchanged.

The canonical E0 must be generated before an experiment trajectory:

```bash
python3 experiment/instruments/agent-runners/run_harness.py --baseline
```

### 3.2 `trajectory`

Workspace and pipeline evaluation use `trajectory` mode. Both `--baseline-evaluation` and `--pre-evaluation` are required at the Node boundary. The Python runners normally resolve them automatically.

Each comparison artifact must satisfy all of these conditions:

- valid JSON conforming to Evaluation Schema v0.2;
- `execution_status: completed`;
- `comparison_status: valid`;
- the same `evaluation_profile_hash` as the current run;
- the baseline artifact was produced in `self` mode;
- for T2 and later, the pre artifact's `target.post_commit` equals the current `pre_commit` SHA.

T1 intentionally uses the same E0 file for baseline and pre. Its isolated workspace has a newly created Git history, so E0 and workspace commit SHAs are not required to be identical in this one case.

## 4. Evaluation profile compatibility

`evaluation_profile_hash` prevents deltas from combining measurements produced by different definitions. The profile includes:

- scope IDs, types, and relative roots;
- rulepack IDs and pinned versions;
- enabled constraints, metrics, and judgments;
- thresholds;
- the rule selection for every scope, including cross-stack;
- judgment configuration only when judgments are enabled;
- rulepack file hashes;
- shared adapter implementation hashes;
- executable Core `.mjs` files and Core JSON contract hashes.

Human descriptions, task IDs, task metadata, and inactive judgment settings are excluded. Consequently, `Base`, `T1`, `T2`, and `T3` can share a profile when their actual measurement definitions are the same.

After changing Core logic, schemas, rulepacks, enabled rules, or thresholds, regenerate E0 before continuing an experiment. Old artifacts are deliberately rejected; there is no v0.1 compatibility path.

## 5. Delta semantics

The artifact contains two independent comparisons:

| Field | Meaning |
| --- | --- |
| `deltas.run_local` | Current task effect: `post - pre`. |
| `deltas.trajectory_cumulative` | Total trajectory effect: `post - baseline`. |

Metrics and judgments include `from`, `to`, numeric `delta`, direction, and availability. Missing or nonnumeric values produce `delta: null` with `status: unavailable`; they are never silently converted to zero.

Constraint findings use a normalized fingerprint composed of scope, rule ID, source rule ID, location, and message. Comparison is multiset-based, so duplicate findings remain distinct. Each dimension reports:

- `introduced` and `introduced_count`;
- `resolved` and `resolved_count`;
- `unchanged_count`;
- `before_count`, `after_count`, and `net_change`.

All scope findings are included through one path. Absolute workspace prefixes are normalized so the same logical finding in E0 and an isolated session remains unchanged.

## 6. Status model

Evaluation Schema v0.2 separates three concepts:

| Field | Values | Meaning |
| --- | --- | --- |
| `execution_status` | `completed`, `partial`, `failed` | Whether analyzers executed reliably. |
| `compliance_status` | `passed`, `failed`, `unknown` | Whether evaluated architecture rules passed. |
| `comparison_status` | `valid`, `invalid` | Whether comparison inputs and deltas are trustworthy. |

A baseline can correctly have `execution_status: completed` and `compliance_status: failed`: the Harness ran successfully and found existing violations. This does not invalidate E0. Analyzer errors produce `partial` execution and `unknown` compliance; such an artifact cannot become the pre input for the next task.

The Python `harness_status` in `harness_execution.json` remains process-level status. A nonzero Node exit or invalid output makes it `failure`.

## 7. CLI contract

The normal entry points are the Python runners. Direct Node execution is primarily for development:

```bash
node harness/core/evaluate.mjs \
  --target /absolute/workspace \
  --manifest /absolute/output/manifest.json \
  --task-config /absolute/repo/harness/tasks/T2.eval.yaml \
  --rulepack /absolute/repo/harness/rulepacks \
  --baseline /absolute/repo/baseline \
  --pre-commit <full-sha> \
  --post-commit <full-sha> \
  --run-id <run-id> \
  --trajectory-id <session-id> \
  --output /absolute/output/harness_evaluation.json \
  --mode full \
  --comparison-mode trajectory \
  --baseline-evaluation /absolute/reports/baseline/harness_evaluation.json \
  --pre-evaluation /absolute/reports/experiments/<session>/<previous-task>/harness_evaluation.json
```

Unknown CLI options are rejected. `--target`, `--task-config`, `--rulepack`, `--pre-commit`, `--post-commit`, and `--comparison-mode` are required. In `self` mode, omit both evaluation artifact options.

For a manual workspace evaluation, use:

```bash
python3 experiment/instruments/agent-runners/run_harness.py \
  --workspace-dir experiment/workspace/<session_id> \
  --task T2 \
  --pre-ref task-T1-done
```

Use `--baseline-evaluation` and `--pre-evaluation` together only when overriding automatic artifact resolution.

## 8. Output contract

`harness_evaluation.json` uses schema version `0.2.0`. Major sections are:

- identity: run, trajectory, task, target commits, and profile hash;
- `comparison`: immutable baseline/pre artifact references and current post identity;
- `env_snapshot`: Node, pnpm, OS, Harness commit, and adapter versions;
- `scopes`: uniform subject and cross-stack results with `scope_id`, `scope_type`, and `scope_root`;
- `layers`: flattened reporting view;
- `deltas`: local and cumulative comparison results;
- status dimensions and structured execution errors.

The reader and writer share the same Ajv validator. This prevents an artifact accepted as input from using a different structural contract than an artifact produced as output.

## 9. Development and verification

Run the Core tests and syntax checks:

```bash
npm --prefix harness test
npm --prefix harness run lint
```

The comparison tests verify unified scope parsing, zero self deltas, duplicate-finding multiset behavior, strict CLI invariants, and profile equivalence across `Base/T0/T1/T2/T3`.

For an end-to-end self smoke test without replacing the canonical E0:

```bash
python3 experiment/instruments/agent-runners/run_harness.py \
  --baseline \
  --output-dir /tmp/harness-baseline-smoke \
  --force
```

Do not continue a trajectory after changing the evaluation profile. Regenerate the canonical baseline artifact, then start a new session so every E0–E3 result is comparable.
