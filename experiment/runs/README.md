# Runs

## Structure

- `canonical/` — Runs referenced in the dissertation. Immutable after creation. Backed up externally.
- `pilot/` — Exploratory runs during setup, prompt iteration, and debugging. May be pruned after 6 months.

## Naming convention

`<date>__<agent-name-version>__<task>__<prompt-variant>__run<N>__seed<S>`

Example: `2026-08-01__claude-code-1.7__T1__minimal__run1__seed42`

## Index

`index.csv` is the authoritative index of all runs; maintained by `instruments/bundle-creator.py`.

## Reproducibility

Each run directory contains a `manifest.json` recording:
- baseline commit SHA at time of run
- harness commit SHA at time of run
- prompt file SHA-256
- environment (Node/Python versions, OS)

See `docs/methodology/run-bundle-spec.md` for the full specification.