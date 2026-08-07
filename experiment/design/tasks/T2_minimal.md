<!--
Task: T2 (Contact↔Company and Deal↔Contact become many-to-many)
Variant: minimal
Blocks enabled: 1, 2, 3, 4, 5, 7
Rule IDs targeted: none by design
Derived from: prompt_meta_template_v2.md
Source documents:
Content hash (SHA-256 of blocks 3+4+5): [pending — must match T2_structured.md]
Frozen at: [pending — set at freeze commit]
-->

<!--
Task: T1
Variant: structured
Blocks enabled: 1, 2, 3, 4, 5, 6, 7
Rule IDs targeted:
Derived from: prompt_meta_template_v2.md
Source documents:
Content hash (SHA-256 of blocks 3+4+5): [pending — must match T1_structured.md]
Frozen at: [pending — set at freeze commit]
-->

## 1. Agent Role

You are a senior full-stack engineer working on a production-grade multi-tenant CRM built with NestJS using TypeScript (backend), React with MUI using JavaScript (frontend), and TypeORM with PostgreSQL.

## 2. Codebase Orientation

Backend modules at `backend/src/module/{deal,contact,company}/`. Migrations at `backend/src/database/migrations/`. Seed at `backend/src/database/seed/seed.ts`. Shared infrastructure at `backend/src/common/`, including a paginated result shape `{ items, total, page, pageSize }` and an `EntityNotFoundException` mapping to HTTP 404 with `code: 'NOT_FOUND'`. Global API prefix `/api/v1`, configured in `main.ts` along with `ValidationPipe` and `HttpExceptionFilter`. Frontend feature pages under `frontend/src/pages/`; API clients under `frontend/src/api/`; routes register in `frontend/src/routes/route-registry.js`.

## 3. Problem Statement

### Feature Request: Upgrade Contact–Company and Deal–Contact to many-to-many

### Background

The CRM currently models Contact–Company and Deal–Contact as single-parent relationships: a Contact belongs to exactly one Company, and a Deal points to at most one Contact. This shape reflected the assumption that people work at one company and every deal has one point of contact.

### Current Problem

Two customer complaints in the same week traced to the same modelling assumption. First, a purchasing manager at an enterprise client is the decision-maker for both a parent company and its subsidiary. The current data model forces the sales rep to bind him to one Company only; the other side's account manager sees an empty contact list on their side of the org and effectively goes blind on that relationship. Second, a six-figure deal involves three people on the customer side — a business owner, a legal reviewer, and an IT lead. Only one fits into the current Deal's single Contact slot. The rep has been writing the other two into a free-text note field, and pipeline dashboards cannot count them.

### Desired Outcome

Contact–Company becomes many-to-many; each Contact retains exactly one Company marked as **primary** for display and address-book purposes. Deal–Contact becomes many-to-many, with an optional free-text **role** per link (e.g. "decision-maker", "legal") and an optional **primary** contact per Deal for list-view display. Deal–Company remains one-to-many — a Deal still happens at exactly one Company. All existing data must survive the upgrade: every Contact currently in the database ends up with its former Company as its primary link; every Deal's former Contact becomes a linked contact and is set as that Deal's primary. No data loss. Frontend surfaces are updated so reps can attach multiple contacts to a deal, link a contact to additional companies, and mark primaries.

## 4. Requirements

### Target schema

1. A Contact SHALL support being linked to one or more Companies simultaneously.
2. A Contact SHALL have exactly one linked Company marked as its primary at any point in time.
3. A Deal SHALL support being linked to zero or more Contacts.
4. Each Deal-to-Contact link SHALL carry an optional free-text `role`.
5. A Deal SHALL support recording an optional primary Contact whose id appears among the Deal's linked Contacts.
6. A Deal SHALL continue to reference exactly one Company; the Deal–Company cardinality is unchanged.

### Migration semantics

7. After migration, every Contact that previously referenced a Company SHALL be linked to that same Company with primary = true.
8. After migration, every Deal that previously referenced a Contact SHALL be linked to that same Contact with `role` unset, and that Contact SHALL be set as the Deal's primary Contact.
9. After migration, the previous per-Contact single-Company reference field SHALL no longer appear in Contact API responses.
10. After migration, the previous per-Deal single-Contact reference field SHALL no longer appear in Deal API responses.
11. Re-running the migration against an already-migrated database SHALL succeed without duplicating link rows or raising errors.
12. Rolling back the migration SHALL restore the previous schema shape; data restoration is best-effort.

### Link operations

13. A user SHALL be able to attach an existing Contact to an existing Company as a link, optionally marking that link as the Contact's primary.
14. Attaching a Contact to a new Company with the primary flag SHALL demote the Contact's previous primary link in the same operation.
15. A user SHALL be able to detach a Contact from a Company without deleting the Contact record.
16. Detaching the link that is a Contact's only primary Company SHALL be refused with `code: 'INVALID_LINK_STATE'`.
17. A user SHALL be able to replace the full set of linked Contacts and the primary Contact on a Deal in one atomic operation.

### Modified CRUD

18. Creating a Contact SHALL require the caller to specify one or more Company links with exactly one marked primary.
19. Updating a Contact's Company links SHALL preserve the "exactly one primary" invariant.
20. Fetching a Contact SHALL return the Contact with its linked Companies in an array, primary Company first.
21. Fetching a Deal SHALL return the Deal with its linked Contacts fully expanded and its primary Contact identified.
22. Filtering Contacts by companyId SHALL return every Contact linked to that Company via any link, whether primary or not.
23. Creating a Deal SHALL optionally accept zero or more Contact links and an optional primary Contact.

### Error semantics

24. Creating a Contact with zero Company links SHALL return `code: 'VALIDATION_ERROR'`.
25. Creating or updating a Contact with more or fewer than exactly one primary Company link SHALL return `code: 'VALIDATION_ERROR'`.
26. Setting a Deal's primary Contact to an id not present in the Deal's linked-Contact set SHALL return `code: 'VALIDATION_ERROR'`.
27. Attaching a Contact to an unknown Company SHALL return `code: 'NOT_FOUND'`.
28. Attaching an unknown Contact to a Company SHALL return `code: 'NOT_FOUND'`.
29. Replacing a Deal's Contacts with a list containing any unknown Contact id SHALL return `code: 'NOT_FOUND'` and leave the Deal unchanged.

### Edge cases

30. A Contact linked to exactly one Company (that link being primary) SHALL be a valid state accepted on create, update, and read.
31. A Deal with zero linked Contacts SHALL be a valid state accepted on create, update, and read.
32. A Contact linked to multiple Companies SHALL render on Contact list and detail views without error.
33. A Deal with multiple linked Contacts SHALL render on Deal list and detail views without error.

### UI acceptance

34. Users SHALL be able to attach an existing Contact to a Company from the Company detail page.
35. Users SHALL be able to remove a Contact–Company link from the Company detail page; the confirmation SHALL state that the Contact record itself is not deleted.
36. Users SHALL be able to add or remove multiple Contacts on a Deal and set one of them as primary, from the Deal edit surface.
37. The Contact list SHALL visually indicate when a Contact is linked to more than one Company.
38. UI actions that would violate the "exactly one primary Company per Contact" invariant SHALL either be prevented at submission time or surface the returned `INVALID_LINK_STATE` code as an inline message.

### Data setup

39. After the `demo` seed runs, at least one Contact SHALL be linked to two or more Companies with a clearly marked primary.
40. After the `demo` seed runs, at least one Deal SHALL have three linked Contacts with distinct `role` strings.
41. After the `edge-case` seed runs, at least one Deal SHALL have zero linked Contacts.

## 5. Delivery / Meta

**Delivery & Verification Protocol.**

- **Autonomous Verification.** You MUST write and execute functional tests (`npm run test`) to verify your implementation. You are responsible for fixing any compilation errors or failing tests before concluding.
- **Architecture Blindness.** You are strictly forbidden from running architectural linters, dependency-cruisers, or custom rulepacks. Your task is to fulfill the functional requirements.
- **Output Discipline.** Do NOT print raw source code, diffs, or design rationales. Modify the files directly in the workspace.
- **Termination Signal.** Once your tests pass and the implementation is complete, output exactly `[TASK_COMPLETED]` on a new line and terminate your process immediately.
