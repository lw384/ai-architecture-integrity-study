.PHONY: help install test lint eval eval-baseline analyze figures smoke clean

help:  ## List all available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install:  ## Install all dependencies (JS/TS and Python)
	pnpm install
	@if [ -f experiment/requirements.txt ]; then \
	  cd experiment && python -m venv venv && ./venv/bin/pip install -r requirements.txt; \
	fi

test:  ## Run all tests
	pnpm test

test-baseline:  ## Test the baseline only
	pnpm test:baseline

test-harness:  ## Test the harness only
	pnpm test:harness

lint:  ## Run all linters
	pnpm lint

eval-baseline:  ## Run the baseline evaluation and write it to reports/baseline
	python3 experiment/instruments/agent-runners/run_harness.py --baseline

analyze:  ## Run the Python analysis script
	@if [ -d experiment/venv ]; then \
	  cd experiment && ./venv/bin/python scripts/analyze.py; \
	else \
	  echo "Python venv not found. Run 'make install' first."; \
	fi

figures:  ## Generate dissertation figures
	@if [ -d experiment/venv ]; then \
	  cd experiment && ./venv/bin/python scripts/generate_figures.py; \
	fi

smoke:  ## Run the end-to-end smoke test after changes
	@echo "→ Installing dependencies..."
	@make install
	@echo "→ Running tests..."
	@make test
	@echo "→ Running harness evaluation..."
	@make eval
	@echo "✓ Smoke test passed"

clean:  ## Remove all generated artifacts
	find . -name node_modules -type d -prune -exec rm -rf {} \; 2>/dev/null || true
	find . -name __pycache__ -type d -prune -exec rm -rf {} \; 2>/dev/null || true
	find . -name dist -type d -prune -exec rm -rf {} \; 2>/dev/null || true
	rm -rf reports
	rm -rf harness/reports
