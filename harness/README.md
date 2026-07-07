# Harness

Static analysis + evaluation pipeline for NestJS/React codebases.

## Metrics collected

- Architectural violations (dependency-cruiser)
- Test pass rate (Vitest)
- Code quality (ESLint)
- Security findings (Semgrep, optional; requires system install)

## Usage

```bash
# From workspace root:
pnpm --filter harness eval -- --target baseline/backend

# Or via Makefile:
make eval
```

## Independence

This package does not import from `baseline/` or `experiment/`.
It can evaluate any NestJS project matching the expected layering.


harness/
├── core/                              ← 语言无关的编排层
│   ├── evaluate.mjs                   ← CLI 入口
│   ├── layers/
│   │   ├── constraints_runner.mjs    ← 跑硬约束的通用接口
│   │   ├── metrics_runner.mjs        ← 跑连续度量的通用接口
│   │   └── judgments_runner.mjs      ← 跑 LLM judge 的通用接口
│   ├── contracts/
│   │   ├── evaluation.schema.json
│   │   └── rulepack.schema.json      ← rulepack 必须遵守的契约
│   └── aggregators/                   ← 跨度量的聚合逻辑
│
├── rulepacks/                         ← 语言/技术栈相关的规则包
│   ├── js-ts-react/                   ← 你现在的默认包
│   │   ├── manifest.json              ← 声明这个包提供哪些规则
│   │   ├── constraints/
│   │   │   ├── layer-boundaries.eslint.json
│   │   │   ├── dep-cruiser-rules.js
│   │   │   └── architecture.rules.json
│   │   ├── metrics/
│   │   │   ├── modularity.mjs         ← 调用具体工具生成度量
│   │   │   └── coupling.mjs
│   │   └── judgments/
│   │       └── readability_rubric.md  ← LLM judge 用的 rubric
│   │
│   ├── python-django/                 ← 未来扩展
│   │   └── ...
│   │
│   └── java-spring/                   ← 未来扩展
│       └── ...
│
└── tasks/
    ├── T1.eval.json                   ← 声明: 用哪个 rulepack、跑哪些规则
    └── T2.eval.json
