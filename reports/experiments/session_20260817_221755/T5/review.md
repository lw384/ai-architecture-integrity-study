### Finding 1
- **severity**: high
- **location**: `backend/src/modules/deal/deal.service.ts:145`, `backend/src/modules/deal/deal.service.ts:166`, `backend/src/modules/deal/deal.service.ts:449`, `backend/test/deal.e2e-spec.ts:517`
- **issue**: Stage preconditions are enforced only when `stage` is included in the request; the same update API allows contact links / expected close date changes without re-validating the current stage state.
- **impact**: A deal can remain in a stage that violates transition preconditions (e.g., `active` with zero linked contacts, and similarly `negotiation` can be left without `expectedCloseDate`), creating state-level rule bypass via an alternate payload shape.
- **recommended_improvement**: Validate resulting deal invariants after every update (not only on stage transitions), or add a shared post-merge invariant validator used by both `POST /deals/:id` and `POST /deals/:id/stage`.

### Finding 2
- **severity**: medium
- **location**: `backend/src/modules/deal/deal.service.ts:48`, `backend/src/modules/deal/deal.service.ts:334`, `frontend/src/pages/deals/useDealFormState.js:41`, `backend/src/modules/contact/contact.repository.ts:23`
- **issue**: Frontend behavior constrains linked contacts to the selected company, but backend deal validation only checks that contact IDs exist and does not verify company association.
- **impact**: Non-frontend clients can create deal-contact links inconsistent with frontend assumptions, causing cross-client data semantics drift and harder-to-debug integrity issues.
- **recommended_improvement**: In `DealService`, enforce that every linked contact is associated with `deal.companyId` (via `contact_company_links`) before persisting create/update operations.

### Finding 3
- **severity**: medium
- **location**: `backend/src/core/database/migrations/20260817000300-ConstrainDealStages.ts:26`, `backend/src/modules/deal/deal.entity.ts:23`, `backend/src/app.module.ts:33`, `.env.development:12`, `.env.test:12`
- **issue**: Canonical stage constraints are defined in migrations, but runtime configuration in development/test uses `DB_SYNCHRONIZE=true`, which relies on entity sync (without those DB check constraints).
- **impact**: Persistence behavior differs by environment; migration-defined domain constraints may be absent where most day-to-day development/testing occurs.
- **recommended_improvement**: Standardize on migration-driven schema management across environments (`DB_SYNCHRONIZE=false` + explicit migration run), or mirror critical constraints in entity metadata/checks to keep sync and migration behavior aligned.

### Finding 4
- **severity**: low
- **location**: `backend/src/modules/deal/deal-stage.ts:1`, `frontend/src/pages/deals/dealStageModel.js:1`, `backend/src/core/database/migrations/20260817000300-ConstrainDealStages.ts:10`
- **issue**: Canonical deal stages and transition matrix are duplicated across backend business logic, frontend UI model, and migration SQL literals.
- **impact**: Future stage-model changes require multi-file synchronized edits and are vulnerable to drift between API behavior, UI options, and persistence constraints.
- **recommended_improvement**: Introduce a single shared stage-contract source (generated constants/schema or contract package) and derive backend/frontend/migration artifacts from it.

### Finding 5
- **severity**: low
- **location**: `backend/README.md:17`, `frontend/README.md:20`, `frontend/src/routes/route-registry.js:49`
- **issue**: Documentation structure sections have not propagated to include the implemented deals feature even though routes/modules exist.
- **impact**: Architectural onboarding and maintenance context are stale, increasing risk of future partial updates and missed propagation when changing deal-domain behavior.
- **recommended_improvement**: Update backend/frontend README structure sections to include deal-related modules/pages and their responsibilities.
