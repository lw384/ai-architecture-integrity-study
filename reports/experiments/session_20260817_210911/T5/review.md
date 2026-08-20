### Finding 1
- `severity`: `high`
- `location`: `backend/src/modules/deal/deal.service.ts:513`, `backend/src/modules/deal/deal.service.ts:547`, `backend/src/modules/contact/contact.service.ts:97`, `backend/src/modules/contact/contact.service.ts:122`, `backend/src/modules/contact/contact.service.ts:231`, `backend/src/modules/contact/contact.service.ts:283`
- `issue`: Deal-contact/company consistency is enforced only when creating/updating deals, but contact-company link mutation endpoints can later remove those company links without checking existing deal links.
- `impact`: Existing deals can end up linked to contacts that are no longer linked to the deal’s company, violating domain invariants and creating inconsistent API data over time.
- `recommended_improvement`: In contact link mutation paths (`updateContact`, detach flows), add transactional guards against unlinking company memberships that are referenced by `deal_contact_links` for deals under that company, or cascade-clean affected deal links/`primaryContactId` safely.

### Finding 2
- `severity`: `medium`
- `location`: `backend/src/modules/deal/deal.entity.ts:22`, `backend/src/modules/deal/dto/create.dto.ts:35`, `backend/src/modules/deal/dto/query.dto.ts:27`, `backend/src/modules/deal/deal.service.ts:369`, `backend/src/core/database/migrations/20260817000300-CanonicalizeDealStages.ts:51`, `backend/src/app.module.ts:10`, `backend/src/app.module.ts:33`
- `issue`: Canonical deal-stage control is split across service parsing and a migration-time DB check, while entity/DTO validation still treat stage as free-form string and non-production defaults enable schema sync.
- `impact`: Stage constraints can drift between environments and write paths; invalid persisted stage values can later trigger runtime `UNKNOWN_STAGE` failures in business logic.
- `recommended_improvement`: Make stage a first-class controlled value across layers (`@IsEnum` input validation, entity-level enum/check declaration) and keep schema control migration-driven (`synchronize` default off).

### Finding 3
- `severity`: `medium`
- `location`: `backend/src/modules/company/company.service.ts:38`, `backend/src/modules/contact/contact.service.ts:376`, `backend/src/modules/contact/contact.service.ts:399`, `backend/src/modules/deal/deal.service.ts:319`, `backend/test/company.e2e-spec.ts:203`, `backend/test/deal.e2e-spec.ts:530`
- `issue`: Not-found errors for similar resource-missing conditions return different codes (`ENTITY_NOT_FOUND` vs `NOT_FOUND`) depending on module/endpoint.
- `impact`: Frontend and cross-service consumers cannot rely on one stable error-code contract for missing resources, increasing endpoint-specific handling and maintenance overhead.
- `recommended_improvement`: Normalize 404 semantics to a single code strategy (or a clearly tiered taxonomy) and apply it consistently across services/controllers/tests.

### Finding 4
- `severity`: `medium`
- `location`: `backend/src/modules/contact/contact.service.ts:140`, `backend/src/modules/deal/deal.service.ts:301`, `backend/src/modules/deal/deal.service.ts:628`, `backend/src/modules/company/company.service.ts:66`, `backend/src/modules/company/company.service.ts:71`, `backend/src/modules/company/company.service.ts:77`, `backend/src/modules/contact/contact.entity.ts:48`, `backend/src/modules/deal/deal.entity.ts:49`
- `issue`: Soft-delete semantics are not consistently propagated in raw-SQL read/count paths: deleted contacts/deals are soft-deleted, but downstream queries/counts do not filter on `deletedAt`.
- `impact`: Deleted contacts can remain visible in deal hydration, and soft-deleted child records can still block company deletion despite “active” wording.
- `recommended_improvement`: Apply `deletedAt IS NULL` filtering (or equivalent repository-based queries) in hydration/count checks, and align deletion business rules/comments with actual soft-delete behavior.

### Finding 5
- `severity`: `low`
- `location`: `backend/README.md:17`, `backend/README.md:21`, `frontend/README.md:20`
- `issue`: Documentation structure is not updated to reflect the implemented deals feature (backend module/test listing and frontend pages listing omit deals).
- `impact`: Onboarding and change tracking are harder; contributors may miss feature surfaces, tests, and ownership boundaries.
- `recommended_improvement`: Update backend/frontend README structure sections to include deal module/pages and corresponding test coverage entries.

### Finding 6
- `severity`: `low`
- `location`: `frontend/src/pages/deals/index.jsx:63`, `frontend/src/pages/deals/index.jsx:153`, `backend/src/modules/deal/dto/query.dto.ts:13`
- `issue`: Deals UI exposes a search input, but submitted query state ignores `searchInput`, and backend deal list DTO has no search field.
- `impact`: User-visible filtering behavior is inconsistent with actual API capability; search appears available but has no effect.
- `recommended_improvement`: Either remove/disable deal search UX for now, or implement end-to-end `q` support (DTO, repository filter, and query assembly).
