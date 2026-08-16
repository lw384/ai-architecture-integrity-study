# Frontend constraint fixture protocol

`frontend-constraint-protocol.fixtures.mjs` is the executable specification for
the 13 canonical frontend constraints. Every constraint owns exactly four cases:

- `positive`: a standard compliant implementation;
- `negative`: one minimal violation with an exact normalized finding;
- `nearMiss`: a plausible false positive that must pass;
- `ignored`: test, story, or generated source that must not be scanned.

Run the protocol with:

```sh
node --test core/tests/frontend-constraint-fixtures.test.mjs
```

The test asserts the full rule ID, finding count, line and column, source rule,
and evidence payload. It also verifies that Base and T0-T3 enable the same 13
constraints.
