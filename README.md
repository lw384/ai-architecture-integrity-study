# AI Architecture Integrity Study

This repository explores how reliably AI systems can generate production-grade software that adheres to strict architectural constraints. We focus on a CRM Contact module and compare AI-generated outputs with human-built references across multiple experiment cycles.

## Repository Map

- `CRM/specs/` — Authoritative architecture specifications such as contact-spec-v0.1.
- `CRM/baseline-ai/` — Raw generations grouped by model (currently Gemini) and run metadata.
- `CRM/human/` — Manually engineered reference solutions used as the control group.
- `experiments/` — Python tooling, prompts, and notebooks for orchestrating and analyzing runs.
- `experiments/scripts/` — Automation helpers (for example `generate-gemini.py`).

## Getting Started

1. Clone the repo and create a Python virtual environment (3.10+ recommended).
2. Install experiment dependencies: `pip install -r experiments/requirements.txt` (extend this file as tooling evolves).
3. Review the latest spec under `CRM/specs/` to understand the architectural rules and APIs.
4. Run generation scripts, e.g. `python experiments/scripts/generate-gemini.py`, to reproduce the current AI baseline.

## Workflow

1. **Spec Authoring** — Define or update strict architecture documents in `CRM/specs/`.
2. **AI Generation** — Execute scripts in `experiments/scripts/` to create candidate implementations in `CRM/baseline-ai/`.
3. **Human Benchmark** — Update the matching implementation in `CRM/human/` for comparison.
4. **Integrity Review** — Audit AI output versus the spec and the human reference, logging violations (layering, validation, auth, data rules).
5. **Iteration** — Feed discoveries back into prompts, scripts, and specs to improve the next cycle.

## Contributing

- Keep commits scoped to a single spec update or experiment cycle when possible.
- Document every AI run under `CRM/baseline-ai/.../metadata` with the prompt, configuration, and timestamp.
- Update `experiments/requirements.txt` whenever dependencies change, and mention significant workflow updates in this README.
- Open an issue for new specs or evaluation ideas so we can track them across experiment cycles.

## License
