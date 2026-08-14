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
│   └── agent-runners/
│       ├── config.py
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

| 路径 | 功能 |
| --- | --- |
| `design/tasks/T{1,2,3}_{minimal,structured}.md` | 六个任务模板。`--task` 与 `--strategy` 共同决定本次读取的文件。 |
| `design/memory/initial_memory.md` | 记忆实验的初始内容；仅在新建 session 时使用 `--write-memory-md` 才会读取。 |
| `instruments/agent-images/` | Claude Code 与 Codex agent 的 Docker 镜像定义。 |
| `instruments/agent-runners/config.py` | agent 镜像、默认模型、认证目录、memory 文件名和容器内 CLI 命令。 |
| `instruments/agent-runners/prompt_builder.py` | 读取任务模板、去掉 HTML 注释，并追加 memory 指令和 `[TASK_COMPLETED]` 完成协议。 |
| `instruments/agent-runners/docker_runner.py` | 挂载 workspace 和认证目录、启动 agent 容器、解析 CLI 输出并写入执行记录。 |
| `instruments/agent-runners/evaluator.py` | 组装并执行 `harness/core/evaluate.mjs`，写入 Harness manifest、执行记录和评估结果。 |
| `instruments/agent-runners/run_pipeline.py` | 完整入口：准备或复用 workspace、运行 agent、提交并打 tag、调用 Harness、归档结果。 |
| `instruments/agent-runners/run_harness.py` | Harness-only 入口；可评估已有 workspace 的当前快照、指定 tag，或通过 `--baseline` 评估 baseline。 |
| `instruments/agent-runners/generate_report.py` | 可选工具：把 `harness_evaluation.json` 中的约束违规整理为 Markdown。 |
| `venv/` | 可选的本地 Python 虚拟环境；runner 当前只使用 Python 标准库。 |
| `workspace/session_<时间戳>/` | 每个实验 session 的长期工作副本和独立 Git 仓库。T1–T3 必须在同一个 session 中顺序累积。 |
| `package.json` | pnpm workspace 中 `experiment` 包的元数据及占位 test/lint 命令。 |

`experiment/` 还会读取或写入以下仓库级目录：

| 路径 | 在实验中的角色 |
| --- | --- |
| `baseline/` | 新 session 的原始代码来源，也是所有 Harness 评估的对照目录。 |
| `harness/tasks/<task>.eval.yaml` | `Base`、`T1`、`T2`、`T3` 各自启用的规则和指标。 |
| `harness/rulepacks/` | Harness 实际执行的后端、前端和跨栈规则包。 |
| `reports/experiments/<session_id>/` | pipeline 与 workspace Harness 评估的归档目录。 |
| `reports/baseline/` | baseline Harness 评估的默认输出目录。 |

Pipeline 的 baseline 路径固定为仓库根目录的 `baseline/`；`run_pipeline.py` 没有 baseline 路径覆盖参数。只有 Harness-only 入口支持通过 `--baseline-dir` 选择其他对照目录。

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
8. 使用 `harness/tasks/T1.eval.yaml` 和 `harness/rulepacks/` 评估该提交。
9. 将执行、评估和任务元数据写入 `reports/experiments/<session_id>/T1/`。

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
    └── harness_evaluation.json
```

| 产物 | 内容 |
| --- | --- |
| `session_manifest.yaml` | session 创建时间以及初始 agent、model、strategy、memory 条件。 |
| `prompt.md` | 本任务实际发送给 agent 的完整 prompt。 |
| `execution.json` | agent、模型、退出码、完成标记、耗时、token/费用字段、原始 agent 事件及 stderr。 |
| `task_manifest.yaml` | 任务起点 ref、完成 commit/tag、请求的 `--from-tag` 和 Harness 文件索引。 |
| `manifest.json` | 提供给 Harness 的任务、baseline revision 和 pre-commit 元数据。 |
| `harness_execution.json` | Harness 命令、退出码、超时状态、stdout 和 stderr。 |
| `harness_evaluation.json` | 约束、指标以及整体评估状态。`partial` 是评估结论，不等同于 Harness 进程失败。 |

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

Harness 默认从原任务目录的 `task_manifest.yaml` 读取 `start_ref` 作为 pre-commit；找不到时使用当前 `HEAD^`。只有在评估自定义快照且自动推断不正确时，才需要显式传入 `--pre-commit <git-ref>`。`--baseline-dir` 可接受绝对路径或仓库根目录相对路径，用来覆盖默认的 `baseline/` 对照目录。

### 3.4 评估 baseline

使用 `--baseline` 直接把 `baseline/` 同时作为被评估目标和对照目录。默认任务是 `Base`，规则来自 `harness/tasks/Base.eval.yaml`：

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

评估成功与否先查看 `harness_execution.json` 中的 `harness_status` 和 `exit_code`；架构规则的通过、失败或 `partial` 状态查看 `harness_evaluation.json`。
