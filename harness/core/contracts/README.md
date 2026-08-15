# Contracts

This directory contains the JSON schemas that define the harness data contracts.

## Files

### task_config.schema.json

Defines the input shape for one evaluation task.

Version 0.2 is the only supported task contract; the former separate `subjects` and `cross_stack` fields are not accepted.

Main sections:
- `schema_version`: version of the task document format.
- `task_id`, `task_version`: task identity.
- `evaluation_scopes`: ordered subject and cross-stack evaluation units.
- `judgment_config`: shared LLM judgment settings.
- `execution`: runtime controls such as fail-fast and parallel mode.
- `metadata`: optional audit fields.

Each scope includes:
- `scope_id`: stable name of the evaluation unit.
- `scope_type`: `subject` or `cross-stack`; it must match the rulepack `kind`.
- `root_path`: workspace-relative target path; use `.` for the whole workspace.
- `rulepack_id`, `rulepack_version`: selected rulepack.
- `enabled`: rule IDs to run for constraints, metrics, and judgments.
- `thresholds`: metric limits keyed by rule ID.
- `expected_diff_scope`: allowed file globs.

Use this schema to validate task files in `tasks/` before orchestration starts.

### rulepack.schema.json

Defines the manifest shape for one rulepack.

Main sections:
- `rulepack_id`, `version`: rulepack identity.
- `kind`: `subject` or `cross-stack`.
- `language`, `frameworks`: scope metadata.
- `adapters`: shared adapter declarations used by the rulepack.
- `rules_matrix`: concern-based rule grouping.
- `rules`: optional direct layer-to-rule mapping.
- `extends`: optional parent rulepack.
- `metadata`: optional descriptive fields.

Each adapter declaration includes:
- `source`: shared adapter location or logical ID.
- `config`: rulepack-relative config path.
- `version`: optional adapter contract version.
- `emits`: harness layers produced by the adapter.
- `options`: free-form adapter options.

Use this schema to validate each `rulepacks/*/manifest.yaml` after YAML parsing.

Rule file naming:
- Format: `<SUBJECT>-<CONCERN>-<LAYER>-<ID>-<slug>.yaml`
- `SUBJECT`: `BE`, `FE`, or `CROSS`
- `CONCERN`: the directory name under `rules/`
- `LAYER`: `C`, `M`, or `J`
- `ID`: three digits such as `001`
- Example: `rules/dependencies/BE-dependencies-C-001-controller-to-repo.yaml`

Layer meaning:
- `C`: constraints
- `M`: metrics
- `J`: judgments

The harness no longer uses tier metadata in rulepack manifests. Layer intent comes from rule grouping and file naming.

### evaluation.schema.json

Defines the output shape written by the harness.

Main sections:
- `schema_version`, `evaluation_profile_hash`, `run_id`, `trajectory_id`, `task_id`, `rulepack_id`: run identity and comparison compatibility.
- `target`: evaluated workspace and commit context.
- `comparison`: baseline, pre, and post artifact identities.
- `env_snapshot`: runtime environment and tool versions.
- `layers`: constraints, metrics, and judgments outputs.
- `scopes`: uniform detailed results for every configured evaluation scope.
- `deltas`: finding-aware run-local and cumulative comparisons.
- `execution_status`, `comparison_status`: execution reliability and comparison validity.
- Constraint acceptance is not stored as a third status. Consumers derive it from `deltas.run_local.constraints.introduced_count` after confirming execution completed.
- `duration_ms`, `errors`: execution summary.

Version 0.3 is the only supported evaluation contract. Use this schema to validate both comparison inputs and final output before publishing or aggregation.

## Typical Flow

1. Load a task config file and validate it with `task_config.schema.json`.
2. Load each rulepack manifest and validate it with `rulepack.schema.json`.
3. Run the harness.
4. Validate the final evaluation artifact with `evaluation.schema.json`.

## Notes

- These schemas define contract shape, not execution logic.
- Keep IDs stable. Runners and aggregators depend on them.
- Prefer adding new optional fields before changing required ones.
