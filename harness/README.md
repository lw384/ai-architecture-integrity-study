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
├── core/
│   ├── evaluate.mjs
│   ├── layers/
│   ├── contracts/
│   └── aggregators/
├── adapters/
│   ├── dep-cruiser/
│   ├── eslint/
│   └── computed-metrics/
│       └── implementations/
├── rulepacks/
│   ├── ts-nestjs-backend/
│   │   ├── manifest.yaml
│   │   ├── tool-configs/
│   │   ├── rules/
│   │   └── fixtures/
│   └── cross/
└── tasks/
    └── T1.eval.yaml
