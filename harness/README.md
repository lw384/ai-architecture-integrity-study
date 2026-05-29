# CRM Evaluation Harness

自动化评估流水线，用于衡量 CRM 后端代码的**架构合规性**与**代码质量**，输出可比较的量化报告。设计目标是在不同来源的实现（人工编写、不同 AI 模型/版本生成）之间建立统一的评分基线。

---

## 目录结构

```
harness/
├── package.json                         # ESM 项目，Node ≥ 20
├── architecture.rules.json              # 人类可读的架构约束规则（权威文档）
├── scripts/
│   ├── evaluate.mjs                     # 主入口
│   ├── dependency-cruiser.config.cjs    # 机器可读的架构约束（供 depcruise 执行）
│   ├── .eslintrc-fallback.json          # 当目标代码无 ESLint 配置时的回退规则
│   └── metrics/
│       ├── util.mjs                     # 通用工具：runCommand / countLOC / perKLOC
│       ├── architecture.mjs             # 架构指标：违规数、循环依赖、模块数、图密度
│       └── quality.mjs                  # 质量指标：ESLint / Vitest / Semgrep
└── reports/                             # 输出目录（git-ignored）
    ├── <dir-name>/
    │   ├── report.json                  # 完整 JSON 报告
    │   ├── report.md                    # Markdown 格式报告
    │   └── depcruise-raw.json           # dependency-cruiser 原始输出（供后续扩展）
    └── summary.csv                      # 所有评估的汇总表（追加写入）
```

---

## 安装与使用

### 前置要求

- Node.js ≥ 20（推荐通过 nvm 管理）
- semgrep（可选，不安装则自动跳过安全扫描）

### 安装

```bash
cd harness
nvm use 20          # 或 nvm install 20
npm install
```

### 运行评估

```bash
# 从项目根目录运行
node harness/scripts/evaluate.mjs <被评估代码目录路径>

# 示例
node harness/scripts/evaluate.mjs CRM/baseline-ai/Gemini/generation-1/backend
node harness/scripts/evaluate.mjs CRM/human/crm-backend
```

运行后在 `harness/reports/<目录名>/` 下生成三份文件，并向 `harness/reports/summary.csv` 追加一行。

---

## 输出说明

### `report.json`

```jsonc
{
  "meta": {
    "targetDir": "/absolute/path/to/backend",
    "name": "backend",          // 目录名，用作报告标识
    "timestamp": "2026-...",
    "loc": 1240                 // 有效代码行数（排除 node_modules 和隐藏目录）
  },
  "architecture": {
    "violations": 2,            // 架构规则违规次数
    "violationsPerKLOC": 1.61,
    "cycles": 0,                // 循环依赖数量
    "cyclesPerKLOC": 0,
    "moduleCount": 12,          // 模块（文件）总数
    "dependencyCount": 18,      // 依赖边总数
    "graphDensity": 0.0136      // 实际边数 / 最大可能边数
  },
  "quality": {
    "lint":     { "errors": 3, "errorsPerKLOC": 2.42, "warnings": 7, "warningsPerKLOC": 5.65 },
    "tests":    { "total": 20, "passed": 18, "failed": 2, "passRate": 90.0 },
    "security": { "findings": 1, "findingsPerKLOC": 0.81, "skipped": false }
  }
}
```

### `report.md`

同一数据的 Markdown 渲染，供人工 review。

### `depcruise-raw.json`

dependency-cruiser 的完整原始输出，包含每个模块的完整依赖图。保留此文件是为了将来无需重跑即可提取额外指标（如具体违规文件路径、模块类型分布等）。

### `summary.csv`

每次运行追加一行，列包含所有核心指标，便于用 Excel / Python / R 做横向比较。

---

## 评估逻辑

### 1. LOC 统计

递归统计目标目录下所有 `.ts / .tsx / .js / .jsx / .mjs / .cjs` 文件的行数，跳过 `node_modules` 和隐藏目录。LOC 用作所有计数类指标的归一化分母（per KLOC），消除不同实现体量差异的影响。

### 2. 架构分析（dependency-cruiser）

使用 [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) 静态分析模块间的实际 `import` 关系，对照 `dependency-cruiser.config.cjs` 中编码的分层规则，检测：

| 指标 | 含义 |
|------|------|
| `violations` | 违反架构规则的 import 数量 |
| `cycles` | 循环依赖数量（`no-circular` 规则命中次数） |
| `moduleCount` | 被分析的模块（文件）总数 |
| `dependencyCount` | 所有 import 边的总数 |
| `graphDensity` | `dependencyCount / (moduleCount × (moduleCount - 1))`，衡量模块耦合程度 |

如果目标目录下有 `tsconfig.json`，会通过 `--ts-config` 传给 depcruise 以获得更准确的 TypeScript 路径解析。

### 3. Lint（ESLint）

检测代码风格与潜在错误。配置选取策略（按优先级）：

1. 目标代码包含 `eslint.config.{js,mjs,cjs}`（ESLint v9 flat config）→ 在目标目录内运行
2. 目标代码包含 `.eslintrc.*` 或 `package.json#eslintConfig`（ESLint v8）→ 使用目标配置运行
3. 无任何配置 → 使用 harness 内置的 `.eslintrc-fallback.json` 运行（支持 JS + TypeScript）

输出 `errors`（规则违规）和 `warnings`（潜在问题）两类，均归一化为 per KLOC。

### 4. 测试（Vitest）

在**目标目录**内运行 `npx vitest run --reporter=json`，解析 JSON 输出获取：

- `total` / `passed` / `failed`：测试用例数量
- `passRate`：通过率（%）

如果目标未安装 / 配置 vitest，或无测试文件，报告为 `error: vitest unavailable or no tests found`。

### 5. 安全扫描（Semgrep，可选）

运行 `semgrep --config=auto` 对目标目录做 SAST 扫描，统计 findings 数量。若系统未安装 semgrep，自动跳过并在报告中标注 `skipped: true`，不影响其他指标。

---

## 架构约束来源

架构规则直接来自 `CRM/specs/contact-spec-v0.1.md` 中的"Architectural Rules"部分，原文约束为：

```
Allowed:  Routes → Controller → Service → Repository
Forbidden: Controller → Repository  （跳过 Service 层）
           Service → Controller     （反向依赖）
           Routes → Service         （跳过 Controller 层）
```

harness 将其扩展为以下 6 条 depcruise 规则（均为 `severity: error`）：

| 规则名 | 含义 |
|--------|------|
| `no-controller-to-repository` | Controller 不得直接 import Repository（必须经过 Service） |
| `no-controller-to-db` | Controller 不得直接访问 Entity 或 db/ 目录 |
| `no-reverse-service-to-controller` | Service 不得依赖 Controller（禁止向上依赖） |
| `no-reverse-repository-to-controller` | Repository 不得依赖 Controller |
| `no-reverse-repository-to-service` | Repository 不得依赖 Service（禁止向上依赖） |
| `no-circular` | 任意模块间不得存在循环依赖 |

规则通过文件名模式匹配层（`*.controller.ts`、`*.service.ts`、`*.repository.ts`、`*.entity.ts`），对路径命名规范有一定依赖——这与 spec 中规定的强制目录结构（`contact.controller.ts` 等）一致。

完整的人类可读规则说明见 [`architecture.rules.json`](./architecture.rules.json)。

---

## 注意事项

- **Node 版本**：dependency-cruiser v16 和 @typescript-eslint v6 要求 Node ≥ 18，建议使用 `.nvmrc` 中固定的 v20。
- **TypeScript 支持**：harness 内置 `typescript` 包，depcruise 据此分析 `.ts` 文件；若目标代码有自己的 `tsconfig.json` 会自动使用。
- **幂等性**：同一目录多次运行会覆盖 `reports/<dir-name>/` 下的文件，但 `summary.csv` 会追加新行，保留历史记录。
- **目录名冲突**：报告以目录 basename 命名（如 `backend`）。评估多个同名目录时建议先重命名或手动归档旧报告。
