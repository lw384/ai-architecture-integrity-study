I now have all the evidence needed. Let me compose the architecture consistency review.

---

## Architecture Consistency Review — Deal Feature

---

### Finding 1

- **severity**: `high`
- **location**: `backend/src/modules/deal/deal.controller.ts`, `backend/src/modules/deal/dto/index.ts`
- **issue**: The deal module is the only module without a `response.dto.ts`. The other two modules (`company`, `contact`) each define a response DTO with `@Exclude()`/`@Expose()` decorators. `main.ts` does not register `ClassSerializerInterceptor` globally, so those DTOs are also currently inert at runtime — but the deal module is entirely absent a response boundary layer. If `ClassSerializerInterceptor` is ever registered (the natural step to activate the existing company/contact DTOs), deal endpoints would serialize all `DealEntity` fields and the informally-typed `DealWithCompanyAndContacts` shape, while company and contact endpoints would be filtered by their existing DTOs. Any internal field added to `DealEntity` in the future would be exposed immediately.
- **impact**: Asymmetric field-exposure risk across modules if the serializer is activated. The deal response shape (including the embedded `company: { id, name }` object) is governed only by informal TypeScript types, not an explicit API contract. Adds future maintenance debt.
- **recommended_improvement**: Add `backend/src/modules/deal/dto/response.dto.ts` with `@Exclude()`/`@Expose()` enumerating the intended public fields (`id`, `name`, `value`, `stage`, `companyId`, `primaryContactId`, `expectedCloseDate`, `createdAt`, `updatedAt`, `contactLinks`, `company`). Also register `ClassSerializerInterceptor` globally in `main.ts` or use `@UseInterceptors(ClassSerializerInterceptor)` at the controller level for all three modules simultaneously.

---

### Finding 2

- **severity**: `medium`
- **location**: `backend/src/modules/deal/deal.service.ts:103–117` (updateDeal) and `backend/src/modules/deal/deal.service.ts:147–166` (transitionStage)
- **issue**: Stage transition business rules are enforced independently in two separate code paths. `POST /deals/:id` (general update) validates stage via `updateDeal`, and `POST /deals/:id/stage` (dedicated transition) validates via `transitionStage`. Both call `validateStageVocabulary`, check `isAllowedTransition`, and call `validateTransitionPreconditions`, but do so in separate, non-shared control flows. A concrete behavioral divergence already exists: `transitionStage` always passes `undefined` as `incomingExpectedCloseDate` to `validateTransitionPreconditions`, while `updateDeal` passes `dto.expectedCloseDate` — meaning a client can satisfy the `negotiation` precondition in one atomic call via `updateDeal` but cannot via `transitionStage`.
- **impact**: Any new stage precondition added to one path can be silently omitted from the other, creating an unintentional bypass. A client can sidestep a guard added only to `transitionStage` by using `POST /deals/:id` with `stage` in the body, and vice versa.
- **recommended_improvement**: Extract all stage-change logic (vocabulary validation, transition-map check, precondition validation) into a single private method, e.g., `private enforceStageChange(currentStage, targetStage, deal, incomingDate)`, called by both `updateDeal` and `transitionStage`. This eliminates the duplication and ensures a single authoritative enforcement point.

---

### Finding 3

- **severity**: `medium`
- **location**: `backend/src/modules/deal/deal.service.ts:74` (getDealById), `backend/src/modules/deal/deal.service.ts:213` (getDealRecord), `backend/src/modules/deal/deal.service.ts:143` (transitionStage)
- **issue**: Within the same module, the "deal not found" condition is reported with two different business error codes. `getDealById` and `getDealRecord` (used by `updateDeal`) throw `BUSINESS_ERROR_CODES.ENTITY_NOT_FOUND`; `transitionStage` throws `BUSINESS_ERROR_CODES.NOT_FOUND`. Both map to HTTP 404, but the `code` field in the JSON error body differs. This is confirmed by the test at `deal.service.spec.ts:53–56`, which asserts `NOT_FOUND` for the `transitionStage` path in contrast to `ENTITY_NOT_FOUND` for `getDealById`.
- **impact**: Clients pattern-matching on the `code` field to distinguish error types will observe different codes for the same semantic condition (missing deal) depending on which endpoint they call. This breaks a consistent client error-handling contract.
- **recommended_improvement**: Unify to a single code for "deal not found" across all service methods. Given that `ENTITY_NOT_FOUND` is already the catalog-defined code for this scenario and is used in the `company` and `contact` modules, update `transitionStage` to use `BUSINESS_ERROR_CODES.ENTITY_NOT_FOUND`. Update the corresponding test assertion at `deal.service.spec.ts:55`.

---

### Finding 4

- **severity**: `medium`
- **location**: `backend/src/modules/deal/dto/query.dto.ts:14–16`
- **issue**: `DealListQueryDto.pageSize` is validated with `@Min(10)` and has no `@Max()` upper bound. The company (`CompanyListQueryDto`) and contact (`ContactListQueryDto`) modules both use `@Min(1) @Max(100)` for their `pageSize` fields. A client requesting `pageSize=5` on `GET /deals` receives a 400 validation error, while the identical request on `GET /companies` or `GET /contacts` succeeds. There is also no upper bound on deal page size, allowing arbitrarily large queries.
- **impact**: Inconsistent pagination API surface across modules. Frontend code and API clients must apply different query limits per resource. The missing `@Max()` allows a client to request unbounded result sets from the deals endpoint, potentially causing performance issues.
- **recommended_improvement**: Change `@Min(10)` to `@Min(1)` and add `@Max(100)` to `DealListQueryDto.pageSize`, matching the convention established by the other two modules.

---

### Finding 5

- **severity**: `low`
- **location**: `frontend/src/pages/deals/DealDetail.jsx:45`, `backend/src/modules/deal/deal.repository.ts:9–11`
- **issue**: The deal API response embeds contact links as `{ contactId, role }` objects with no contact name. `DealDetail.jsx` renders `{link.contactId}` (a raw UUID) as the display text in the contacts list. By contrast, the contact module's `ContactResponseDto` includes a `companies: CompanySummaryDto[]` with `id, name, isPrimary`, providing human-readable company names. The deal response has no parallel contact name enrichment.
- **impact**: Users viewing deal details see raw UUIDs for linked contacts, requiring them to navigate away to identify contacts. This is an observable UI regression relative to the contact-detail page's pattern of naming embedded relationships.
- **recommended_improvement**: Extend the deal repository's `loadContactLinksForDeals` query to JOIN on the `contacts` table and return `name` alongside `contactId` and `role`. Surface the `name` field in the response type and in `DealDetail.jsx`'s `ContactLinksSection` component.

---
