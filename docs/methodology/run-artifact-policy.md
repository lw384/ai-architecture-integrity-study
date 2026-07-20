# Run Artifact Policy

## Scope

This policy defines what should be versioned from `experiment/workspace/`.

Each run directory under `experiment/workspace/<run_id>/` contains two different kinds of material:

1. Evidence artifacts that describe the run.
2. A cloned working copy of the baseline application used by the agent.

Only the evidence artifacts should be committed to Git by default.

## Commit These Files

Keep the following files for each run:

- `.agent_instruction.md`
- `agent_execution.log`
- `execution_metrics.json`
- `manifest.json`
- `evaluation.json`

These files capture the prompt, the agent-visible completion log, lightweight execution metadata, the harness manifest, and the final evaluation result.

## Do Not Commit These Files

Do not commit the cloned application tree or local runtime state from the workspace run directory:

- `backend/`
- `frontend/`
- copied project root files such as `package.json`, `docker-compose.yml`, and cloned `README.md`
- nested `.git/`
- copied `.env*` files
- dependency directories, build outputs, caches, or other transient local artifacts

These files are reproducible from the baseline commit plus the recorded run artifacts. Committing them would bloat the repository and create noisy diffs.

## If Source-Level Diffs Need To Be Preserved

Prefer one of these approaches instead of committing the full cloned workspace tree:

- record `git diff --stat` in a summary artifact
- record a patch file such as `workspace.patch`
- promote a curated run bundle into `experiment/runs/` with a separate retention rule

## Operational Guidance

Use `experiment/workspace/` as a staging area for active and recent runs.

Use Git to retain:

- prompts
- logs
- metrics
- manifests
- evaluation outputs

Do not use Git to retain:

- full per-run application copies
- nested repositories
- local environment snapshots

If a run becomes important enough to preserve beyond lightweight evidence, move or transform it into a curated artifact under `experiment/runs/` rather than committing the entire workspace clone as-is.
