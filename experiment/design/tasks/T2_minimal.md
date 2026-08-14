<!--
Task: T2 (Contact↔Company and Deal↔Contact become many-to-many)
Variant: minimal
-->

## 1. Agent Role

You are a senior full-stack engineer working on a production-grade multi-tenant CRM built with NestJS using TypeScript (backend), React with MUI using JavaScript (frontend), and TypeORM with PostgreSQL.

## 2. Codebase Orientation

The backend CRM modules are under `backend/src/modules/`. Inspect the existing customer and Deal-related modules before making changes.

The frontend feature code is under `frontend/src/`. Inspect the current navigation, views, or components before extending the application.

Treat the current workspace as the source of truth. Build on the existing implementation and preserve existing externally observable behaviour unless this task explicitly requires a change.

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

1. After migration, every Contact that previously referenced a Company SHALL be linked to that same Company with primary = true.

2. After migration, every Deal that previously referenced a Contact SHALL be linked to that same Contact with `role` unset, and that Contact SHALL be set as the Deal's primary Contact.

3. After migration, the previous per-Contact single-Company reference field SHALL no longer appear in Contact API responses.

4. After migration, the previous per-Deal single-Contact reference field SHALL no longer appear in Deal API responses.

5. Re-running the migration against an already-migrated database SHALL succeed without duplicating link rows or raising errors.

6. Rolling back the migration SHALL restore the previous schema shape; data restoration is best-effort.

### Link operations

1. A user SHALL be able to attach an existing Contact to an existing Company as
   a link, optionally marking that link as the Contact's primary.

2. Attaching a Contact to a new Company with the primary flag SHALL demote the
   Contact's previous primary link in the same operation.

3. A user SHALL be able to mark an existing Contact–Company link as primary.
   Marking a link as primary SHALL demote the Contact's previous primary link
   in the same atomic operation.

4. A user SHALL be able to detach a Contact from a Company without deleting the
   Contact record, provided that the operation preserves exactly one primary
   Company link for that Contact.

5. Detaching a Contact–Company link marked primary SHALL be refused with
   `code: 'INVALID_LINK_STATE'` unless the same operation designates another
   existing Company link as primary.

6. A user SHALL be able to replace the full set of linked Contacts and the
   primary Contact on a Deal in one atomic operation.

### Modified CRUD

1. Creating a Contact SHALL require the caller to specify one or more Company links with exactly one marked primary.

2. Updating a Contact's Company links SHALL preserve the "exactly one primary" invariant.

3. Fetching a Contact SHALL return the Contact with its linked Companies as an
   array of Company summaries. Each summary SHALL include the Company's `id` and`name`. The primary Company SHALL appear first.

4. A Deal SHALL support recording an optional primary Contact id. When present,
   the id SHALL appear in the Deal's linked Contact ids.

5. Filtering Contacts by companyId SHALL return every Contact linked to that Company via any link, whether primary or not.

6. Creating a Deal SHALL optionally accept zero or more Contact links and an optional primary Contact.

### Error semantics

1. Creating a Contact with zero Company links SHALL return `code: 'VALIDATION_ERROR'`.

2. Creating or updating a Contact with more or fewer than exactly one primary Company link SHALL return `code: 'VALIDATION_ERROR'`.

3. Setting a Deal's primary Contact to an id not present in the Deal's linked-Contact set SHALL return `code: 'VALIDATION_ERROR'`.

4. Attaching a Contact to an unknown Company SHALL return `code: 'NOT_FOUND'`.

5. Attaching an unknown Contact to a Company SHALL return `code: 'NOT_FOUND'`.

6. Replacing a Deal's Contacts with a list containing any unknown Contact id SHALL return `code: 'NOT_FOUND'` and leave the Deal unchanged.

7. Detaching a Contact–Company link marked primary without simultaneously
   designating another existing Company link as primary SHALL return
   `code: 'INVALID_LINK_STATE'`.

### Edge cases

1. A Contact linked to exactly one Company (that link being primary) SHALL be a valid state accepted on create, update, and read.

2. A Deal with zero linked Contacts SHALL be a valid state accepted on create, update, and read.

3. A Contact linked to multiple Companies SHALL render on Contact list and detail views without error.

4. A Deal with multiple linked Contacts SHALL render on Deal list and detail views without error.

### UI acceptance

1. The Company detail page SHALL display all Contacts linked to that Company,
   regardless of whether the Company is the Contact's primary or secondary
   Company.

2. The Contact create and edit surfaces SHALL allow users to link the Contact
   to one or more Companies and select exactly one linked Company as primary.

3. When a Contact is linked to exactly one Company, that Company SHALL be
   selected as primary by default.

4. The Contact create and edit surfaces SHALL prevent submission when no Company
   is linked, or when the linked Companies do not have exactly one primary
   selection. The relevant validation error SHALL be shown inline.

5. The Deal create and edit surfaces SHALL require users to select exactly one
   Company before the Deal can be created or saved.

6. The Deal create and edit surfaces SHALL allow users to add and remove zero
   or more Contacts. For each linked Contact, users SHALL be able to enter an
   optional role.

7. When one or more Contacts are linked to a Deal, the Deal create and edit
   surfaces SHALL allow users to select at most one linked Contact as the
   primary Contact. When a deal is linked to exactly one Contact, that Contact SHALL be
   selected as primary by default.

8. A Deal with no linked Contacts SHALL remain a valid state in the create,
   edit, and detail views.

9. The Contact list SHALL visually indicate when a Contact is linked to more
   than one Company.

### Data setup

1. After the `demo` seed runs, at least one Contact SHALL be linked to two or more Companies with a clearly marked primary.

2. After the `demo` seed runs, at least one Deal SHALL have three linked Contacts with distinct `role` strings.

3. After the `edge-case` seed runs, at least one Deal SHALL have zero linked Contacts.

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