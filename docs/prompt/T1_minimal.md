<!--
Task: T1
Variant: minimal
-->

## 1. Agent Role

You are a senior full-stack engineer working on a production-grade multi-tenant CRM built with NestJS using TypeScript (backend), React with MUI using JavaScript (frontend), and TypeORM with PostgreSQL.

## 2. Codebase Orientation

The backend CRM modules are under `backend/src/modules/`. Inspect the existing customer and Deal-related modules before making changes.

The frontend feature code is under `frontend/src/`. Inspect the current navigation,  views, or components before extending the application.

Treat the current workspace as the source of truth. Build on the existing implementation and preserve existing externally observable behaviour unless this task explicitly requires a change.

## 3. Problem Statement

### Feature Request: Add Deal tracking to the CRM

### Background

A Deal represents a sales opportunity. It is fundamentally a relation: it links a value (numeric) and stage (string) to a specific Company. Optionally, a Deal may link to a Contact associated with that Company. Currently, our CRM only tracks Companies and Contacts, leaving sales opportunities undocumented in the system.

### Current Problem

Sales reps currently track opportunities in parallel spreadsheets because the CRM lacks a "pipeline" entity. This leads to data silos where (1) there is no system-level visibility into total pipeline value or activity, and (2) sales teams cannot associate sales engagement with specific revenue opportunities. The absence of this entity is a total blocker for pipeline reporting.

### Desired Outcome

Introduce the Deal entity in the CRM. The system must support CRUD operations for Deals, allowing them to be linked to Companies (mandatory) and Contacts (optional). The frontend must provide a dedicated list and detail view for Deals, supporting basic filtering by stage and Company. The initial seed data must be updated to include representative Deal records to ensure the development environment is immediately functional.

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

22. The Deals list SHALL be reachable from the primary navigation.

Data setup
 23. After 'demo' seed runs, at least 8 Deals SHALL exist across at least 4
 distinct stage values.
 24. After 'edge-case' seed runs, at least one Deal SHALL have contactId=null
 and at least one SHALL have expectedCloseDate=null.

## 5. API Contract

Determine any necessary API additions or modifications from the functional requirements. 

Preserve existing public API behaviour unless a change is necessary to fulfil those requirements.

## 6. Delivery & Verification Protocol:

- Work directly in the provided workspace. Implement the task by modifying the
  relevant project files; do not merely describe a proposed solution.

- Add or update focused functional tests for the behaviour introduced or changed
  by this task. Keep those tests in the project's existing test locations and
  run the relevant test suite before concluding.

- Before concluding, run the relevant functional tests and fix any failures,
  compilation errors, or regressions caused by your changes.

- Do not create Git commits or Git tags. 

- When the implementation is complete and the relevant functional tests pass, respond with exactly `[TASK_COMPLETED]` and nothing else.