.PHONY: help install test lint eval analyze figures smoke clean

help:  ## 列出所有可用命令
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install:  ## 安装所有依赖(JS/TS 与 Python)
	pnpm install
	@if [ -f experiment/requirements.txt ]; then \
	  cd experiment && python -m venv venv && ./venv/bin/pip install -r requirements.txt; \
	fi

test:  ## 运行所有测试
	pnpm test

test-baseline:  ## 只测 baseline
	pnpm test:baseline

test-harness:  ## 只测 harness
	pnpm test:harness

lint:  ## 运行所有 lint
	pnpm lint

eval:  ## 用 harness 评估 baseline,产出 harness/reports/
	pnpm eval -- --target baseline/backend

analyze:  ## 运行 Python 分析脚本
	@if [ -d experiment/venv ]; then \
	  cd experiment && ./venv/bin/python scripts/analyze.py; \
	else \
	  echo "Python venv not found. Run 'make install' first."; \
	fi

figures:  ## 生成 dissertation figures
	@if [ -d experiment/venv ]; then \
	  cd experiment && ./venv/bin/python scripts/generate_figures.py; \
	fi

smoke:  ## 端到端 smoke test(改造后验证)
	@echo "→ Installing dependencies..."
	@make install
	@echo "→ Running tests..."
	@make test
	@echo "→ Running harness evaluation..."
	@make eval
	@echo "✓ Smoke test passed"

clean:  ## 清理所有生成物
	find . -name node_modules -type d -prune -exec rm -rf {} \; 2>/dev/null || true
	find . -name __pycache__ -type d -prune -exec rm -rf {} \; 2>/dev/null || true
	find . -name dist -type d -prune -exec rm -rf {} \; 2>/dev/null || true
	rm -rf harness/reports
