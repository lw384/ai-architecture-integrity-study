## Findings

### 1
- `severity`: high
- `location`: `backend/src/modules/deal/deal.service.ts:175`, `backend/src/modules/deal/deal.service.ts:468`, `backend/src/modules/deal/deal.service.ts:480`, `backend/test/deal.e2e-spec.ts:363`, `frontend/src/pages/deals/DealForm.jsx:145`, `frontend/src/pages/deals/stageModel.js:41`
- `issue`: Stage preconditions are enforced only during stage-transition requests, but can be bypassed by updating related fields while leaving `stage` unchanged.
- `impact`: Deals can persist in `active` without linked contacts and in `negotiation` with `expectedCloseDate = null`, creating inconsistent domain state and weakening downstream assumptions.
- `recommended_improvement`: Enforce preconditions against the final post-update state in `updateDeal` (not only when `dto.stage` is present), and add a persistence-level guard (e.g., DB check or transactional invariant validation) for stage-dependent requirements.

### 2
- `severity`: medium
- `location`: `backend/src/modules/deal/deal.controller.ts:48`, `backend/src/modules/deal/dto/update-stage.dto.ts:3`, `backend/src/modules/deal/deal.service.ts:249`, `backend/src/modules/deal/deal.service.ts:175`
- `issue`: The dedicated stage endpoint accepts only `stage`, while transition rules depend on `expectedCloseDate` and linked contacts; the generic update endpoint can supply those dependencies in the same request, but `/deals/:id/stage` cannot.
- `impact`: API paths for stage changes are not behaviorally equivalent; clients using `/deals/:id/stage` may hit avoidable `422` responses and need extra sequencing calls.
- `recommended_improvement`: Either deprecate `/deals/:id/stage` and use one update path, or extend its DTO/handler to accept required companion fields and reuse the same transition command contract as `/deals/:id`.

### 3
- `severity`: medium
- `location`: `backend/src/modules/deal/deal-stage.policy.ts:3`, `backend/src/modules/deal/deal-stage.policy.ts:21`, `frontend/src/pages/deals/stageModel.js:1`, `frontend/src/pages/deals/stageModel.js:14`, `frontend/src/pages/deals/DealForm.jsx:145`
- `issue`: Canonical stage values, transition matrix, and stage-related guard logic are duplicated across backend and frontend.
- `impact`: Future rule changes require synchronized edits in multiple layers; drift can cause UI/backend behavior mismatches and inconsistent validation outcomes.
- `recommended_improvement`: Centralize stage policy in a shared contract (generated schema/package) or serve transition metadata from backend and make frontend render/validate from that source.

### 4
- `severity`: low
- `location`: `backend/src/modules/deal/dto/query.dto.ts:17`, `backend/src/modules/deal/deal.repository.ts:24`, `backend/src/modules/deal/deal-stage.policy.ts:38`, `backend/src/modules/deal/deal.service.ts:443`, `frontend/src/pages/deals/index.jsx:105`
- `issue`: Stage filtering accepts arbitrary strings and performs raw equality filtering, while mutation endpoints enforce canonical stage parsing and explicit `UNKNOWN_STAGE` errors.
- `impact`: Invalid or differently-cased stage filters silently return empty results instead of validation errors, making API behavior inconsistent and harder for clients to diagnose.
- `recommended_improvement`: Validate and normalize list-query `stage` via the same stage policy used by mutations (including alias/case handling), and return a consistent 400 error for unknown values.

### 5
- `severity`: low
- `location`: `frontend/README.md:20`, `frontend/src/pages/deals/index.jsx:1`
- `issue`: Frontend structure documentation was not propagated to include the `deals` page area.
- `impact`: Documentation lags implemented architecture, increasing onboarding friction and making feature ownership boundaries less clear.
- `recommended_improvement`: Update `frontend/README.md` project structure and feature notes to include `src/pages/deals` and the stage-transition behavior surface.
