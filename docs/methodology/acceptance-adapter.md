# Versioned acceptance adapter

## Method rule

Acceptance tests are decoupled from agent-produced snapshots by one versioned,
condition-invariant adapter under `experiment/instruments/tests/_adapter/`. The
adapter may absorb only transport-equivalent variation: route spelling,
singular/plural forms, response envelopes, mechanically equivalent field names,
successful 2xx mutation status codes, and accessible UI action wording. All
tests assert the same postconditions after normalization.

The adapter must not change state-transition matrices, relationship cardinality,
validation rules, persistence/read-back checks, atomicity checks, or any other
behavioural requirement. A candidate route/field/control that cannot be resolved
is recorded in `adapter.unresolved` and remains a failing observation. New aliases
require an explicit semantic justification; session- or condition-specific
mappings are prohibited.

Suggested paper wording:

> Functional acceptance used a versioned interface adapter to decouple a single
> behavioural test suite from implementation-specific route, field, response-
> envelope, and accessible-label naming. The mapping policy was identical for
> all experimental conditions and did not alter behavioural assertions or
> state-transition rules. Every resolution and unresolved target was retained
> in the run artifact.

## Historical failure audit (pre-v2 evidence)

This table classifies the acceptance failures present in the archived
`test_execution.json` files before v2. It is diagnostic evidence only: the
historical JSON files are not rewritten, and no row is retroactively changed to
pass without executing the v2 suite against the immutable task snapshot.

| Archived result | Failed assertions | Evidence | Pre-v2 classification | v2 treatment |
| --- | ---: | --- | --- | --- |
| `session_20260817_210911/T1` | 1 | update persisted through an endpoint returning `201` while the test required exactly `200` | status/contract variance | accept any 2xx, then GET and assert the stored stage |
| `session_20260817_221755/T1` | 1 | same `expected 200, got 201` evidence | status/contract variance | same semantic read-back assertion |
| `session_20260817_130253/T2` frontend | 3 | render crashed in `getColors` because `theme.vars.palette` was unavailable in the test wrapper | test-harness context | render through the required layout/theme providers; still fail on a real page crash |
| `session_20260817_130253/T2` frontend | 1 | Testing Library could not find the expected Contact option | selector/data-flow unresolved | use shared accessible action queries; if the semantic Contact control/option remains absent, record unresolved/fail rather than inventing a session mapping |

The T2 backend suite passed all 26 assertions in the same archived run. That
supports treating the three theme-stack traces as frontend harness-context
failures, but it does not prove the fourth UI workflow correct.

## Result selection and provenance

The original pipeline result stays at `<task>/test_result.json`. Acceptance-only
reruns are stored at `<task>/acceptance_runs/<run_id>/`. Each v2 artifact records
`run_id`, timestamps, `adapter_version`, resolved routes, mappings used,
unresolved targets, and conservative failure classifications. Analysis chooses
the newest run from the highest adapter version and writes the chosen source
path into `task_completion.csv`; raw older results remain available for audit.
