## 6. Architecture Rules

Apply these rules to all production code added or modified for this task. Do
not disable, suppress, or bypass the corresponding checks. Explicit task
requirements take precedence where a conflict exists.

### Backend

- **BE-STRUCT-C-001:** Each business module uses separate module, controller,
  service, and repository files, and registers the controller, service, and
  repository in the module's `@Module` metadata.
- **BE-DEP-C-001:** Dependencies follow Controller → Service → Repository →
  Entity.
- **BE-DEP-C-002:** `src/common/` and `src/core/` must not import business
  implementations from `src/modules/`.
- **BE-DEP-C-003:** Guards, interceptors, and filters must not import
  module-specific entities or repositories.
- **BE-DEP-C-004:** Do not introduce circular imports.
- **BE-DOM-C-001:** Cross-module imports use only the target module's
  `.module.ts` or `index.ts` entry point.
- **BE-DOM-C-002:** Module entry points must not export repositories or
  entities.
- **BE-ERR-C-001:** Services must not throw NestJS `HttpException` classes.
- **BE-ERR-C-002:** Service failures use the project's `AppException`.
- **BE-ERR-C-003:** Catch blocks must handle, wrap, or rethrow errors; no
  silent or log-only catches.
- **BE-CONTRACT-C-001:** Persistent entity or relationship changes require a
  corresponding executable migration.
- **BE-CONTRACT-C-002:** Fields on DTOs bound via `@Body`, `@Query`, `@Param`,
  or `@Headers` declare `class-validator` decorators.
- **BE-CONTRACT-C-003:** Optional request properties must validate supplied
  values; `@IsOptional()` alone is insufficient.
- **BE-CONTRACT-C-004:** Preserve input whitelisting and rejection of unknown
  request fields.
- **BE-TEST-C-001:** Services obtain repositories through dependency
  injection; do not call `new Repository(...)`.
- **BE-ROUTE-C-001:** Resolved public routes use the global `/api` prefix and
  kebab-case resource paths.
- **BE-SIZE-C-001:** Production methods have at most three direct parameters;
  group cohesive inputs in a DTO or parameter object.
- **BE-DUP-C-001:** Each business resource has one backend owner; do not create
  competing modules, controllers, routes, or entity-table owners.
- **BE-DUP-C-002:** Each business policy or invariant has one authoritative
  implementation; all entry points delegate to it.
- **BE-DUP-C-003:** Do not copy equivalent production functions; reuse or
  extract an existing shared implementation.

### Frontend

- **FE-COM-C-001:** React component files contain at most 300 non-blank,
  non-comment lines.
- **FE-COM-C-002:** Each React component has at most three nested render
  decisions and produces at most one depth finding. Pure structural JSX
  nesting, layout wrappers, fragments, list iteration, text fallbacks, and
  non-JSX prop conditions do not count toward the depth.
- **FE-STATE-C-001:** Components inside explicitly configured stateless or
  presentational boundaries must not introduce `useState` or `useReducer`;
  interactive components outside those boundaries may keep local UI state.
- **FE-STATE-C-002:** Context providers appear only at the application root,
  route layouts, `src/providers/`, or `src/contexts/`.
- **FE-ROUTE-C-001:** Route definitions live under `src/routes/`.
- **FE-ROUTE-C-002:** Every route resolves to a page component.
- **FE-STYLE-C-001:** Do not use raw JSX `style`; use MUI or the established
  shared styling abstraction.
- **FE-STYLE-C-002:** Global styles live only under `src/styles/global/`.
- **FE-DATA-C-001:** Direct `fetch` or `axios` calls appear only in approved
  API service or data-hook modules.
- **FE-DATA-C-002:** Every `useEffect` declares all referenced reactive values
  in its dependency array.
- **FE-COMM-C-001:** Do not introduce a global event bus; use props, controlled
  context, or the established state mechanism.
- **FE-DUP-C-001:** Each resource has one frontend feature, route, page, and
  form owner; do not create competing feature directories or UI surfaces.
- **FE-DUP-C-002:** Frontend logic has one authoritative implementation.
  Repeated API, form, validation, transformation, state, component, or
  substantive function logic belongs in a shared service, hook, component,
  or utility. Low-complexity UI event-to-state adapters are excluded.

### Cross-Stack

- **CROSS-EP-C-001:** Every frontend API URL resolves to an implemented
  backend route.
- **CROSS-TYPE-C-001:** Frontend request route params, query fields, and body
  fields match the backend controller/DTO contract (arity, field existence,
  required fields, and statically resolvable enum/type values).
- **CROSS-PROP-C-001:** Propagate API-facing backend (controller/DTO) or
  frontend adapter changes to the resource's existing counterpart surfaces:
  frontend adapter, frontend UI, backend contract, and tests.
