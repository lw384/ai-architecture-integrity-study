# Appendix A — Rulepack Rule Inventory (Exhaustive Rule Text)

Referenced from §3.4.3 ("the exhaustive rule text provided in Appendix A"). All fifty-six rules — thirty-six constraints and twenty metrics, spanning the nineteen concerns summarised in Table 3.2 — are listed below in full, one entry per rule. Text is transcribed verbatim from each rule's `description` (and, for metrics, `formula`) field in `harness/rulepacks/*/rules/**/*.yaml`; nothing is paraphrased or condensed, so this appendix is the authoritative specification of what the harness checks, mechanically regenerable from the rulepack source if the rules change.

**This is the harness's own specification, not the agent-facing prompt text.** Where a rule reappears — abbreviated to a single sentence — in the Structured condition's "Architectural Guidance" prompt block (§3.5.2, drawn from `docs/prompt/Rules.md`), that shorter form is what the agent was shown; the fuller text below is what the harness evaluates against, and the two are not always the same scope (e.g. `BE-DEP-C-001`'s agent-facing text is one clause, while the harness definition below distinguishes three separate violation sub-conditions). This distinction matters for interpreting the Structured/Minimal comparison in Chapter 4: the rulepack's evaluation criteria are constant across both conditions, but only the shorter agent-facing text — not this full specification — was ever disclosed to the agent under Structured, and disclosed to neither condition under Minimal.

A compact index (Rule ID | Concern | Layer | Adapter) precedes the full entries for quick lookup; the full entries follow, grouped Backend → Frontend → Cross-Stack, and within each stack by concern, constraints before the concern's metric(s).

---

## Index

### Backend (20 constraints + 10 metrics)

| Rule ID | Concern | Layer | Adapter |
|---|---|---|---|
| BE-STRUCT-C-001 | BE-STRUCT | constraint | backend-static |
| BE-STRUCT-M-001 | BE-STRUCT | metric | computed-metrics |
| BE-DEP-C-001 | BE-DEP | constraint | backend-static |
| BE-DEP-C-002 | BE-DEP | constraint | backend-static |
| BE-DEP-C-003 | BE-DEP | constraint | backend-static |
| BE-DEP-C-004 | BE-DEP | constraint | dep-cruiser |
| BE-DEP-M-001 | BE-DEP | metric | computed-metrics |
| BE-DOM-C-001 | BE-DOM | constraint | backend-static |
| BE-DOM-C-002 | BE-DOM | constraint | backend-static |
| BE-DOM-M-001 | BE-DOM | metric | computed-metrics |
| BE-ERR-C-001 | BE-ERR | constraint | backend-static |
| BE-ERR-C-002 | BE-ERR | constraint | backend-static |
| BE-ERR-C-003 | BE-ERR | constraint | backend-static |
| BE-ERR-M-001 | BE-ERR | metric | computed-metrics |
| BE-CONTRACT-C-001 | BE-CONTRACT | constraint | contract-diff |
| BE-CONTRACT-C-002 | BE-CONTRACT | constraint | backend-static |
| BE-CONTRACT-C-003 | BE-CONTRACT | constraint | backend-static |
| BE-CONTRACT-C-004 | BE-CONTRACT | constraint | backend-static |
| BE-CONTRACT-M-001 | BE-CONTRACT | metric | computed-metrics |
| BE-ROUTE-C-001 | BE-ROUTE | constraint | backend-static |
| BE-ROUTE-M-001 | BE-ROUTE | metric | computed-metrics |
| BE-SIZE-C-001 | BE-SIZE | constraint | backend-static |
| BE-SIZE-M-001 | BE-SIZE | metric | computed-metrics |
| BE-DUP-C-001 | BE-DUP | constraint | backend-static |
| BE-DUP-C-002 | BE-DUP | constraint | backend-static |
| BE-DUP-C-003 | BE-DUP | constraint | backend-static |
| BE-DUP-M-001 | BE-DUP | metric | computed-metrics |
| BE-TEST-C-001 | BE-TEST | constraint | backend-static |
| BE-TEST-M-001 | BE-TEST | metric — representative (Table 3.2) | computed-metrics |
| BE-COVERAGE-M-001 | BE-COVERAGE | metric — excluded from architectural analysis (§3.4.3; reported in §4.8) | test-coverage |

### Frontend (13 constraints + 7 metrics)

| Rule ID | Concern | Layer | Adapter |
|---|---|---|---|
| FE-COM-C-001 | FE-COM | constraint | frontend-static |
| FE-COM-C-002 | FE-COM | constraint | frontend-static |
| FE-COM-M-001 | FE-COM | metric | computed-metrics |
| FE-STATE-C-001 | FE-STATE | constraint | frontend-static |
| FE-STATE-C-002 | FE-STATE | constraint | frontend-static |
| FE-STATE-M-001 | FE-STATE | metric | computed-metrics |
| FE-ROUTE-C-001 | FE-ROUTE | constraint | frontend-static |
| FE-ROUTE-C-002 | FE-ROUTE | constraint | frontend-static |
| FE-ROUTE-M-001 | FE-ROUTE | metric | computed-metrics |
| FE-STYLE-C-001 | FE-STYLE | constraint | frontend-static |
| FE-STYLE-C-002 | FE-STYLE | constraint | frontend-static |
| FE-STYLE-M-001 | FE-STYLE | metric | computed-metrics |
| FE-DATA-C-001 | FE-DATA | constraint | frontend-static |
| FE-DATA-C-002 | FE-DATA | constraint | frontend-static |
| FE-DATA-M-001 | FE-DATA | metric | computed-metrics |
| FE-COMM-C-001 | FE-COMM | constraint | frontend-static |
| FE-COMM-M-001 | FE-COMM | metric | computed-metrics |
| FE-DUP-C-001 | FE-DUP | constraint | frontend-static |
| FE-DUP-C-002 | FE-DUP | constraint | frontend-static |
| FE-DUP-M-001 | FE-DUP | metric | computed-metrics |

### Cross-Stack (3 constraints + 3 metrics)

| Rule ID | Concern | Layer | Adapter |
|---|---|---|---|
| CROSS-EP-C-001 | CROSS-EP | constraint | cross-static |
| CROSS-EP-M-001 | CROSS-EP | metric | computed-metrics |
| CROSS-TYPE-C-001 | CROSS-TYPE | constraint | cross-static |
| CROSS-TYPE-M-001 | CROSS-TYPE | metric | computed-metrics |
| CROSS-PROP-C-001 | CROSS-PROP | constraint | cross-static |
| CROSS-PROP-M-001 | CROSS-PROP | metric | computed-metrics |

---

## Backend

### BE-STRUCT — Structural Integrity

**BE-STRUCT-C-001 — Module Composition** *(constraint · backend-static)*
Each business module under `src/modules/<resource>/` must provide separate module, controller, service, and repository files and register the controller, service, and repository in `@Module` metadata. Root application modules are excluded.

**BE-STRUCT-M-001 — Module Composition Violation Ratio** *(metric · computed-metrics)*
Measures continuous drift for module composition completeness. Violating module ratio = modules missing any required component divided by total modules in scope. Required components are inferred per module from the file system alone: a module directory named with a "-link"/"-relation" suffix requires controller+service; a module directory containing an `*.entity.ts` file requires controller+service+repository; every other module requires only a service. This metric does not check whether the discovered files are actually registered in `@Module` metadata.
**Formula:** `violating_modules / total_modules`

### BE-DEP — Dependency Direction

**BE-DEP-C-001 — Intra-Module Layering** *(constraint · backend-static)*
Enforce strict layering within business modules to maintain clear separation of concerns. Violations include:
- Controllers importing from other controllers
- Services importing from controllers (reverse dependency)
- Entities depending on services, controllers, or repositories (contamination)

Expected flow: HTTP Transport (Controller) → Business Logic (Service) → Data Access (Repository) → Data Model (Entity).

**BE-DEP-C-002 — Infrastructure Isolation** *(constraint · backend-static)*
Infrastructure layers (common, core) must remain independent of business modules. Common utilities and core infrastructure (database, seed, config) should not depend on specific module implementations, to avoid circular dependencies and coupling. Violations:
- imports from `src/modules/**` into `src/common/**`
- imports from `src/modules/**` into `src/core/**`

**BE-DEP-C-003 — Framework Layer Purity** *(constraint · backend-static)*
Cross-cutting concerns (Guards, Interceptors, Filters) must remain module-agnostic and reusable across the entire application. These framework extensions must not depend on module-specific entities or repositories. Violations:
- imports from `src/modules/**/*.entity.ts` into `src/common/guards/**`
- imports from `src/modules/**/*.entity.ts` into `src/common/interceptors/**`
- imports from `src/modules/**/*.entity.ts` or `*.repository.ts` into guards, interceptors, filter, or filters directories

**BE-DEP-C-004 — No Circular Dependencies** *(constraint · dep-cruiser)*
Disallow circular dependencies across all modules and layers. Circular dependencies create tight coupling, complicate testing, and hinder refactoring. Every runtime import edge should contribute to an acyclic dependency graph. Type-only edges are excluded because they do not create runtime coupling. Detection method: Module A imports B, B imports C, C imports A (or shorter cycles A→B→A).

**BE-DEP-M-001 — Dependency Violation Density** *(metric · computed-metrics)*
Measures the density of illegal dependency edges in the backend module graph. Combines two failure modes: (a) intra-module layering violations (controller → service → repository → entity, including the entity layer, scoped to same-module edges only), and (b) cyclic import chains between modules. Density is the sum of both violation counts divided by the total number of import edges, giving a [0.0, 1.0] ratio comparable across sprints regardless of codebase size growth.
**Formula:** `(layering_violations + cyclic_dependency_count) / total_import_edges`

### BE-DOM — Domain Boundaries

**BE-DOM-C-001 — No Cross-Module Deep Import** *(constraint · backend-static)*
Cross-module imports must go through module entry files only. A module may import another module only via `*.module.ts` or `index.ts`. Deep imports into internal implementation files (controller/service/repository/entity/dto) are forbidden across module boundaries.

**BE-DOM-C-002 — No Repository in Module Exports** *(constraint · backend-static)*
Module entry files must not expose persistence-layer details. Entry files (`*.module.ts` / `index.ts`) must not re-export repository or entity implementations to other modules.

**BE-DOM-M-001 — Cross-Module Deep Import Count** *(metric · computed-metrics)*
Counts cross-module deep imports that bypass module entry files (`*.module.ts` or `index.ts`). This metric reuses the same dep-cruiser violation source as BE-DOM-C-001 and reports the absolute number of violating import edges.
**Formula:** `count(import edges violating BE-DOM-C-001)`

### BE-ERR — Transaction and Error Boundaries

**BE-ERR-C-001 — No HTTP Exception in Service** *(constraint · backend-static)*
Service layer must not throw NestJS HTTP exceptions directly. Services should raise domain-level exceptions and let upper layers map them to HTTP responses.

**BE-ERR-C-002 — Throw Only AppException** *(constraint · backend-static)*
Service layer must throw only the unified `AppException` class (except configured safe re-throw in catch blocks). This keeps error semantics consistent across modules.

**BE-ERR-C-003 — No Silent Catch** *(constraint · backend-static)*
Catch blocks must not silently swallow errors. Empty catch blocks, log-only catches, or catches that ignore the error parameter are forbidden in service files.

**BE-ERR-M-001 — Exception Unification Violation Density** *(metric · computed-metrics)*
Measures exception-handling drift in service layer by aggregating violations from BE-ERR-C-001/002/003 and normalizing by service file count. This metric reuses existing constraint outputs instead of re-scanning AST.
**Formula:** `sum(weight_i * err_violation_count_i) / max(1, service_file_count)`

### BE-CONTRACT — Data-Contract Stability

**BE-CONTRACT-C-001 — Entity Change Requires Migration** *(constraint · contract-diff)*
Decorated TypeORM column or relation changes must be accompanied by an executable migration whose up and down methods address the same table and column/relation. Empty or unrelated migration files do not satisfy the contract.

**BE-CONTRACT-C-002 — Request DTO Uses class-validator** *(constraint · backend-static)*
DTOs used by `@Body`, `@Query`, `@Param`, or `@Headers` controller parameters must declare `class-validator` decorators. Mapped DTOs inherit their base validation, while newly declared fields are checked directly.

**BE-CONTRACT-C-003 — Optional Request Properties Validate Values** *(constraint · backend-static)*
Optional request properties created by `?`, `@IsOptional()`, or mapped types must validate supplied values. Optionality decorators alone are not value validators.

**BE-CONTRACT-C-004 — Validation Pipe Whitelisting** *(constraint · backend-static)*
The global `ValidationPipe` or `APP_PIPE` equivalent must enable `whitelist: true` and `forbidNonWhitelisted: true`. Constants and local options factories are resolved.

**BE-CONTRACT-M-001 — DTO Validator Coverage** *(metric · computed-metrics)*
Measures request DTO validation coverage. Coverage = validated request DTO fields / total request DTO fields.
**Formula:** `validated_request_dto_fields / total_request_dto_fields`

### BE-ROUTE — Interface Routing

**BE-ROUTE-C-001 — API Prefix and Kebab-Case** *(constraint · backend-static)*
Public backend routes must resolve under the global `/api` prefix and use kebab-case path segments in controller and method decorators.

**BE-ROUTE-M-001 — Route Prefix Violation Ratio** *(metric · computed-metrics)*
Measures the share of backend endpoints violating `/api` prefix or kebab-case route rules. Value = violating endpoints / total endpoints.
**Formula:** `violating_endpoints / total_endpoints`

### BE-SIZE — Unit Complexity

**BE-SIZE-C-001 — Max Method Parameters** *(constraint · backend-static)*
Production controller, service, and repository methods must not exceed three direct parameters; group cohesive inputs in a DTO or parameter object. Constructors and test files are excluded.

**BE-SIZE-M-001 — Cyclomatic Complexity Ratio** *(metric · computed-metrics)*
Measures the share of production controller/service/repository methods whose McCabe (1976) cyclomatic complexity exceeds the configured limit. V(G) = 1 + count(if/while/for/case/&&/||/ternary) within the method body, not descending into nested closures. Replaces the former parameter-count-based SIZE metric: parameter width is a weak proxy for "does this method do too much"; cyclomatic complexity measures the control flow directly. Value = methods with complexity above `max_complexity` (default 10) / all production methods.
**Formula:** `count(methods where cyclomatic_complexity > max_complexity) / total_production_methods`

### BE-DUP — Resource/Policy Duplication

**BE-DUP-C-001 — Single Resource Owner** *(constraint · backend-static)*
Each normalized business resource has one module, controller route, and entity-table owner. URI versions are tracked independently and configured aliases are normalized.

**BE-DUP-C-002 — Single Policy Implementation** *(constraint · backend-static)*
Deterministic policy constants and guard/predicate implementations must have one authoritative implementation. Entry points should delegate instead of copying it.

**BE-DUP-C-003 — No Equivalent Production Code** *(constraint · backend-static)*
Equivalent production functions must be reused or extracted. Detection uses a normalized AST fingerprint and intentionally excludes short or policy-shaped functions.

**BE-DUP-M-001 — Clone Ratio** *(metric · computed-metrics)*
Measures the share of production backend source lines covered by detected code clones. Uses token-normalized sliding-window matching over production `.ts`/`.tsx` files: identifiers and literals are collapsed to placeholders so Type-1 (exact) and Type-2 (renamed identifiers/literals) clones, per Roy et al. (2009)'s taxonomy, both hash identically. Fills the metric gap for BE-DUP-C-001/002/003, which previously had zero metric coverage.
**Formula:** `duplicated_lines_covered / total_token_bearing_production_lines`

### BE-TEST — Test Construction Discipline

**BE-TEST-C-001 — No Direct Repository Construction** *(constraint · backend-static)*
Service classes must not instantiate `Repository` or `*Repository` classes directly. Repositories should be supplied through dependency injection.

**BE-TEST-M-001 — Mock per Test Case** *(metric · computed-metrics — representative metric for BE-TEST in Table 3.2)*
Measures average mock usage intensity in backend tests. Value = total mock constructs / total test cases.
**Formula:** `total_mock_constructs / total_test_cases`

**BE-COVERAGE-M-001 — Test Coverage** *(metric · test-coverage — computed by the harness but excluded from architectural analysis, §3.4.3; reported in §4.8)*
Measures backend line coverage using the project's `coverage-summary.json` report. Value = `lines.pct`.
**Formula:** `coverage_summary.total.lines.pct`

---

## Frontend

### FE-COM — Component Granularity

**FE-COM-C-001 — Component File Max Lines** *(constraint · frontend-static)*
React component files contain at most 300 non-blank, non-comment lines.

**FE-COM-C-002 — Render Decision Max Depth** *(constraint · frontend-static)*
A React component must not contain more than three nested render decisions. Render decisions include if/switch control flow and conditional or logical expressions whose branches contain JSX. Pure structural JSX nesting, layout wrappers, fragments, list iteration, text fallbacks, and non-JSX prop expressions do not contribute to the depth.

**FE-COM-M-001 — Render Decision Depth Average** *(metric · computed-metrics)*
Measures the average of each production React component's maximum nested render-decision depth. It uses the same per-component decision analysis as FE-COM-C-002 and excludes pure structural JSX nesting.
**Formula:** `sum(component_max_render_decision_depth) / total_production_components`

### FE-STATE — State Location

**FE-STATE-C-001 — No Local State in Stateless Components** *(constraint · frontend-static)*
Components inside explicitly configured stateless or presentational boundaries must not own local React state through `useState` or `useReducer`. Interactive components outside those boundaries may keep local UI state.

**FE-STATE-C-002 — Context Provider Only in Controlled Locations** *(constraint · frontend-static)*
Context providers must be declared only in controlled locations such as app shells, route layouts, or dedicated provider entry files.

**FE-STATE-M-001 — Context Provider Ratio** *(metric · computed-metrics)*
Measures the share of context provider usages relative to all detected local state hooks and provider usages.
**Formula:** `context_provider_usages / (local_state_hook_usages + context_provider_usages)`

### FE-ROUTE — Routing Structure

**FE-ROUTE-C-001 — Route Definitions Centralized** *(constraint · frontend-static)*
Route definitions must be centralized under `src/routes` to keep route topology discoverable and avoid split ownership.

**FE-ROUTE-C-002 — Route Maps to Page Component** *(constraint · frontend-static)*
Every route entry must map to a page component. Route loaders or route elements should resolve to modules under `pages/`.

**FE-ROUTE-M-001 — Route Param Complexity** *(metric · computed-metrics)*
Measures average dynamic-parameter count across statically declared frontend routes.
**Formula:** `total_dynamic_route_parameters / total_statically_declared_routes`

### FE-STYLE — Style Isolation

**FE-STYLE-C-001 — No Raw JSX Style** *(constraint · frontend-static)*
React components should not use raw JSX `style` props. Prefer MUI `sx`, `styled`, or approved shared styling abstractions.

**FE-STYLE-C-002 — Global Styles Only in Approved Locations** *(constraint · frontend-static)*
Non-module global stylesheets live only under `src/styles/global/`.

**FE-STYLE-M-001 — Style Mixing Ratio** *(metric · computed-metrics)*
Measures the share of frontend files that mix multiple styling mechanisms such as `sx`, `className`, `style`, or `styled`.
**Formula:** `files_with_multiple_styling_mechanisms / total_frontend_production_files`

### FE-DATA — Data Fetching and Effects

**FE-DATA-C-001 — Network Calls Only in Approved Modules** *(constraint · frontend-static)*
Direct `fetch` or `axios` calls appear only in approved API service or data-hook modules.

**FE-DATA-C-002 — useEffect Requires Dependency Array** *(constraint · frontend-static)*
Every `useEffect` declares all referenced reactive values in its dependency array.

**FE-DATA-M-001 — Data Access Wrapping Ratio** *(metric · computed-metrics)*
Measures the share of detected network calls that stay inside approved frontend data-access modules.
**Formula:** `network_calls_in_approved_data_access_modules / total_detected_network_calls`

### FE-COMM — Inter-Component Communication

**FE-COMM-C-001 — No Global Event Bus** *(constraint · frontend-static)*
Frontend modules should not introduce a global event bus pattern.

**FE-COMM-M-001 — Prop Drilling Average** *(metric · computed-metrics)*
Measures the average prop fanout of JSX elements that exceed the configured prop-drilling threshold.
**Formula:** `total_prop_fanout_of_candidates / total_prop_drilling_candidates`

### FE-DUP — Component/Logic Reusability

**FE-DUP-C-001 — Single Resource Owner** *(constraint · frontend-static)*
Each resource has one frontend feature, route, page, and form owner; related list, detail, and edit surfaces remain within that owner.

**FE-DUP-C-002 — Single Authoritative Implementation** *(constraint · frontend-static)*
Substantive frontend logic has one authoritative implementation. Repeated API, form, validation, transformation, state, component, or function logic belongs in a shared service, hook, component, or utility. Low-complexity UI event-to-state adapters are excluded. One finding is emitted per exact implementation file set, with every substantive clone group retained in evidence.

**FE-DUP-M-001 — Clone Ratio** *(metric · computed-metrics)*
Measures the share of token-bearing frontend production lines covered by Type-1 or token-normalized Type-2 code clones.
**Formula:** `duplicated_lines_covered / total_token_bearing_production_lines`

---

## Cross-Stack

### CROSS-EP — Endpoint Existence

**CROSS-EP-C-001 — Frontend API URL Resolves to Backend Route** *(constraint · cross-static)*
Every frontend API URL must resolve to an implemented backend public path.

**CROSS-EP-M-001 — Endpoint Resolution Miss Ratio** *(metric · computed-metrics)*
Continuous view of CROSS-EP-C-001: instead of a binary pass/fail on whether any frontend API call fails to resolve to a backend public route, this measures what fraction of all statically discovered frontend call sites are unresolved. Lets the size of the "broken call" area grow or shrink across iterations instead of only reporting whether it is empty.
**Formula:** `unresolved_frontend_call_sites / total_frontend_call_sites`

### CROSS-TYPE — Request/Type Contract Consistency

**CROSS-TYPE-C-001 — Request/Query/Body Contract Alignment** *(constraint · cross-static)*
Frontend request paths, query objects, and body payloads should align with backend request contracts. This v1 rule checks route-param arity, query/body field existence, required body fields when the payload is statically known, and statically resolvable enum/type literal mismatches.

**CROSS-TYPE-M-001 — Contract Field Drift Density** *(metric · computed-metrics)*
Weighted density view of CROSS-TYPE-C-001's three sub-checks (route-param arity, query field, body field mismatches). Each mismatch kind is weighted by how likely it is to actually break the request at runtime (body-field mismatches weighted highest by default), then normalized by the total number of statically resolvable request-contract positions — not only the ones that happen to violate — so the ratio is comparable across sprints regardless of how many API call sites the codebase grows to.
**Formula:** `sum(weight_i * mismatch_count_i) / total_contract_position_count`

### CROSS-PROP — Change Propagation Completeness

**CROSS-PROP-C-001 — API-Facing Change Propagates to Affected Surfaces** *(constraint · cross-static)*
API-facing backend or frontend adapter changes must propagate to the corresponding cross-stack counterpart surfaces that already exist for the same resource.

**CROSS-PROP-M-001 — Propagation Incompleteness Ratio** *(metric · computed-metrics)*
Continuous view of CROSS-PROP-C-001: for resources with an API-facing change in this run's diff, measures what fraction of their already-existing counterpart surfaces (backend contract, frontend adapter, frontend UI) were not updated alongside the change. Unlike CROSS-EP-M-001 and CROSS-TYPE-M-001, this is diff-driven, not snapshot-driven: it only produces a value when a comparable preCommit/postCommit range is available.
**Formula:** `missing_counterpart_surfaces / total_counterpart_surfaces`

---

## Provenance

Extracted mechanically from `harness/rulepacks/{ts-nestjs-backend,js-react-frontend,cross}/rules/**/*.yaml` via each file's `rule_id`, `description`, `formula` (metrics only), and `adapter` / `evidence_sources[].adapter` fields, using the project's `.venv-notebook` (the only project virtualenv with PyYAML installed). Sum check: 20 + 13 + 3 = 36 constraints; 10 + 7 + 3 = 20 metrics; 56 rules total — matching the harness manifests (`harness/rulepacks/*/manifest.yaml`) and Chapter 4 §4.1's reported "36 constraint rules" and "19 of 20" baseline metric coverage. Every metric now declares a standalone `formula:` field derived from its executable implementation, and every metric entry above presents that formula in the same format.
