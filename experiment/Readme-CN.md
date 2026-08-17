# Experiment

[English version](./Readme-EN.md)

本目录负责按顺序执行 T1–T3 agent 任务、保存每个实验 session 的独立工作区，并调用 Harness 评估任务结果。以下命令均假设当前目录是仓库根目录。

## 1. `experiment/` 的结构与功能

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
│   ├── agent-runners/
│   │   ├── config.py
│   │   ├── comparison_resolver.py
│   │   ├── docker_runner.py
│   │   ├── evaluator.py
│   │   ├── generate_report.py
│   │   ├── prompt_builder.py
│   │   ├── run_harness.py
│   │   ├── run_pipeline.py
│   │   ├── run_tests.py
│   │   └── test_runner.py
│   └── tests/
│       └── T1/
│           ├── deal.e2e-spec.ts
│           ├── deal.render.test.jsx
│           └── test.config.json
├── venv/
├── workspace/
└── package.json
```

| 路径 | 功能 |
| --- | --- |
| `design/tasks/T{1,2,3}_{minimal,structured}.md` | 六个任务模板。`--task` 与 `--strategy` 共同决定本次读取的文件。 |
| `design/memory/initial_memory.md` | 记忆实验的初始内容；仅在新建 session 时使用 `--write-memory-md` 才会读取。 |
| `instruments/agent-images/` | Claude Code 与 Codex agent 的 Docker 镜像定义。 |
| `instruments/agent-runners/config.py` | agent 镜像、默认模型、认证目录、memory 文件名和容器内 CLI 命令。 |
| `instruments/agent-runners/comparison_resolver.py` | 解析 canonical E0，并按不可变 commit SHA 定位唯一的任务前评估。 |
| `instruments/agent-runners/prompt_builder.py` | 读取任务模板、去掉 HTML 注释，并追加 memory 指令和 `[TASK_COMPLETED]` 完成协议。 |
| `instruments/agent-runners/docker_runner.py` | 挂载 workspace 和认证目录、启动 agent 容器、解析 CLI 输出并写入执行记录。 |
| `instruments/agent-runners/evaluator.py` | 组装并执行 `harness/core/evaluate.mjs`，写入 Harness manifest、执行记录和评估结果。测的是**架构完整性**（约束/指标），不判断功能对不对。 |
| `instruments/agent-runners/test_runner.py` | 按 task_id 定位 `instruments/tests/<task_id>/` 下的功能验收套件（若存在），overlay 进 workspace 的一份 throwaway 副本后运行，写入归一化的验收结果。测的是**功能正确性**，agent 全程看不到这套测试。 |
| `instruments/tests/<task_id>/` | 每个任务的功能验收套件源码（e2e/组件测试 + `test.config.json`），不进 `baseline/`、也不常驻 workspace——只有 test_runner.py 会读它。 |
| `instruments/agent-runners/run_pipeline.py` | 完整入口：准备或复用 workspace、运行 agent、提交并打 tag、调用 Harness 与功能验收、归档结果。 |
| `instruments/agent-runners/run_harness.py` | Harness-only 入口；可评估已有 workspace 的当前快照、指定 tag，或通过 `--baseline` 评估 baseline。 |
| `instruments/agent-runners/run_tests.py` | 验收测试专用入口，和 `run_harness.py` 是同一种关系（`test_runner.py` 放可复用逻辑，这个文件只是 CLI 包装）；对已有 workspace 单独重跑某个 task 的功能验收，不碰 agent、不碰 Harness、不动 Git tag。 |
| `instruments/agent-runners/generate_report.py` | 可选工具：把 `harness_evaluation.json` 中的约束违规整理为 Markdown。 |
| `venv/` | 可选的本地 Python 虚拟环境；runner 当前只使用 Python 标准库。 |
| `workspace/session_<时间戳>/` | 每个实验 session 的长期工作副本和独立 Git 仓库。T1–T3 必须在同一个 session 中顺序累积。 |
| `package.json` | pnpm workspace 中 `experiment` 包的元数据及占位 test/lint 命令。 |

`experiment/` 还会读取或写入以下仓库级目录：

| 路径 | 在实验中的角色 |
| --- | --- |
| `baseline/` | 新 session 的原始代码来源，也是各 evaluation scope metric 的 baseline。 |
| `harness/tasks/<task>.eval.yaml` | `Base`、`T1`、`T2`、`T3` 的统一 `evaluation_scopes` 及其启用规则和指标。 |
| `harness/rulepacks/` | Harness 实际执行的后端、前端和跨栈规则包。 |
| `reports/experiments/<session_id>/` | pipeline 与 workspace Harness 评估的归档目录。 |
| `reports/baseline/` | baseline Harness 评估的默认输出目录。 |

Pipeline 的源 baseline 路径固定为 `baseline/`。Comparison 数据来自 E0 和之前的任务 artifact；Harness-only 的 `--baseline-dir` 可覆盖 scope metric 使用的源目录。

## 2. Pipeline 的运行流程、输入与产物

### 2.1 新建 session 与执行 T1

不传 `--from-workspace` 时，pipeline 会：

1. 从 `baseline/` 复制代码到 `experiment/workspace/session_<时间戳>/`，复制时排除原仓库的 `.git`。
2. 在 workspace 内初始化独立 Git 仓库，提交初始快照并创建 `baseline` tag。
3. 如果传入 `--write-memory-md`，读取 `experiment/design/memory/initial_memory.md`，在 workspace 根目录创建 `CLAUDE.md` 或 `AGENTS.md`，再次提交并创建 `baseline-with-memory` tag。
4. 根据 `--task T1 --strategy <minimal|structured>` 读取 `experiment/design/tasks/T1_<strategy>.md`。
5. 生成最终 prompt；运行期间临时写入 workspace 根目录的 `.agent_instruction.md`，同时将完整 prompt 归档为 `reports/experiments/<session_id>/T1/prompt.md`。
6. Docker 容器挂载该 workspace 和对应 agent 的认证目录，agent 直接修改 workspace。只有进程成功且最终输出包含 `[TASK_COMPLETED]`，本次 agent 执行才被视为成功。
7. 把 agent 的全部改动提交为 `task: T1 completed`，并创建 `task-T1-done` tag。
8. 使用 `harness/tasks/T1.eval.yaml` 和 `harness/rulepacks/` 评估该提交（架构完整性）。
9. 若 `experiment/instruments/tests/T1/` 下存在验收套件，overlay 进 workspace 的一份 throwaway 副本并运行（功能正确性）；没有套件则记为 `skipped`，不算失败。
10. 将执行、评估、验收结果和任务元数据写入 `reports/experiments/<session_id>/T1/`。

### 2.2 复用 session 执行 T2 和 T3

T2 和 T3 通过 `--from-workspace` 复用 T1 创建的同一 workspace。建议总是显式指定 `--from-tag`：

```text
baseline → task-T1-done → task-T2-done → task-T3-done
```

- T2 从 `task-T1-done` 开始，读取 `T2_<strategy>.md`，完成后创建 `task-T2-done`。
- T3 从 `task-T2-done` 开始，读取 `T3_<strategy>.md`，完成后创建 `task-T3-done`。
- 每个任务成功后都会立即运行对应的 `harness/tasks/Tn.eval.yaml`。
- 同一实验条件内应保持 `--agent`、`--model`、`--strategy` 和 memory 设置一致；pipeline 不会自动阻止中途更换实验条件。

### 2.3 每个 session 的产物

```text
experiment/workspace/<session_id>/
└── 独立 Git 工作区
    ├── tag: baseline
    ├── tag: baseline-with-memory       # 仅 memory 实验
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
    ├── harness_evaluation.json
    ├── test_execution.json
    └── test_result.json
```

| 产物 | 内容 |
| --- | --- |
| `session_manifest.yaml` | session 创建时间以及初始 agent、model、strategy、memory 条件。 |
| `prompt.md` | 本任务实际发送给 agent 的完整 prompt。 |
| `execution.json` | agent、模型、退出码、完成标记、耗时、token/费用字段、原始 agent 事件及 stderr。 |
| `task_manifest.yaml` | 任务起点 ref/SHA、完成 commit/tag、comparison artifact 引用、Harness 文件索引，以及 `test_status`/`test_result_file`/`test_execution_file`（功能验收）。 |
| `manifest.json` | 提供给 Harness 的任务、revision、comparison 模式和已解析 comparison 输入。 |
| `harness_execution.json` | Harness 命令、退出码、超时状态、stdout 和 stderr。 |
| `harness_evaluation.json` | 统一的 `scopes[]` 结果、局部/累计 delta、artifact 标识以及 execution/comparison 状态。Constraint 结果由局部 introduced findings 派生。测的是**架构完整性**。 |
| `test_execution.json` | 功能验收套件每个 suite（backend/frontend）的安装与测试命令、退出码、stdout/stderr、耗时。任务没有定义验收套件时不生成此文件。 |
| `test_result.json` | 归一化后的验收结果：`status`（`pass`/`fail`/`error`/`skipped`）+ 每个 suite 的 `total`/`passed`/`failed`/`failed_ids`。`error` 指验收基础设施本身没跑起来（如测试库连不上），`fail` 指验收测试正常跑完但功能有问题——这是有效的实验结果，不是流水线故障。测的是**功能正确性**，与 `harness_evaluation.json` 互不替代。 |

如果 agent 或 Harness 中途失败，已有的 workspace 和任务目录会保留以便诊断。再次写入同一任务归档或覆盖同名 `task-Tn-done` tag 时，必须显式传入 `--force`。

## 3. Step-by-step 运行说明

### 3.1 一次性准备

需要 Python 3.10+、Git、Node.js、pnpm 和正在运行的 Docker daemon。先安装 Harness 所需的 Node.js 依赖：

```bash
pnpm install
```

确保 Git 已配置提交身份，因为 pipeline 会在每个 workspace 中自动提交：

```bash
git config user.name
git config user.email
```

根据要使用的 agent 构建镜像；只需构建实际使用的一种：

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

运行前还必须准备有效的 CLI 认证状态：

- Claude 使用主机的 `~/.claude_agent_home/`，该目录会挂载为容器的 `/home/codex_agent`。
- Codex 使用主机的 `~/.codex-docker-api-home/`，该目录会挂载为容器的 `/home/codex_agent/.codex`。

当前 runner 不会自动读取 `experiment/.env`。认证必须存在于上述挂载目录；需要覆盖默认模型时，在每个任务命令中一致地增加 `--model <model-id>`。

### 3.2 顺序运行 T1、T2、T3

开始新 trajectory 前，先执行 `python3 experiment/instruments/agent-runners/run_harness.py --baseline --force` 生成当前 v0.2 E0。Pipeline 会在启动 agent 前拒绝缺失、未完成或旧 schema 的 baseline artifact。

下面以 Claude、`structured`、不启用 memory 的单个实验 session 为例。若实验条件是 `minimal`，三个命令都改为 `--strategy minimal`；若使用 Codex，三个命令都改为 `--agent codex`。

第一步，运行 T1。此命令会新建 session：

```bash
python3 experiment/instruments/agent-runners/run_pipeline.py \
  --agent claude \
  --strategy structured \
  --task T1
```

如果这是 memory 实验，只在新建 session 的 T1 命令中增加 `--write-memory-md`：

```bash
python3 experiment/instruments/agent-runners/run_pipeline.py \
  --agent claude \
  --strategy structured \
  --task T1 \
  --write-memory-md
```

T1 成功后，在没有并行创建其他 session 的前提下，用目录名中的时间戳取得刚创建的 workspace：

```bash
export WORKSPACE="$(find "$PWD/experiment/workspace" \
  -mindepth 1 \
  -maxdepth 1 \
  -type d \
  -name 'session_*' \
  -print | sort | tail -n 1)"
export SESSION_ID="$(basename "$WORKSPACE")"
```

如果有多个 pipeline 并行运行，应从本次 T1 的终端输出确认 session ID，并手动把 `WORKSPACE` 设置为对应目录，不能直接选择最新目录。

确认 T1 tag 和归档已生成：

```bash
git -C "$WORKSPACE" rev-parse --verify task-T1-done
test -f "reports/experiments/$SESSION_ID/T1/harness_evaluation.json"
```

第二步，在同一 workspace 中从 T1 完成点运行 T2：

```bash
python3 experiment/instruments/agent-runners/run_pipeline.py \
  --agent claude \
  --strategy structured \
  --task T2 \
  --from-workspace "$WORKSPACE" \
  --from-tag task-T1-done
```

确认 T2 完成：

```bash
git -C "$WORKSPACE" rev-parse --verify task-T2-done
test -f "reports/experiments/$SESSION_ID/T2/harness_evaluation.json"
```

第三步，在同一 workspace 中从 T2 完成点运行 T3：

```bash
python3 experiment/instruments/agent-runners/run_pipeline.py \
  --agent claude \
  --strategy structured \
  --task T3 \
  --from-workspace "$WORKSPACE" \
  --from-tag task-T2-done
```

确认完整任务链和三份评估结果：

```bash
git -C "$WORKSPACE" tag --list
test -f "reports/experiments/$SESSION_ID/T1/harness_evaluation.json"
test -f "reports/experiments/$SESSION_ID/T2/harness_evaluation.json"
test -f "reports/experiments/$SESSION_ID/T3/harness_evaluation.json"
```

需要覆盖失败后残留的同一任务归档或重跑已有 task tag 时，在对应的 pipeline 命令末尾增加 `--force`。它会允许覆盖该任务的归档文件并重建同名 tag；使用前应先确认目标 session 和 task。

### 3.3 单独运行 Harness

Harness-only 不运行 agent，也不会创建任务提交；它评估 workspace 当前工作树或指定 tag。以下命令评估当前位于 `task-T3-done` 的 session，并把结果写入独立目录，避免覆盖 pipeline 原始产物：

```bash
python3 experiment/instruments/agent-runners/run_harness.py \
  --run-id "$SESSION_ID" \
  --task T3 \
  --output-dir "reports/experiments/$SESSION_ID/T3/harness_rerun"
```

也可以通过 workspace 绝对路径评估历史快照。例如单独重评 T1：

```bash
python3 experiment/instruments/agent-runners/run_harness.py \
  --workspace-dir "$WORKSPACE" \
  --task T1 \
  --from-tag task-T1-done \
  --output-dir "reports/experiments/$SESSION_ID/T1/harness_rerun"
```

`--from-tag` 要求 workspace 没有未提交或未跟踪改动，并会把 workspace 切换到该 tag 的 detached HEAD。它选择被评估的代码快照，`--task` 选择 Harness 规则；两者必须对应。若不传 `--from-tag`，但当前 HEAD 与已有的 `task-<task>-done` 不一致，命令会拒绝运行，除非显式使用 `--allow-task-ref-mismatch`。

默认输出目录是 `reports/experiments/<session_id>/<task>/`。如果其中已经有 Harness 产物，必须选择新的 `--output-dir`，或使用 `--force` 仅替换该目录中的 `manifest.json`、`harness_execution.json` 和 `harness_evaluation.json`。

Harness 默认从原 task manifest 读取 `start_ref`，解析为完整 SHA，再选择 `target.post_commit` 与该 SHA 一致的唯一 pre artifact；无 ref 时使用 `HEAD^`。只有自动推断错误时才传入 `--pre-ref <git-ref>`。显式覆盖 artifact 时，`--baseline-evaluation` 与 `--pre-evaluation` 必须成对使用。`--baseline-dir` 只改变 metric runner 使用的源 baseline。

### 3.4 单独运行功能验收测试

`run_tests.py` 和 `run_harness.py` 是同一种模式：不运行 agent，不需要 pre/post 比较，只对指定 workspace 单独重跑 `experiment/instruments/tests/<task>/` 下的验收套件。用法和 `--from-tag` 语义与 `run_harness.py` 完全一致：

```bash
python3 experiment/instruments/agent-runners/run_tests.py \
  --run-id "$SESSION_ID" \
  --task T3 \
  --output-dir "reports/experiments/$SESSION_ID/T3/test_rerun"
```

```bash
python3 experiment/instruments/agent-runners/run_tests.py \
  --workspace-dir "$WORKSPACE" \
  --task T1 \
  --from-tag task-T1-done \
  --output-dir "reports/experiments/$SESSION_ID/T1/test_rerun"
```

默认输出目录同样是 `reports/experiments/<session_id>/<task>/`；已有 `test_execution.json`/`test_result.json` 时需要 `--output-dir` 或 `--force`。任务在 `experiment/instruments/tests/` 下没有定义验收套件时，命令会正常退出并写入 `status: "skipped"`，不算错误。只有验收基础设施本身跑不起来（比如测试数据库连不上）才会以非零退出码失败——套件正常跑完但发现功能问题（`status: "fail"`）会照常打印结果，退出码为 0，因为这是有效的实验结果而不是命令执行故障。

### 3.5 评估 baseline

使用 `--baseline` 以 self-comparison 模式评估 `baseline/`。默认任务是 `Base`，规则来自 `harness/tasks/Base.eval.yaml`：

```bash
python3 experiment/instruments/agent-runners/run_harness.py --baseline
```

默认产物为：

```text
reports/baseline/manifest.json
reports/baseline/harness_execution.json
reports/baseline/harness_evaluation.json
```

已有默认产物时，推荐写入一个新的目录以保留原结果：

```bash
python3 experiment/instruments/agent-runners/run_harness.py \
  --baseline \
  --output-dir reports/baseline-runs/run-01
```

如果确认要替换 `reports/baseline/` 中已有的三份 Harness 文件：

```bash
python3 experiment/instruments/agent-runners/run_harness.py \
  --baseline \
  --force
```

进程成功与否查看 `harness_execution.json` 中的 `harness_status` 和 `exit_code`；在 `harness_evaluation.json` 中查看 `execution_status` 和 `comparison_status`。当 execution completed 时，`deltas.run_local.constraints.introduced_count == 0` 表示本次 Constraint 评估通过，大于 `0` 表示未通过。
