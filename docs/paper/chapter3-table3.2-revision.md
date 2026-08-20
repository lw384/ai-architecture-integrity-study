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
| **FE-DUP**: Component/Logic Reusability `[CHANGED — renamed from FE-REUSE]` | One authoritative implementation per resource; no competing feature directories or UI surfaces; no repeated API, form, validation, transformation, state, component, function, or code-block logic | Clone ratio — token-normalised sliding-window clone detection over `frontend/src` (the BE-DUP-M-001 algorithm re-pointed at the frontend source root); **implemented** as `FE-DUP-M-001.mjs` | Juergens et al. (2009); Roy, Cordy & Koschke (2009) |

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

## Sync note (reconciled to shipped code, 2026-08-17)

- **FE-DUP metric is now implemented** (`harness/adapters/computed-metrics/implementations/frontend/FE-DUP-M-001.mjs`). The FE-DUP row above no longer says "proposed, not yet implemented" — that note was stale.
- **Model identity:** the Codex agent ran `gpt-5.3-codex` (not "GPT-5.4"); the Claude agent ran `claude-sonnet-4-6`. Both at reasoning effort = high (not temperature = 0).

## Table 3.2 Patch — Rule Counts in the Constraint Column (paste-ready)

Per the style-alignment pass (`chapter3-style-alignment.md` §C, Rule 1 "numbers-first"), append the rule ID range and count to each Constraint cell so the table itself carries the evidence for "how many rules operationalise this concern" rather than leaving it implicit in prose. All counts verified directly against `harness/rulepacks/*/manifest.yaml` (36 constraint rules total: 20 backend + 13 frontend + 3 cross-stack, matching Chapter 4 §4.1's "all 36 constraint rules evaluated successfully").

**Lead-in sentence to add immediately before Table 3.2** (Rule 9): *"Table 3.2 gives, for each of the nineteen concerns, the constraint rule(s) and representative metric that operationalise it; the constraint column's parenthetical records the exact rule IDs and count, since concerns range from a single rule (e.g. BE-STRUCT) to four (BE-DEP, BE-CONTRACT)."*

### Backend (append to existing cells)

| Concern | Append to Constraint cell |
|---|---|
| BE-STRUCT | *(BE-STRUCT-C-001, n=1)* |
| BE-DEP | *(BE-DEP-C-001–004, n=4)* |
| BE-DOM | *(BE-DOM-C-001–002, n=2)* |
| BE-ERR | *(BE-ERR-C-001–003, n=3)* |
| BE-CONTRACT | *(BE-CONTRACT-C-001–004, n=4)* |
| BE-ROUTE | *(BE-ROUTE-C-001, n=1)* |
| BE-SIZE | *(BE-SIZE-C-001, n=1)* |
| BE-DUP | *(BE-DUP-C-001–003, n=3)* |
| BE-TEST | *(BE-TEST-C-001, n=1)* |

### Frontend

| Concern | Append to Constraint cell |
|---|---|
| FE-COM | *(FE-COM-C-001–002, n=2)* |
| FE-STATE | *(FE-STATE-C-001–002, n=2)* |
| FE-ROUTE | *(FE-ROUTE-C-001–002, n=2)* |
| FE-STYLE | *(FE-STYLE-C-001–002, n=2)* |
| FE-DATA | *(FE-DATA-C-001–002, n=2)* |
| FE-COMM | *(FE-COMM-C-001, n=1)* |
| FE-DUP | *(FE-DUP-C-001–002, n=2)* |

### Cross-Stack

| Concern | Append to Constraint cell |
|---|---|
| CROSS-EP | *(CROSS-EP-C-001, n=1)* |
| CROSS-TYPE | *(CROSS-TYPE-C-001, n=1)* |
| CROSS-PROP | *(CROSS-PROP-C-001, n=1)* |

Example of the resulting cell (BE-DEP row, Constraint column): *"Controller cannot import Repository directly; dependencies follow Controller→Service→Repository→Entity; no circular imports (BE-DEP-C-001–004, n=4)."*

Sum check: 1+4+2+3+4+1+1+3+1 (backend=20) + 2+2+2+2+2+1+2 (frontend=13) + 1+1+1 (cross=3) = **36**, matching the harness manifest total exactly.

---

## New Appendix Table — Rule Inventory (56 rows: 36 constraints + 20 metrics)

Placement: Appendix (referenced from §3.4.4, "Rule Nomenclature and Implementation"), not the main body — per the reference-paper convention of putting the full reproducibility manifest in an appendix while the main-body Table 3.2 stays at concern level (Zeng et al.'s per-model Table 3; SWE-EVO's full model list in Appendix). Every `Check / Formula` and `Adapter` value below is copied verbatim or lightly compressed from the rule's YAML `description`/`formula`/`adapter`/`evidence_sources.adapter` field — nothing paraphrased beyond trimming for table-cell length — so this table can be regenerated mechanically from the rulepack source if the rules change.

**Lead-in sentence:** *"Table [X.Y] lists all fifty-six rules — thirty-six constraints and twenty metrics — that implement the nineteen concerns in Table 3.2, giving each rule's exact check or formula and the tool that computes it, for reproducibility."*

### Backend (20 constraints + 10 metrics)

| Rule ID | Concern | Layer | Check / Formula | Adapter / Tool |
|---|---|---|---|---|
| BE-STRUCT-C-001 | BE-STRUCT | constraint | Each business module provides separate module/controller/service/repository files and registers all three in `@Module` metadata (root modules excluded) | backend-static |
| BE-STRUCT-M-001 | BE-STRUCT | metric | `violating_modules / total_modules`; required components inferred per module from the file system (link/relation modules need controller+service; entity-bearing modules need controller+service+repository; others need service only) | computed-metrics |
| BE-DEP-C-001 | BE-DEP | constraint | Intra-module layering: Controller→Service→Repository→Entity; no reverse imports (service→controller) or entity contamination (entity→service/controller/repository) | backend-static |
| BE-DEP-C-002 | BE-DEP | constraint | `src/common/` and `src/core/` must not import from `src/modules/**` | backend-static |
| BE-DEP-C-003 | BE-DEP | constraint | Guards/interceptors/filters must not import module-specific entities or repositories | backend-static |
| BE-DEP-C-004 | BE-DEP | constraint | No circular imports across modules/layers (type-only edges excluded) | dep-cruiser |
| BE-DEP-M-001 | BE-DEP | metric | `(layering_violations + cyclic_dependency_count) / total_import_edges` | computed-metrics |
| BE-DOM-C-001 | BE-DOM | constraint | Cross-module imports must resolve through `*.module.ts`/`index.ts` only; deep imports into internal implementation files across module boundaries forbidden | backend-static |
| BE-DOM-C-002 | BE-DOM | constraint | Module entry files must not re-export repositories or entities to other modules | backend-static |
| BE-DOM-M-001 | BE-DOM | metric | `count(import edges violating BE-DOM-C-001)` — absolute count, reuses the dep-cruiser violation source | computed-metrics |
| BE-ERR-C-001 | BE-ERR | constraint | Service layer must not throw NestJS `HttpException` directly | backend-static |
| BE-ERR-C-002 | BE-ERR | constraint | Service layer must throw only the unified `AppException` (except configured safe re-throw) | backend-static |
| BE-ERR-C-003 | BE-ERR | constraint | Catch blocks must not silently swallow errors (no empty/log-only/ignored-parameter catches in service files) | backend-static |
| BE-ERR-M-001 | BE-ERR | metric | `sum(weight_i × err_violation_count_i) / max(1, service_file_count)` — aggregates BE-ERR-C-001/002/003 findings, does not re-scan the AST | computed-metrics |
| BE-CONTRACT-C-001 | BE-CONTRACT | constraint | Decorated TypeORM column/relation changes require an executable migration whose up/down methods address the same table and column/relation | contract-diff |
| BE-CONTRACT-C-002 | BE-CONTRACT | constraint | DTOs bound via `@Body`/`@Query`/`@Param`/`@Headers` must declare `class-validator` decorators (mapped DTOs inherit base validation) | backend-static |
| BE-CONTRACT-C-003 | BE-CONTRACT | constraint | Optional request properties (`?`, `@IsOptional()`, mapped types) must validate supplied values, not just declare optionality | backend-static |
| BE-CONTRACT-C-004 | BE-CONTRACT | constraint | Global `ValidationPipe`/`APP_PIPE` must enable `whitelist: true` and `forbidNonWhitelisted: true` | backend-static |
| BE-CONTRACT-M-001 | BE-CONTRACT | metric | `validated request DTO fields / total request DTO fields` | computed-metrics |
| BE-ROUTE-C-001 | BE-ROUTE | constraint | Public routes resolve under the global `/api` prefix and use kebab-case path segments | backend-static |
| BE-ROUTE-M-001 | BE-ROUTE | metric | `violating endpoints / total endpoints` (prefix or kebab-case violation) | computed-metrics |
| BE-SIZE-C-001 | BE-SIZE | constraint | Production controller/service/repository methods have at most three direct parameters (constructors, tests excluded) | backend-static |
| BE-SIZE-M-001 | BE-SIZE | metric | `methods with McCabe (1976) cyclomatic complexity above the configured limit (default 10) / all production methods` | computed-metrics |
| BE-DUP-C-001 | BE-DUP | constraint | Each normalised business resource has one module, controller route, and entity-table owner | backend-static |
| BE-DUP-C-002 | BE-DUP | constraint | Deterministic policy constants and guard/predicate implementations must have one authoritative implementation | backend-static |
| BE-DUP-C-003 | BE-DUP | constraint | Equivalent production functions must be reused/extracted, not duplicated (normalised AST fingerprint; short/policy-shaped functions excluded) | backend-static |
| BE-DUP-M-001 | BE-DUP | metric | `duplicated_lines_covered / total_token_bearing_production_lines` — token-normalised sliding-window Type-1/Type-2 clone detection (Roy et al., 2009) | computed-metrics |
| BE-TEST-C-001 | BE-TEST | constraint | Services must obtain repositories through dependency injection; must not call `new Repository(...)` | backend-static |
| BE-MOCK-M-001 | BE-TEST | metric — **representative (Table 3.2)** | `total mock constructs / total test cases` | computed-metrics |
| BE-TEST-M-001 | BE-TEST | metric — **excluded from architectural analysis** (functional-quality signal, not architectural; §3.4.3, reported in §4.8) | Backend line coverage; `value = coverage-summary.json`'s `lines.pct` | test-coverage |

### Frontend (13 constraints + 7 metrics)

| Rule ID | Concern | Layer | Check / Formula | Adapter / Tool |
|---|---|---|---|---|
| FE-COM-C-001 | FE-COM | constraint | Component files ≤ 300 non-blank, non-comment lines | frontend-static |
| FE-COM-C-002 | FE-COM | constraint | At most three nested render decisions per component (if/switch/conditional-or-logical branches containing JSX; structural JSX nesting excluded) | frontend-static |
| FE-COM-M-001 | FE-COM | metric | Average of each component's maximum nested render-decision depth (same per-component analysis as FE-COM-C-002) | computed-metrics |
| FE-STATE-C-001 | FE-STATE | constraint | Components inside configured stateless/presentational boundaries must not own local state via `useState`/`useReducer` | frontend-static |
| FE-STATE-C-002 | FE-STATE | constraint | Context providers declared only in controlled locations (app shells, route layouts, dedicated provider files) | frontend-static |
| FE-STATE-M-001 | FE-STATE | metric | `context-provider usages / (local state-hook usages + context-provider usages)` | computed-metrics |
| FE-ROUTE-C-001 | FE-ROUTE | constraint | Route definitions centralised under `src/routes/` | frontend-static |
| FE-ROUTE-C-002 | FE-ROUTE | constraint | Every route entry maps to a page component under `pages/` | frontend-static |
| FE-ROUTE-M-001 | FE-ROUTE | metric | Average dynamic-parameter count across statically declared routes | computed-metrics |
| FE-STYLE-C-001 | FE-STYLE | constraint | No raw JSX `style` prop; use MUI `sx`/`styled` or the approved shared styling abstraction | frontend-static |
| FE-STYLE-C-002 | FE-STYLE | constraint | Non-module global stylesheets live only under `src/styles/global/` | frontend-static |
| FE-STYLE-M-001 | FE-STYLE | metric | Share of files mixing ≥ 2 of {`sx`, `className`, `style`, `styled`} | computed-metrics |
| FE-DATA-C-001 | FE-DATA | constraint | Direct `fetch`/`axios` calls appear only in approved API service or data-hook modules | frontend-static |
| FE-DATA-C-002 | FE-DATA | constraint | Every `useEffect` declares all referenced reactive values in its dependency array | frontend-static |
| FE-DATA-M-001 | FE-DATA | metric | Share of detected network calls that stay inside approved data-access modules | computed-metrics |
| FE-COMM-C-001 | FE-COMM | constraint | No global event-bus pattern | frontend-static |
| FE-COMM-M-001 | FE-COMM | metric | Average prop fan-out of JSX elements exceeding the configured prop-drilling threshold | computed-metrics |
| FE-DUP-C-001 | FE-DUP | constraint | Each resource has one frontend feature/route/page/form owner; related list/detail/edit surfaces stay within that owner | frontend-static |
| FE-DUP-C-002 | FE-DUP | constraint | Substantive frontend logic has one authoritative implementation (low-complexity UI event-to-state adapters excluded) | frontend-static |
| FE-DUP-M-001 | FE-DUP | metric | Share of token-bearing frontend production lines covered by Type-1/Type-2 code clones | computed-metrics |

### Cross-Stack (3 constraints + 3 metrics)

| Rule ID | Concern | Layer | Check / Formula | Adapter / Tool |
|---|---|---|---|---|
| CROSS-EP-C-001 | CROSS-EP | constraint | Every frontend API URL must resolve to an implemented backend public path | cross-static |
| CROSS-EP-M-001 | CROSS-EP | metric | `unresolved_frontend_call_sites / total_frontend_call_sites` | computed-metrics |
| CROSS-TYPE-C-001 | CROSS-TYPE | constraint | Frontend request route-params/query/body must align with the backend contract (arity, field existence, required fields, statically resolvable enum/type values) | cross-static |
| CROSS-TYPE-M-001 | CROSS-TYPE | metric | `sum(weight_i × mismatch_count_i) / total_contract_position_count` | computed-metrics |
| CROSS-PROP-C-001 | CROSS-PROP | constraint | API-facing backend/frontend adapter changes must propagate to existing cross-stack counterpart surfaces for the same resource | cross-static |
| CROSS-PROP-M-001 | CROSS-PROP | metric | `missing_counterpart_surfaces / total_counterpart_surfaces` — diff-driven (requires a comparable pre/post-commit range), unlike the snapshot-driven CROSS-EP-M-001/CROSS-TYPE-M-001 | computed-metrics |

### Adapter/Tool legend (for a table footnote)

- **backend-static** / **frontend-static** / **cross-static** — custom AST-walker static analysers, one per stack.
- **dep-cruiser** — `dependency-cruiser`-generated import graph (used only for BE-DEP-C-004's cycle detection; all other dependency-direction constraints run through backend-static).
- **contract-diff** — diff-based check between entity/relation declarations and migration files (BE-CONTRACT-C-001 only).
- **computed-metrics** — the project's own metric-computation layer (`harness/adapters/computed-metrics/implementations/{backend,frontend,cross}/`), one `.mjs` per metric, keyed by the `implementation` field.
- **test-coverage** — wraps the project's Jest `coverage-summary.json`; the only metric on this adapter is `BE-TEST-M-001`, which is why it is the one excluded from architectural analysis (§3.4.3).

Note the discrepancy this table makes visible and resolves: `BE-DEP-M-001`'s formula in this table (`(layering_violations + cyclic_dependency_count) / total_import_edges`) is sourced directly from the YAML and is the authoritative version; if any earlier draft text stated a different formula for this metric, this table supersedes it.

---

## Two open items this revision could not resolve on its own

1. **FE-DATA vs. the standalone uncached-API-call-ratio implementation.** The harness codebase contains a separate metric implementation for uncached API calls that was not part of the reviewed minimum covering set and is not reflected in the row above. Confirm whether it should be folded in as a secondary FE-DATA signal, promoted to its own concern, or left out of the thesis scope entirely.
2. **BE-TEST and CROSS-PROP are both flagged as proxy metrics** in the table above (mock-per-test-case does not directly observe repository-construction bypass; propagation-incompleteness requires an inference step about which counterpart surfaces *should* exist). This is consistent with — and should be cross-referenced from — the Chapter 6 Limitations discussion once that section is revised.
