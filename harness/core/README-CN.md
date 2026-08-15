# Harness Core

[English version](./README-EN.md)

`harness/core` 是 baseline 与每个实验任务共同使用的确定性评估引擎。它负责解析 rulepack、评估任务后的代码、验证 comparison artifact、计算局部与累计 delta、校验 v0.2 输出契约，并原子写入最终评估结果。

以下命令均假设当前目录是仓库根目录。

## 1. 目录结构与职责

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
│   └── subject_planner.mjs       # 已停用的迁移标记
├── runtime/
│   ├── adapter_registry.mjs
│   ├── rulepack_resolver.mjs
│   └── runtime_options.mjs
├── tests/
│   └── comparison.test.mjs
└── evaluate.mjs
```

| 路径 | 职责 |
| --- | --- |
| `evaluate.mjs` | 精简的编排入口；按固定顺序执行各阶段并组装最终 artifact。 |
| `runtime/runtime_options.mjs` | 严格解析 CLI、规范化路径，并校验 `self`/`trajectory` 参数。 |
| `io/manifest_reader.mjs` | 读取 Python 生成的运行 manifest 并校验其状态。 |
| `io/task_config_reader.mjs` | 解析并校验 `Base/T1/T2/T3.eval.yaml`，再规范化可选字段。 |
| `runtime/rulepack_resolver.mjs` | 解析 rulepack 目录、校验 manifest、固定版本并检查被引用文件。 |
| `planning/scope_planner.mjs` | 把每个 `evaluation_scopes` 条目转换为统一的执行计划结构。 |
| `runtime/adapter_registry.mjs` | 统一加载 rulepack 声明的 adapter，并提供可调用 registry。 |
| `layers/` | 执行 constraints、metrics 和已启用 judgments，返回规范化结果。 |
| `comparison/evaluation_profile.mjs` | 生成用于兼容性校验的语义 SHA-256 profile。 |
| `comparison/evaluation_snapshot.mjs` | 把 metric 与 finding 标识规范化为可比较快照。 |
| `comparison/comparison_validator.mjs` | 加载 E0/pre，并校验 schema、状态、profile、模式和 pre commit。 |
| `aggregators/delta_aggregator.mjs` | 计算 `pre → post` 与 `baseline → post` 的 metric/finding delta。 |
| `contracts/evaluation_contract.mjs` | artifact reader 与 writer 共用的 Ajv 校验器。 |
| `io/evaluation_reader.mjs` | 读取、哈希、解析并按 schema 校验 comparison artifact。 |
| `io/evaluation_writer.mjs` | 校验并原子写入最终 artifact，再更新 manifest。 |

## 2. 评估流程

引擎严格按以下顺序运行：

1. 严格解析 runtime options。
2. 读取运行 manifest 和 task 配置。
3. 解析所有 evaluation scope，并校验 `scope_type` 与 rulepack `kind` 一致。
4. 构建执行计划和语义 evaluation profile hash。
5. trajectory 模式下，在运行 analyzer 前加载并验证 E0/pre。
6. 评估 post 状态的 constraints、metrics 和已启用 judgments。
7. 构建规范化 baseline、pre、post 快照。
8. 计算局部与累计 delta。
9. 把统一计算的 baseline delta 回填到 scope metric 结果。
10. 分别推导执行状态与合规状态。
11. 校验完整的 v0.2 artifact 并原子写入。

Python 编排层对应的 trajectory 是：

```text
E0 = reports/baseline/harness_evaluation.json
T1: baseline=E0, pre=E0, post=E1
T2: baseline=E0, pre=E1, post=E2
T3: baseline=E0, pre=E2, post=E3
```

pre artifact 通过 `target.post_commit == 当前任务解析后的 pre_commit SHA` 进行选择，而不是简单按照“上一个任务名称”选择。

Task 文件通过同一个列表描述所有可执行单元：

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

某个 layer 的列表为空，表示该 scope 不执行此 layer。`scope_id` 必须唯一；如果 `scope_type` 与所选 rulepack manifest 的 `kind` 不一致，resolver 会直接拒绝配置。

## 3. Comparison 模式

### 3.1 `self`

Baseline 评估使用 `self`，不得传入外部 artifact。刚评估出的 post 快照同时作为 baseline、pre 和 post，因此：

- 可比较的数值 delta 都是 `0`；
- introduced/resolved finding 都是 `0`；
- baseline 已有 finding 全部计入 unchanged。

正式实验前必须先生成 canonical E0：

```bash
python3 experiment/instruments/agent-runners/run_harness.py --baseline
```

### 3.2 `trajectory`

Workspace 与 pipeline 评估使用 `trajectory`。在 Node 边界，`--baseline-evaluation` 与 `--pre-evaluation` 必须同时提供；通常由 Python runner 自动解析。

每个 comparison artifact 必须满足：

- 是符合 Evaluation Schema v0.2 的合法 JSON；
- `execution_status: completed`；
- `comparison_status: valid`；
- 与当前评估拥有相同的 `evaluation_profile_hash`；
- baseline artifact 由 `self` 模式生成；
- T2 及之后的 pre artifact，其 `target.post_commit` 等于当前 `pre_commit` SHA。

T1 的 baseline 与 pre 都是同一个 E0 文件。独立 workspace 会创建新的 Git 历史，因此仅在该场景不要求 E0 commit 与 workspace commit SHA 相同。

## 4. Evaluation Profile 兼容性

`evaluation_profile_hash` 防止把不同测量定义产生的数据混入同一次 delta。Profile 包含：

- scope ID、类型与相对 root；
- rulepack ID 与固定版本；
- 已启用 constraints、metrics、judgments；
- thresholds；
- 每个 scope（包括 cross-stack）的规则选择；
- 仅在启用 judgment 时纳入 judgment 配置；
- rulepack 文件哈希；
- 共享 adapter 实现哈希；
- Core 可执行 `.mjs` 文件与 Core JSON 契约哈希。

人类可读描述、task ID、task metadata 和未启用的 judgment 配置不会进入 profile。因此，当实际测量定义相同时，`Base`、`T1`、`T2`、`T3` 可以共享同一 profile。

修改 Core 逻辑、schema、rulepack、启用规则或 threshold 后，必须重新生成 E0 再继续实验。旧 artifact 会被明确拒绝，不提供 v0.1 兼容路径。

## 5. Delta 语义

Artifact 包含两组独立比较：

| 字段 | 含义 |
| --- | --- |
| `deltas.run_local` | 当前任务影响：`post - pre`。 |
| `deltas.trajectory_cumulative` | 整条轨迹累计影响：`post - baseline`。 |

Metrics 与 judgments 会记录 `from`、`to`、数值 `delta`、direction 和 availability。缺失或非数值结果输出 `delta: null`、`status: unavailable`，不会被静默转换为 0。

Constraint finding 的规范化指纹由 scope、rule ID、source rule ID、location 与 message 组成。比较采用多重集算法，因此重复 finding 不会被合并。每个比较维度都会记录：

- `introduced` 与 `introduced_count`；
- `resolved` 与 `resolved_count`；
- `unchanged_count`；
- `before_count`、`after_count` 与 `net_change`。

所有 scope finding 都通过同一条路径纳入比较。绝对 workspace 前缀会被规范化，因此 E0 与独立 session 中的同一逻辑 finding 会保持 unchanged。

## 6. 状态模型

Evaluation Schema v0.2 把三个概念明确分离：

| 字段 | 取值 | 含义 |
| --- | --- | --- |
| `execution_status` | `completed`、`partial`、`failed` | Analyzer 是否可靠执行完成。 |
| `compliance_status` | `passed`、`failed`、`unknown` | 被评估架构是否通过规则。 |
| `comparison_status` | `valid`、`invalid` | Comparison 输入与 delta 是否可信。 |

Baseline 完全可以同时是 `execution_status: completed` 与 `compliance_status: failed`：这表示 Harness 正常运行并发现了已有违规，并不会使 E0 无效。Analyzer error 会产生 `partial` execution 和 `unknown` compliance；这种 artifact 不能作为下一任务的 pre 输入。

`harness_execution.json` 中的 Python `harness_status` 仍表示进程级状态。Node 非零退出或输出无效时，它会是 `failure`。

## 7. CLI 契约

正常使用应通过 Python runner。直接执行 Node 入口主要用于开发：

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

未知 CLI 参数会被拒绝。`--target`、`--task-config`、`--rulepack`、`--pre-commit`、`--post-commit`、`--comparison-mode` 必填。`self` 模式必须省略两个 evaluation artifact 参数。

手动评估 workspace 时使用：

```bash
python3 experiment/instruments/agent-runners/run_harness.py \
  --workspace-dir experiment/workspace/<session_id> \
  --task T2 \
  --pre-ref task-T1-done
```

只有在覆盖自动解析结果时，才成对使用 `--baseline-evaluation` 与 `--pre-evaluation`。

## 8. 输出契约

`harness_evaluation.json` 使用 schema `0.2.0`，主要包含：

- run、trajectory、task、target commits 与 profile hash；
- `comparison`：不可变的 baseline/pre artifact 引用和当前 post 标识；
- `env_snapshot`：Node、pnpm、OS、Harness commit 与 adapter 版本；
- `scopes`：统一的 subject/cross-stack 结果，包含 `scope_id`、`scope_type` 与 `scope_root`；
- `layers`：面向报告的扁平视图；
- `deltas`：局部与累计比较结果；
- 三个状态维度和结构化执行错误。

Artifact reader 与 writer 共用同一个 Ajv validator，确保“可作为输入的 artifact”与“当前输出的 artifact”遵循同一结构契约。

## 9. 开发与验证

运行 Core 单元测试和语法检查：

```bash
npm --prefix harness test
npm --prefix harness run lint
```

Comparison 测试覆盖统一 scope 解析、self 零 delta、重复 finding 多重集语义、严格 CLI 约束，以及 `Base/T0/T1/T2/T3` profile 一致性。

如需执行不会覆盖 canonical E0 的端到端 self smoke test：

```bash
python3 experiment/instruments/agent-runners/run_harness.py \
  --baseline \
  --output-dir /tmp/harness-baseline-smoke \
  --force
```

Evaluation profile 发生变化后，不要继续旧 trajectory。应重新生成 canonical baseline artifact，再创建新 session，保证 E0–E3 全部可比较。
