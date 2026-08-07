<!--
Task: T1
Variant: minimal
Blocks enabled: 1, 2, 3, 4, 5, 7
Rule IDs targeted: none (Block 6 absent by design)
Derived from: prompt_meta_template_v2.md
Source documents:
Content hash (SHA-256 of blocks 3+4+5): [pending — must match T1_structured.md]
Frozen at: [pending — set at freeze commit]
-->

## 1. Agent Role

You are a senior full-stack engineer working on a production-grade multi-tenant CRM built with NestJS using TypeScript (backend), React with MUI using JavaScript (frontend), and TypeORM with PostgreSQL.

## 2. Codebase Orientation

Add code under `backend/src/module/deal/` and `frontend/src/pages/deals/`. See `backend/src/module/company/` and `frontend/src/pages/companies/` for the pattern. Shared backend utilities (e.g. error) live in `backend/src/common/`. Global API prefix is `/api`. Frontend API clients live under `frontend/src/api/`. Routes register in `frontend/src/routes/route-registry.js`. Seed lives at `backend/src/database/seed/seed.ts`.

## 3. Problem Statement

### Feature Request: Add Deal tracking to the CRM

### Background

A Deal represents a sales opportunity. It is fundamentally a relation: it links a value (numeric) and stage (string) to a specific Company. Optionally, a Deal may link to a Contact associated with that Company. Currently, our CRM only tracks Companies and Contacts, leaving sales opportunities undocumented in the system.

### Current Problem

Sales reps currently track opportunities in parallel spreadsheets because the CRM lacks a "pipeline" entity. This leads to data silos where (1) there is no system-level visibility into total pipeline value or activity, and (2) sales teams cannot associate sales engagement with specific revenue opportunities. The absence of this entity is a total blocker for pipeline reporting.

### Desired Outcome

Introduce the Deal entity as a first-class citizen in the CRM. The system must support CRUD operations for Deals, allowing them to be linked to Companies (mandatory) and Contacts (optional). The frontend must provide a dedicated list and detail view for Deals, supporting basic filtering by stage and Company. The initial seed data must be updated to include representative Deal records to ensure the development environment is immediately functional.

## 4. Requirements

Entity invariants

1. A Deal SHALL reference exactly one Company (required, uuid).
2. A Deal SHALL reference zero or one Contact (optional, uuid).
3. A Deal's value SHALL be a non-negative number.
4. A Deal's stage SHALL default to 'lead' when omitted on creation.
5. A Deal's expectedCloseDate SHALL be nullable.

Creation
 6. Creating a Deal SHALL persist all supplied fields and return the created Deal.
 7. Requests missing any of {name, value, companyId} SHALL return VALIDATION_ERROR.
 8. Requests referencing an unknown companyId SHALL return NOT_FOUND.
 9. Requests referencing an unknown contactId SHALL return NOT_FOUND.

Query
 10. Listing Deals SHALL support pagination by page and pageSize.
 11. Listing Deals SHALL support exact-match filter by stage.
 12. Listing Deals SHALL support filter by companyId.
 13. Requesting a page beyond the last SHALL return an empty items list, not an error.

Detail / Update
 14. Fetching a Deal SHALL return the Deal with the linked Company summary.
 15. Fetching a Deal by unknown id SHALL return NOT_FOUND.
 16. Updating a Deal SHALL accept any subset of mutable fields.
 17. Updating a Deal with an empty body SHALL return VALIDATION_ERROR.
 18. Updating with fields outside the Deal schema SHALL return VALIDATION_ERROR.

Edge cases
 19. A Deal with contactId=null SHALL render on all views (list, detail, form)
 without error.
 20. A Deal with expectedCloseDate=null SHALL render on all views without error.

UI

21. Users SHALL create and edit Deals from the same UI surface.

22. 22. The Deals list SHALL be reachable from the primary navigation.

Data setup
 23. After 'demo' seed runs, at least 8 Deals SHALL exist across at least 4
 distinct stage values.
 24. After 'edge-case' seed runs, at least one Deal SHALL have contactId=null
 and at least one SHALL have expectedCloseDate=null.


## 5. Delivery & Verification Protocol:

You MUST write and execute functional tests (npm run test) to verify your implementation. You are responsible for fixing any compilation errors or failing tests before concluding.

Do NOT print raw source code, diffs, or design rationales. Modify the files directly in the workspace. Once your tests pass and the implementation is complete, output exactly [TASK_COMPLETED] on a new line and terminate your process immediately.