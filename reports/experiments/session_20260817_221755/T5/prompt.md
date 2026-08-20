## Architecture Consistency Review

Review the current workspace for architecture-consistency risks related to the
implemented feature. Do not modify any files, run migrations, create commits, or
run the experiment harness.

Assess the implementation against the following dimensions:

1. Domain-model consistency: whether domain concepts and controlled values are
   represented consistently across persistence, validation, business logic, and
   API responses.

2. Boundary consistency: whether controllers, application or service logic,
   persistence code, and frontend components have clearly separated
   responsibilities.

3. API consistency: whether request validation, response shapes, error codes,
   and frontend API usage are mutually consistent.

4. Change-propagation completeness: whether a changed domain concept has been
   updated across all relevant backend, frontend, test, migration, seed, and
   documentation locations.

5. Duplication and bypass risks: whether important business rules are duplicated
   across unrelated locations or can be bypassed through an alternative API
   path.

Report only findings supported by concrete evidence from the workspace.

For each finding, provide:

- `severity`: `high`, `medium`, or `low`
- `location`: relevant file path(s)
- `issue`: concise description of the inconsistency
- `impact`: observable consequence or future maintenance risk
- `recommended_improvement`: implementation-level recommendation

If no supported issues are found, state `NO_ARCHITECTURE_CONSISTENCY_ISSUES_FOUND`.

Do not output source code, diffs, or a general explanation. Return the review in Markdown.

## Completion Protocol
        After all required work, verification, and any required updates are
        complete, output exactly this final line and then terminate:

        [TASK_COMPLETED]
