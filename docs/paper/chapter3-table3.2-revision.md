# Chapter 3 Revision — §3.4.2 (Architectural Concerns), new §3.4.2a (Metric Selection Principle), and Table 3.2

Ready to paste into the Word draft. Formulas and rule IDs verified directly against the current harness implementation and against `docs/methodology/{metrics,front-metrics,cross-metrics}-literature-review.md`. New/changed content relative to the current draft is marked inline; nothing here touches §3.3 (Sprint Chain) or §3.5–3.7, which need a separate pass.

---

## Revised §3.4.2 — Architectural Concerns

> To simulate realistic, full-stack development scenarios, these **nineteen** concerns are systematically partitioned across three stack domains (or architectural tiers):
>
> **Backend Concerns (9 dimensions):** structural integrity, dependency direction, domain boundaries, transaction and error handling, data-contract stability, routing conventions, unit complexity, resource/policy duplication, and test-construction discipline.
>
> **Frontend Concerns (7 dimensions):** component granularity, state location, routing structure, style isolation, data fetching and effects, inter-component communication, and component/logic reusability.
>
> **Cross-Stack Concerns (3 dimensions):** endpoint existence, request/type contract consistency, and change-propagation completeness.
>
> The cross-stack rulepack was initially explored at up to seven candidate dimensions, additionally including canonical resource naming, HTTP method/status alignment, frontend-handled error-code alignment, and cross-contract source-of-truth duplication. The three retained here were selected as the least mutually redundant and most architecturally distinctive of the seven: endpoint existence is the cheapest precondition check (nothing else can be evaluated if the call site does not resolve), request/type contract consistency is the deepest silent-failure signal (field-level drift that neither stack alone can detect), and change-propagation completeness is the dimension most directly tied to the study's central phenomenon of interest — an agent modifying one side of an existing contract while leaving its counterpart surface stale. The four excluded dimensions were judged either substantially subsumed by the retained three (method/status alignment by endpoint + type checks; naming consistency and source-of-truth duplication by propagation completeness) or to have a ceiling on expected hit-rate too low, given the scale of the reference system, to support reliable trend analysis (error-code alignment fires only when the frontend explicitly handles a specific business error code).

---

## New §3.4.2a — Metric Selection Principle

*(Insert immediately before Table 3.2; this paragraph did not exist in any form in the current draft.)*

> Within each concern, the metric layer was designed as a **minimum covering set**: exactly one representative metric per concern, chosen from the available candidate operationalisations under a single governing principle — where a concern admits both a *complexity/boundary*-type candidate and a *volume/count*-type candidate, the complexity/boundary candidate is preferred. Volume and count metrics (lines of code, number of routes, raw violation counts) are cheap to compute but are trivially gamed by superficial restructuring (e.g., splitting one large file into several small ones without improving cohesion) and conflate legitimate feature growth with architectural decay. Complexity and boundary metrics (render-decision nesting depth, cyclomatic complexity, propagation density) are harder to satisfy through cosmetic changes and speak more directly to whether a unit is doing too much or reaching across a boundary it should respect. This principle was applied consistently in resolving cases where the harness implementation exposes two metrics per concern (e.g., component line-average vs. render-decision-depth-average; route-count vs. route-parameter-complexity): the complexity/boundary member of the pair was retained as the concern's representative in Table 3.2, and the volume/count member is available in the harness output as a secondary signal but is not treated as the concern's primary measurement.
>
> One concern (BE-TEST) and one cross-stack concern's constraint (PROP) admit no clean complexity-type candidate at all; in both cases the retained metric is disclosed in Table 3.2 as a **proxy** rather than a direct measurement, and this limitation is carried forward into Chapter 6.

---

## Revised Table 3.2 — The Concerns × Layers Matrix

Formatting note for Word: recreate as a table with columns **Stack | Concern | Constraint | Metric | Grounding**. Rows changed from the current draft are marked `[CHANGED]`; the one added row is marked `[NEW]`.

### Backend (9 rows)

| Concern | Constraint | Metric | Grounding |
|---|---|---|---|
| **BE-STRUCT**: Layered Structure | Controller–Service–Repository organisation is instantiated; the module registers all three in its `@Module` metadata | Ratio of modules missing a controller, service, or repository layer file to total modules | — |
| **BE-DEP**: Layer Dependency Direction `[CHANGED — renamed from BE-LAYER]` | Controller cannot import Repository directly; dependencies follow Controller→Service→Repository→Entity; no circular imports | Dependency-violation density = (direction-violating import edges + cyclic-dependency edges) / total import edges. Cycles are detected via Tarjan's (1972) strongly-connected-components algorithm applied to the full import graph | Martin (1994); Tarjan (1972); Melton & Tempero (2007) |
| **BE-DOM**: Domain Boundaries | Inter-module communication occurs only via a module's public entry point (`.module.ts`/`index.ts`); a module's public entry point must not export repositories or entities | Count of deep-path imports that bypass a module's public entry point | Parnas (1972) |
| **BE-ERR**: Transaction and Error Boundaries | Service layer must not throw `HttpException`; service failures use the project's unified `AppException`; no silent or log-only catch | Weighted exception-rule violation density = Σ(weight₍ᵢ₎ × violation-count₍ᵢ₎) across the three constraint rules, divided by service-file count | — |
| **BE-CONTRACT**: Data-Contract Stability | Every entity/relationship schema change requires a corresponding migration; DTOs use `class-validator` decorators; optional properties validate supplied values; input whitelisting is preserved | Ratio of DTO fields carrying a `class-validator` decorator to total DTO fields | Meyer (1992) |
| **BE-ROUTE**: Interface Routing | Resolved public routes use the global `/api` prefix and kebab-case resource paths | `[CHANGED]` Ratio of violating endpoints (missing prefix or non-kebab-case path) to total endpoints — **not** a raw count | — |
| **BE-SIZE**: Unit Complexity `[CHANGED — renamed from BE-FUNC; metric formula replaced]` | Production methods have at most three direct parameters | Cyclomatic complexity ratio: V(G) = E − N + 2P per method (≈ 1 + branch-decision count), averaged across controller/service/repository methods. Replaces the parameter-count-only ratio used in the previous instrument version | McCabe (1976) |
| **BE-DUP**: Resource/Policy Duplication `[CHANGED — constraint reframed from a line-count threshold to a semantic ownership rule; metric algorithm replaced]` | Each business resource has exactly one backend owner (no competing modules, controllers, routes, or entity-table owners); each business policy or invariant has exactly one authoritative implementation; no copied equivalent production functions or code blocks | Clone ratio: token-normalised sliding-window clone detection (identifiers/literals collapsed to placeholders so renamed-variable clones hash identically to their source; default window ≥ 50 tokens or ≥ 5 lines, per the Type-1/Type-2 clone taxonomy) = duplicated-line coverage / total token-bearing production lines | Juergens et al. (2009); Roy, Cordy & Koschke (2009) |
| **BE-TEST**: Test Construction Discipline `[NEW — absent from the previous table]` | Services obtain repositories through dependency injection; tests must not call `new Repository(...)` directly | Mock-per-test-case ratio = (mock-usage count via `jest.mock`/`spyOn`/`useValue`/`useFactory`/`useClass`) / test-case count. **Proxy metric**: correlated with, but not a direct measurement of, the constraint | Fowler (2004) |

### Frontend (7 rows)

| Concern | Constraint | Metric | Grounding |
|---|---|---|---|
| **FE-COM**: Component Granularity | Component files ≤ 300 non-blank lines; each React component has render-decision nesting depth ≤ 3 and emits at most one depth finding; pure structural JSX nesting is excluded | `[CHANGED]` Average of each production React component's maximum render-decision nesting depth; raw output also retains max, p90, over-limit count, and per-component details | Harrison & Magel (1981) |
| **FE-STATE**: State Location | `useState`/`useReducer` must not appear in deep child components; context providers appear only at controlled locations | `[CHANGED]` Context-provider ratio = context-provider usage count / (local state-hook count + context-provider count) — a two-way local-vs-context split; no separate global-scope category is tracked | — |
| **FE-ROUTE**: Routing Structure | Route definitions centralised under `src/routes/`; every route resolves to a page component | `[CHANGED]` Average dynamic-parameter count across statically declared routes (the representative metric for this concern; route count is retained in harness output as a secondary signal only) | — |
| **FE-STYLE**: Style Isolation | No raw JSX `style` prop; global styles reside only under `src/styles/global/` | Style-mixing ratio = files mixing ≥ 2 of {`sx`, `className`, `style`, `styled`} / total files | — |
| **FE-DATA**: Data Fetching and Effects | Direct `fetch`/`axios` calls appear only in approved API/data-hook modules; every `useEffect` declares its dependency array | `[CHANGED]` Data-access wrapping ratio = network calls inside approved data-access paths / total detected network calls | Parnas (1972) |
| **FE-COMM**: Inter-component Communication `[CHANGED — renamed from FE-INTER]` | No global event bus | `[CHANGED]` Prop-drilling average = average prop fan-out of JSX elements at or above the prop-drilling threshold (default 4) — not a plain prop-count distribution | Fowler (1999) |
| **FE-DUP**: Component/Logic Reusability `[CHANGED — renamed from FE-REUSE]` | One authoritative implementation per resource; no competing feature directories or UI surfaces; no repeated API, form, validation, transformation, state, component, function, or code-block logic | Clone ratio — **proposed, not yet implemented**; the BE-DUP-M-001 algorithm is directly portable by pointing its source-root configuration at `frontend/src` | Juergens et al. (2009); Roy, Cordy & Koschke (2009) |

### Cross-Stack (3 rows)

| Concern | Constraint | Metric | Grounding |
|---|---|---|---|
| **CROSS-EP**: Endpoint Existence `[CHANGED — renamed from CROSS-ENDPOINT]` | Every frontend API URL resolves to an implemented backend route | Unresolved-endpoint ratio = unresolved frontend call-sites / total detected frontend call-sites | Espinha, Zaidman & Gross (2014); Sohan, Anslow & Maurer (2015) |
| **CROSS-TYPE**: Request/Type Contract Consistency `[CHANGED — renamed from CROSS-CONTRACT]` | Frontend request route params, query fields, and body fields match the backend controller/DTO contract (arity, field existence, required fields, statically resolvable enum/type values) | Weighted contract-field drift density = Σ(weight₍ᵢ₎ × mismatch-count₍ᵢ₎) across route-param/query/body checks, divided by total contract check-points | Espinha et al. (2014) |
| **CROSS-PROP**: Change Propagation Completeness `[CHANGED — renamed from CROSS-CHANGE]` | API-facing backend or frontend adapter changes propagate to the resource's existing counterpart surfaces | Propagation-incompleteness ratio = unsynchronised counterpart surfaces / total expected counterpart surfaces for touched resources. **Diff-driven**: requires a before/after comparison and cannot be computed from a single static snapshot, unlike every other metric in this table | Gall, Hajek & Jazayeri (1998) |

---

## References to add to the bibliography (APA 7)

Only citations newly introduced by this revision; all were verified (title/author/venue, DOI where available) in prior work on this project and are not carried over from memory.

- Espinha, T., Zaidman, A., & Gross, H.-G. (2014). Web API growing pains: Stories from client developers and their code. In *2014 Software Evolution Week – IEEE Conference on Software Maintenance, Reengineering, and Reverse Engineering (CSMR-WCRE)* (pp. 84–93). IEEE.
- Fowler, M. (1999). *Refactoring: Improving the design of existing code*. Addison-Wesley.
- Fowler, M. (2004). *Inversion of control containers and the dependency injection pattern*. https://martinfowler.com/articles/injection.html
- Gall, H., Hajek, K., & Jazayeri, M. (1998). Detection of logical coupling based on product release history. In *Proceedings of the International Conference on Software Maintenance (ICSM '98)* (pp. 190–198). IEEE.
- Harrison, W. A., & Magel, K. I. (1981). A complexity measure based on nesting level. *ACM SIGPLAN Notices, 16*(3), 63–74. https://doi.org/10.1145/947825.947829
- Juergens, E., Deissenboeck, F., Hummel, B., & Wagner, S. (2009). Do code clones matter? In *Proceedings of the 31st International Conference on Software Engineering (ICSE 2009)* (pp. 485–495). IEEE. https://doi.org/10.1109/ICSE.2009.5070547
- Meyer, B. (1992). Applying design by contract. *IEEE Computer, 25*(10), 40–51. https://doi.org/10.1109/2.161279
- Roy, C. K., Cordy, J. R., & Koschke, R. (2009). Comparison and evaluation of code clone detection techniques and tools: A qualitative approach. *Science of Computer Programming, 74*(7), 470–495. https://doi.org/10.1016/j.scico.2009.02.007
- Sohan, S. M., Anslow, C., & Maurer, F. (2015). A case study of web API evolution. In *2015 IEEE International Conference on Web Services*.
- Tarjan, R. E. (1972). Depth-first search and linear graph algorithms. *SIAM Journal on Computing, 1*(2), 146–160. https://doi.org/10.1137/0201010

(Martin (1994), McCabe (1976), and Parnas (1972) are almost certainly already in the draft's bibliography given their appearance elsewhere in the field; verify before adding duplicates.)

---

## Two open items this revision could not resolve on its own

1. **FE-DATA vs. the standalone uncached-API-call-ratio implementation.** The harness codebase contains a separate metric implementation for uncached API calls that was not part of the reviewed minimum covering set and is not reflected in the row above. Confirm whether it should be folded in as a secondary FE-DATA signal, promoted to its own concern, or left out of the thesis scope entirely.
2. **BE-TEST and CROSS-PROP are both flagged as proxy metrics** in the table above (mock-per-test-case does not directly observe repository-construction bypass; propagation-incompleteness requires an inference step about which counterpart surfaces *should* exist). This is consistent with — and should be cross-referenced from — the Chapter 6 Limitations discussion once that section is revised.
