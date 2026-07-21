# Experiment Directory Structure

## 目录结构说明

```
experiment/
├── workspace/
│   └── run_claude_T0_minimal_20260721_150000/  # 代码工作区
│       ├── backend/                            # Agent 修改后的代码副本
│       ├── frontend/                           # Agent 修改后的代码副本
│       ├── agent_execution.log                 # Agent 容器执行日志
│       ├── execution_metrics.json              # 执行指标（Token 数、状态等）
│       └── .git/                               # Git 历史（用于 diff 追踪）
│
└── reports/
    └── run_claude_T0_minimal_20260721_150000/  # 评估产物目录
        ├── evaluation.json                     # Harness 评估完整结果
        ├── manifest.json                       # 实验元数据（commit SHA、task ID 等）
        └── violations_report.md                # 前后端违规汇总报告
```

## 文件分配原则

### Workspace 目录（`experiment/workspace/run_xxx/`）
存放 **Agent 执行阶段** 的产物：

| 文件 | 生成阶段 | 说明 |
|------|---------|------|
| `backend/`, `frontend/` | Docker 容器执行 | Agent 修改后的代码副本 |
| `agent_execution.log` | Docker 容器执行 | 完整的 stdout/stderr 日志 |
| `execution_metrics.json` | Docker 执行完成后 | Token 数、执行状态等 |
| `.git/` | 初始化 | Git 追踪用，便于与 baseline 对比 diff |

### Reports 目录（`experiment/reports/run_xxx/`）
存放 **Harness 评估阶段** 的产物：

| 文件 | 生成阶段 | 说明 |
|------|---------|------|
| `evaluation.json` | Harness 评估完成 | 结构化的评估结果（约束、指标、判断等） |
| `manifest.json` | Harness 评估前 | 实验元数据（baseline commit、pre/post commit、task ID 等） |
| `violations_report.md` | 报告生成 | 从 evaluation.json 提取的表格化违规汇总 |

## 工作流程

```
1️⃣  setup_and_run_agent()
    └─> 克隆 baseline 到 workspace/run_xxx/
    └─> 在容器中执行 Agent
    └─> 产出: agent_execution.log, execution_metrics.json

2️⃣  run_harness_evaluation()
    └─> 读取 workspace/run_xxx/ 的代码
    └─> 写入 reports/run_xxx/manifest.json
    └─> 执行 harness/core/evaluate.mjs
    └─> 产出: reports/run_xxx/evaluation.json

3️⃣  生成报告（可选）
    └─> python3 generate_report.py --evaluation reports/run_xxx/evaluation.json
    └─> 产出: reports/run_xxx/violations_report.md
```

## 使用示例

### 查看 Agent 执行日志
```bash
cat experiment/workspace/run_claude_T0_minimal_20260721_150000/agent_execution.log
```

### 查看完整评估结果
```bash
cat experiment/reports/run_claude_T0_minimal_20260721_150000/evaluation.json | jq
```

### 生成前后端违规汇总报告
```bash
cd experiment/instruments/agent-runners
python3 generate_report.py --evaluation \
  /path/to/ai-architecture-integrity-study/experiment/reports/run_claude_T0_minimal_20260721_150000/evaluation.json
```

### 比对代码变化
```bash
# 查看 workspace 中 Agent 修改的代码
cd experiment/workspace/run_claude_T0_minimal_20260721_150000
git diff  # Agent baseline vs. 修改后的代码
```

## 为什么分离？

- **清晰职责**：workspace = Agent 工作，reports = 评估产物
- **保留上下文**：workspace 保留代码和完整日志便于调试，reports 存储结构化评估数据便于分析
- **易于清理**：新实验时只需清理旧的 workspace/reports，无需维护混合目录
- **便于扩展**：后续可在 reports 中添加多种分析报告（对比、趋势等），不干扰代码
