# Backend constraint fixture protocol

Each registered backend constraint owns four isolated cases in
`backend-constraint-protocol.fixtures.mjs`:

- `positive`: a conventional compliant implementation.
- `negative`: one minimal violation that produces exactly one finding.
- `nearMiss`: similar syntax that must not be reported.
- `ignored`: a violation-shaped example in test, story, or generated code.

Negative expectations assert the complete normalized rule ID, finding count,
file/line/column location, source adapter rule, and evidence payload. The other
three cases assert an empty finding set. Run the protocol with:

```bash
node --test core/tests/backend-constraint-fixtures.test.mjs
```

The canonical 20-rule set is enabled in every backend evaluation task. The
legacy `BE-STRUCT-C-002` rule remains registered and receives the same fixture
coverage, but is not part of the canonical experiment set.
