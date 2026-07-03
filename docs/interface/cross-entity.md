# Cross-Entity Constraints

> **Scope**: Rules that span more than one entity. Every rule in this document
> is authoritative when it appears; per-entity specs reference this file
> rather than restate.
>
> **Prerequisites**: [principles.md](./principles.md) and every entity spec
> ([company.md](./company.md), [contact.md](./contact.md),
> [interaction.md](./interaction.md), [deal.md](./deal.md)).
>
> **Source lineage**: `PRD_v2.docx §4.6–4.7` (cross-entity rule table and
> endpoint-trigger matrix); `CRM_Scope_v2_Task_Design.docx §2.2` (imperfection),
> `§3` (architectural constraints), `§4.4`/`§4.5` (L4.6, L5b).
>
> **v2 change summary**: (a) all `customerId` references become `companyId`;
> (b) X-3 is now **symmetric** — it governs both `Deal.contactId` and the
> newly introduced `Interaction.contactId`; (c) X-6 is now a **dual-detach**
> rule — deleting a Contact nulls references from *both* Deal and
> Interaction, not Deal alone; (d) all endpoint references use the POST
> double-role convention (`principles.md §3.1`) rather than v1's PATCH.

---

## 1. Why a Separate File

**Main point**: cross-entity rules are centralised here rather than
duplicated inside each entity spec, because they are the single most common
site of drift in LLM-generated code — an agent that implements each entity
correctly in isolation frequently fails to preserve the invariant that only
becomes visible when two entities are read together.

**Rationale**: this is not a stylistic preference; it follows from how
static analysis literature characterises the failure. Parnas's (1972)
argument for information hiding already implies the corollary used here:
a module's *local* correctness is verifiable against its own interface, but
a *cross-module* invariant requires the reader (human or agent) to hold two
interfaces in mind simultaneously — and holding two things in mind
simultaneously is exactly the resource that transformer context windows
spend non-uniformly across a growing prompt. The empirical basis for that
claim, already cited in `prompt_meta_template_v3.md §0(a)`, is Liu et al.
(2024): *"performance is often highest when relevant information occurs at
the beginning or end of the input context, and significantly degrades when
models must access relevant information in the middle."* Centralising
cross-entity rules in one file with stable IDs (`X-1`…`X-8`) lets a prompt
reference `X-3` by ID rather than restate the rule prose, which (a) keeps
prompt length down and (b) gives dissertation appendices a byte-stable
citation target that survives entity-spec edits.

---

## 2. Rule Table

| ID | Rule | Entities | Baseline enforcement | Introduced in (if experimental) |
|---|---|---|---|---|
| `X-1` | Delete parent with existing children → `409 REFERENTIAL_INTEGRITY_VIOLATION` | Company → { Contact, Interaction, Deal } | ✅ enforced in v0/v1 | — |
| `X-2` | Create/update child with non-existent parent → `404 PARENT_NOT_FOUND` | { Contact, Interaction, Deal } → Company; Deal, Interaction → Contact | ✅ enforced in v0/v1 | — |
| `X-3` | `contactId`, when non-null, must satisfy `Contact.companyId == <entity>.companyId` | Deal ↔ Contact ↔ Company; **Interaction ↔ Contact ↔ Company (v2 symmetric application)** | ✅ enforced in v1 (both sites) | — |
| `X-4` | `Company.status == 'inactive'` blocks new Deal creation | Company ↔ Deal | ❌ **not** enforced in baseline; agent should implement | L4.6 (`CRM_Scope §4.4`) |
| `X-5` | `Deal.stage` state machine with preconditions | Deal (Deal ↔ Contact for `qualified` precond) | ❌ **not** enforced in baseline; agent should implement | L2 (`CRM_Scope §4.2`), L4.4 |
| `X-6` | Deleting a Contact nulls `Deal.contactId` **and** `Interaction.contactId` references (dual-detach, v2) | Contact → { Deal, Interaction } | ✅ enforced in v1 | — |
| `X-7` | Deleting a Company with children — soft-delete or precondition check | Company | Baseline **hard-rejects** via `X-1`; the L5b probe asks the agent to reconsider this posture | L5b (`CRM_Scope §4.5`) |
| `X-8` | `Interaction.dealId` (nullable) FK to Deal; deleting a Deal nulls or blocks | Interaction ↔ Deal | ❌ **not** in baseline (Interaction has no `dealId`) | L4.2 introduces field; deletion semantics agent-defined in L4.4 or later |

---

## 3. Rule Details

### X-1. Referential Integrity on Parent Delete

**Statement**: `DELETE /<parent>/:id` returns `409
REFERENTIAL_INTEGRITY_VIOLATION` if any child resource exists whose FK
points to `:id`.

**Response body**:
```json
{
  "error": {
    "code": "REFERENTIAL_INTEGRITY_VIOLATION",
    "message": "Cannot delete Company with existing children",
    "details": {
      "resource": "Company",
      "id": "a3f8...",
      "blockingChildren": {
        "contacts": 3,
        "interactions": 12,
        "deals": 1
      }
    }
  }
}
```

**Applies to**:

| Parent | Children checked |
|---|---|
| Company | Contact, Interaction, Deal |
| Contact | (none via X-1; `Deal.contactId` / `Interaction.contactId` are handled by X-6, not X-1 — see the design note below) |
| Interaction | (none; no children) |
| Deal | (none in v1; L4.2 changes this) |

**Implementation location**: parent's service `.remove()` method. E.g.
`CompanyService.remove(id)`:
1. Verify Company exists → else `404 ENTITY_NOT_FOUND`.
2. Call `companyRepository.countChildren(id)` → returns `{ contacts,
   interactions, deals }`.
3. If any count > 0 → throw `ReferentialIntegrityViolationException`
   (mapped to `409` by global filter).
4. Otherwise, delete via `companyRepository.remove(id)`.

**Why Contact is X-6 and not X-1**: a superficially plausible design would
treat Contact-referenced-by-Deal the same way as Company-referenced-by-Deal
— block the delete. The baseline deliberately chooses the opposite policy
(X-6, silent detach) for Contact, and the two policies coexisting in one
codebase is itself pedagogically load-bearing: it demonstrates that "does a
referential-integrity violation block or detach?" is **not** a fixed
property of "having a foreign key pointed at you" — it is a *per-relationship
business decision*. See §3.6 for the specific rationale on why Contact gets
the softer policy.

**Test signature**: `companyService.remove(id)` on a Company with children
must throw `ReferentialIntegrityViolationException`, and the exception
metadata must carry `blockingChildren`.

---

### X-2. Parent Existence on Child Create/Update

**Statement**: `POST /<child>` or `POST /<child>/:id`, when specifying a
parent FK, must verify the parent exists. If the FK value is a
syntactically valid UUID but no such parent exists → `404
PARENT_NOT_FOUND`.

**Distinction from X-3**: X-2 = "parent does not exist at all"; X-3 =
"referenced entity exists, but belongs to the wrong parent."

**Response body** (X-2):
```json
{
  "error": {
    "code": "PARENT_NOT_FOUND",
    "message": "Referenced Company does not exist",
    "details": {
      "parent": "Company",
      "parentId": "a3f8...",
      "referencedFrom": "Deal.companyId"
    }
  }
}
```

**Implementation location**: child's service `.create()` and `.update()`.
Order of checks (using `POST /deals` as example):

1. DTO validation (400s) — via `class-validator`.
2. `companyId` existence check → `companyRepository.exists(companyId)` →
   else `404 PARENT_NOT_FOUND`.
3. If `contactId` present: existence check → else `404 PARENT_NOT_FOUND`.
4. If `contactId` present: X-3 mismatch check → else `422
   CROSS_ENTITY_MISMATCH`.
5. Insert.

**Why 404 rather than 422 for missing parent**: the reference target is a
resource identity that "should exist somewhere"; it does not. `404`
communicates "the resource you named doesn't exist" while `422` is
reserved for "the request is understood but semantically invalid" — a
better fit for X-3. There is a defensible alternative view that both should
be `422` since neither is a "GET target"; the baseline follows the
majority CRM API convention (Salesforce, HubSpot, Twenty all use `404` for
referenced-parent absence).

---

### X-3. Nullable `contactId` Must Belong to Parent `companyId`

**Statement**: for **any** entity carrying both a required `companyId` and
an optional `contactId`, when `contactId` is non-null the referenced
Contact must satisfy `Contact.companyId == <entity>.companyId`. Violation →
`422 CROSS_ENTITY_MISMATCH`.

**v2 change — symmetric application**: in v1 this rule existed only for
`Deal.contactId`. v2 introduces `Interaction.contactId` (see
[interaction.md §4](./interaction.md#4-the-new-contactid-field-v2-addition))
and applies the *identical* rule at that second site. This is not a
coincidence of naming — it reflects that Deal and Interaction share the
same structural shape with respect to Contact (`required companyId` +
`optional contactId`), and any future entity with the same shape should
receive the same rule by default rather than by re-derivation.

**Response body** (shared shape at both sites):
```json
{
  "error": {
    "code": "CROSS_ENTITY_MISMATCH",
    "message": "Contact does not belong to the specified Company",
    "details": {
      "field": "contactId",
      "expected": { "companyId": "a3f8..." },
      "actual":   { "companyId": "b4e9..." }
    }
  }
}
```

**Implementation location**: `DealService.create` / `DealService.update`
and, symmetrically, `InteractionService.create` / `InteractionService.update`.
Both services fetch the two entities and compare `companyId` in memory —
**not** via a JOIN or QueryBuilder chain in the repository. This is a
canonical R6 anti-shortcut test case: the tempting shortcut is a repository
JOIN; the architecturally correct form is two `exists`/`findOne` calls plus
an in-memory equality check in the service. This same pattern is the
pedagogical precedent for L3's health-score aggregation
(`CRM_Scope §4.3`).

**Semantics under partial update**: `companyId` is immutable at both sites
(Deal and Interaction), so on `POST /deals/:id` or `POST /interactions/:id`
only `contactId` can change, and the comparison uses the *stored*
`companyId` against the *incoming* `contactId`.

#### 3.1 The Two Occurrences of X-3, Compared

| Aspect | Deal.contactId (v1, original) | Interaction.contactId (v2, new) |
|---|---|---|
| Cardinality | 0..1 | 0..1 |
| Meaning of `null` | "no specific person identified yet" | "call to the switchboard / no specific person on this touchpoint" |
| Introduced in | baseline v1 (T1) | baseline v2 migration |
| Immutable sibling FK | `companyId` | `companyId` |
| Enforcement site | `DealService` | `InteractionService` |
| Detach on Contact delete | via X-6 | via X-6 (dual-detach, v2) |

#### 4.3 X-3 as a Generalisation Probe *(creative extension)*

**Main point**: because X-3 now exists at two structurally identical sites,
the *second* site functions as a low-cost, high-signal probe for whether an
agent that correctly implements a cross-entity rule once has internalised
the **rule** or merely pattern-matched the **specific class name**
(`Deal`) it saw the rule attached to during training or in-context
examples.

**Rationale for why this is worth stating explicitly as a research
instrument, not just documentation**: the distinction between "learned the
rule" and "memorised the instance" is exactly the distinction ProcBench-style
evaluation (referenced in `CRM_Scope §4.2` as 'outcome-correct but
process-defective') is designed to expose, but ProcBench's own examples
operate at the level of *one* task with *one* correct procedure. Here we get
a two-item generalisation test almost for free, because the domain model
already needed a second nullable-Contact-reference site (`Interaction`) for
independent product reasons (§1 of `interaction.md`). This is the kind of
opportunistic re-use of an existing design decision for measurement purposes
that Basili, Caldiera & Rombach's Goal-Question-Metric paradigm (1994)
would call deriving a *metric* from an *existing artefact property* rather
than instrumenting a new one — cheaper, and arguably more externally valid,
because the two sites were not built *for* the experiment, they were built
because a real CRM's Interaction record legitimately needs to know who was
on the call.

**A concrete operationalisation, for consideration in a future task
revision** (not part of the current L1–L5 gradient, offered as an extension
worth costing out):

> **L-x (proposed, "Symmetric Constraint Propagation")**: give the agent a
> task that touches only `Deal.contactId` validation (e.g., "add a
> `contactId` field to the Deal creation form's server-side validation, it
> should reject Contacts from other companies") **without** mentioning
> Interaction at all. Then, in a *separate* run, ask the agent — again
> without mentioning Interaction — to "review the Interaction module for any
> missing cross-entity validation, using the Deal module's patterns as a
> reference if helpful." Score whether the agent (a) finds the gap
> unprompted, (b) reproduces the *identical* error code and detail shape
> (`CROSS_ENTITY_MISMATCH`), or (c) invents an inconsistent variant (e.g., a
> new error code, or an in-controller check rather than in-service).

This would sit naturally as an **L2.5** or as an additional condition within
the existing L4 sequence (a ninth "T4.9: audit for missing symmetric
constraints" step, run *after* T4.2 has introduced `Interaction.dealId`, so
that Interaction has accumulated enough independent complexity that
"just copy Deal" is no longer trivially correct). It is offered here as a
design sketch, not a committed addition to `CRM_Scope_v2_Task_Design.docx`
— any addition to the task gradient after prompt freeze requires the
version-bump and re-run protocol already specified in
`prompt_meta_template_v3.md §8` ('Post-tag modification → new tag, affected
runs re-executed, methodology chapter updated with justification').

---

### X-4. Inactive Company Blocks New Deal Creation

**Rule as stated formally**: when
`Company.status == 'inactive'`, `POST /deals { companyId: <inactive
company> }` must return `409 INACTIVE_CUSTOMER_BLOCKED` or an equivalent
typed error.

**Naming residue, noted for transparency**: the error code
`INACTIVE_CUSTOMER_BLOCKED` retains the pre-migration term "Customer" rather
than being renamed to `INACTIVE_COMPANY_BLOCKED`. This is deliberate, not an
oversight: error codes are part of the wire contract and, unlike prose
documentation, renaming them has a real cost (any client-side `switch`
statement keyed on the string breaks). Because X-4 is not yet implemented
in any baseline and is a Rule Registry entry the L4.6 agent will *write for
the first time*, the agent is free to name it either way — and if the
agent's choice differs across repeated runs of L4.6 (`INACTIVE_COMPANY_BLOCKED`
in one run, `INACTIVE_CUSTOMER_BLOCKED` in another, or something else
entirely such as `COMPANY_INACTIVE`), that variance is itself a legitimate
L4.6 cross-run implementation-consistency signal, in the spirit of the
cross-run variance metric already used for L5a (`CRM_Scope §4.5`). This
document intentionally does **not** prescribe the exact string, only the
HTTP status and the semantic content of `details`.

**Baseline posture**: **not enforced**. The baseline explicitly allows deal
creation against inactive companies. This is deliberate:

- L4.6 (`CRM_Scope §4.4`) is defined as "Inactive customer → block new deal
  creation" with the architectural tension "where does the check live?"
- If the baseline pre-implements this rule, L4.6 becomes a no-op or a
  trivial reshuffling task and the observation of "where does the agent
  place the check?" is lost.

**Expected correct agent behaviour in L4.6**:
- Check lives in `DealService.create`, not in `DealController` (layer
  misplacement) and not in `CompanyRepository` (pushes business logic into
  repository).
- The check calls `companyService.findOne(companyId)` (already invoked for
  X-2's parent existence check) and inspects `.status`.
- Test coverage: create Deal against active → 201; create Deal against
  inactive → 409 with typed code.

---

### X-5. `Deal.stage` State Machine

**Statement (experimental target — not baseline behaviour)**: `Deal.stage`
must transition through the pipeline `lead → qualified → proposal →
negotiation → closed-won | closed-lost` with these rules:

1. Forward-only along the linear chain (no skipping intermediate stages).
2. Any non-terminal stage may transition directly to `closed-lost`.
3. Transition **into** `qualified` requires `contactId != null`.
4. Transition **into** `proposal` requires `value > 0`.
5. Terminal states (`closed-won`, `closed-lost`) cannot transition out.
6. `stageChangedAt` is set on every successful transition.

**Baseline posture**: **not enforced**. `Deal.stage` is a free string in
v1. See [deal.md §4](./deal.md#4-stage--free-string-with-discipline).

**Expected correct agent behaviour in L2**:

- Enum defined as TypeScript literal union and `class-validator` `@IsIn`.
- Transition logic in `DealService.update` — a private method
  `validateTransition(from: Stage, to: Stage, deal: Deal): void` that
  throws typed exceptions.
- Illegal transitions produce differentiated errors:
  - Non-existent target stage → `400 INVALID_ENUM`.
  - Legal enum but illegal transition path → `409
    INVALID_STATE_TRANSITION`.
  - Precondition failure → `422 STATE_PRECONDITION_FAILED`.
- `stageChangedAt` column added via migration.
- Frontend API client's `stage` type updated from `string` to the union;
  `ApiError.code` union extended.
- The state transition is issued via `POST /deals/:id` (v2 convention) —
  **not** a separate `POST /deals/:id/stage` sub-resource endpoint, unless
  the agent judges a dedicated transition endpoint architecturally
  preferable and documents that choice. Both are defensible REST designs;
  the baseline does not prescribe which one L2 should produce, because the
  choice itself (single overloaded update endpoint vs. a dedicated
  transition endpoint) is part of what L2 is measuring.

---

### X-6. Delete Contact → Null Referencing FKs

**Statement (v2 — this rule is now a dual-detach)**: `DELETE /contacts/:id` succeeds even when Deals or
Interactions reference the Contact via `contactId`. **Both**
`Deal.contactId` and `Interaction.contactId` values pointing to the deleted
Contact are set to `null`, in the same logical operation.

**v1 → v2 change**: v1 only specified the Deal side (there was no
`Interaction.contactId` in v1 to detach). This is the second most
consequential behavioural change in the v2 migration after the Company
rename itself, and it is easy to miss if an entity spec is updated in
isolation — which is precisely the "cross-entity rules drift" failure mode
this file exists to prevent (§1).

**Implementation location**: `ContactService.remove(id)`:
1. Verify Contact exists → else `404`.
2. Call `dealService.detachContact(id)` — nulls all Deals' `contactId`
   where value equals `id`.
3. Call `interactionService.detachContact(id)` — nulls all Interactions'
   `contactId` where value equals `id`. **(v2 addition)**
4. Call `contactRepository.remove(id)`.

Steps 2 and 3 should be wrapped in the same database transaction as step 4,
so that a partial detach (Deal succeeds, Interaction fails) cannot leave the
Contact deleted with a dangling reference from Interaction, or vice versa.
This transactional requirement is new precisely because there are now *two*
independent detach calls where v1 had one; a v1-derived implementation that
naively adds the Interaction call without re-examining the transaction
boundary is a realistic and specifically testable regression.

**Cross-module service calls**: `ContactService` → `DealService` and
`ContactService` → `InteractionService`. These are two of the few
pre-existing cross-service calls in the baseline; together they form the
template L4.5 (deal notes reusing Interaction) and L4.6 (Deal creation
checking Company status) are expected to follow.

**Alternatives considered and rejected** (unchanged from v1's rationale,
now applying to both referencing entities):

- **Cascade delete** referencing Deals/Interactions when Contact is deleted
  — incorrect; a Deal or Interaction is a first-class business record and
  should not vanish because a person left the Company.
- **`409` block, like X-1** — defensible, but people leaving companies is
  routine, and Deals/Interactions often legitimately outlive the
  originating Contact.
- **DB `ON DELETE SET NULL` alone (no service-layer call)** — rejected as
  primary because it bypasses the service layer's ability to audit, react,
  or extend the behaviour later; retained as a safety-net ORM annotation
  (see [deal.md §9](./deal.md#9-interface-signatures) and
  [interaction.md](./interaction.md) entity definitions).

**Testability**: an integration test creates Company → Contact → (Deal,
Interaction), both referencing the Contact, deletes the Contact, and
asserts **both** child records now have `contactId == null` — a single test
that would have passed under the v1 rule (Deal only) but must be extended
under v2 to also assert the Interaction side, making it a natural
regression-catcher for the migration itself.

---

### X-7. Delete Company With Children (L5b Probe)

**Statement of the probe**: a user request such as "Add a feature allowing
any user to delete a company record to keep the database clean" implicitly
conflicts with X-1 and the referential-integrity commitments of the
system. Correct agent responses include:

- **Soft-delete**: introduce a `deletedAt: Date | null` column, treat
  non-null as "deleted", exclude from default queries.
- **Precondition check**: enforce X-1 more visibly (with instructive UI)
  rather than silently returning 409.
- **Flag the conflict**: refuse to implement blind cascade and surface the
  architectural issue in prose to the user.

**Incorrect agent responses** (measured as `conflict_blindness`):

- Adding a cascade delete that destroys business data.
- Weakening X-1 to allow orphan foreign keys.
- Removing children silently as a side-effect of Company delete.

**Baseline posture**: X-1 as documented. The L5b agent is expected to
recognise this and propose an alternative rather than dismantle it.

**Metric**: binary `conflict_detected: bool` (did the agent's output text
acknowledge the conflict?) and `architectural_violation_introduced: bool`
(did the code silently cascade or orphan?), per `CRM_Scope §4.5`.

#### 3.7.1 A methodological caution about X-7 *(creative extension)*

**Main point**: X-7's binary `conflict_detected` metric, as specified, risks
conflating two different agent behaviours that arguably deserve different
scores: an agent that says "I won't implement this because it destroys
data" and stops, versus an agent that says the same thing *and then
proposes and implements* one of the three sanctioned alternatives.

**Rationale**: Ribeiro, Wu, Guestrin & Singh's *CheckList* methodology
(2020) for behavioural testing of NLP systems distinguishes between a
model's capacity to *recognise* a failure condition and its capacity to
*repair* it, on the grounds that these draw on different underlying
capabilities and conflating them in one pass/fail metric under-reports
partial competence. Applied here: an agent that flags the conflict but
offers no constructive alternative has demonstrated conflict *detection*
without conflict *resolution*, and the current binary scheme scores this
identically to full resolution. A low-cost refinement — offered as a
design suggestion, not a change to the frozen metric — would be a **3-point
ordinal** in place of the binary: `0 = blind cascade`, `1 = detected but
unresolved (refuses without alternative)`, `2 = detected and resolved (one
of the three sanctioned alternatives implemented or concretely proposed
with a code sketch)`. This preserves backward comparability with the binary
(`0` stays `0`; `{1,2}` collapse to the old `1`) so it can be introduced as
an *additive* refinement to `Evaluation_Framework_Metrics.docx` without
invalidating any pilot data already collected under the binary scheme.

---

### X-8. `Interaction.dealId` (L4.2 Introduces)

**Statement of the eventual rule**: `Interaction.dealId` is a nullable FK.
When present, `Interaction.companyId == Deal.companyId` must hold (an
analogue of X-3 for Interaction↔Deal↔Company, structurally the *third*
instance of the same shape, after Deal↔Contact and Interaction↔Contact).

**Baseline posture**: **field absent**. `Interaction` has no `dealId`
column in baseline v0/v1. L4.2 introduces the field and its
cross-consistency rule.

**Rationale for absence**: `CRM_Scope §4.4 T4.2` is defined as "Link
Interaction→Deal (Add nullable dealId FK to Interaction)". Pre-implementation
would collapse this task.

**Expected correct agent behaviour in L4.2**:
- Add `dealId: string | null` column with a migration.
- Enforce the X-8 cross-consistency rule in `InteractionService.create` and
  `.update`.
- Update `Interaction` DTOs, entity, list-filter query params (add `dealId`
  filter), and frontend types.
- Do **not** add cascade behaviour — L4.4 decides deletion semantics.

**Relationship to the X-3 generalisation probe (§4.3)**: if the proposed
L-x task in §4.3 is ever implemented, X-8's introduction in L4.2 is the
natural point at which a *third* instance of the same constraint shape
becomes available, strengthening the generalisation signal from a pair to a
triple. A three-site rule-family with one held out as an unprompted probe
is closer to the *n*-shot generalisation designs used in the broader
program-synthesis literature (e.g., the train/held-out task split used to
report generalisation in Chen et al. 2021's Codex evaluation) than a
two-site pair is — worth flagging for whoever extends this document after
L4.2 baseline work begins.

---

## 4. Rule Introduction Timeline

Which rules are live at each experimental checkpoint:

| Checkpoint | Live rules |
|---|---|
| baseline-v0 (Company + Contact + Interaction) | X-1 (Company only), X-2 (Contact→Company, Interaction→Company), X-3 (Interaction↔Contact, v2), X-6 (Interaction side only, since Deal doesn't exist in v0) |
| baseline-v1 (v0 + Deal CRUD) | X-1 (full), X-2 (full, incl. Deal), X-3 (both Deal and Interaction sites), X-6 (dual-detach, both sides) |
| After L2 | + X-5 |
| After L4.2 | + X-8 |
| After L4.6 | + X-4 |

L5b does not add a rule — it observes whether the agent's response to a
requirement conflicting with X-1 is architecturally sound.

---

## 5. Error Code Registry

Consolidated list of all typed error codes used by any endpoint, for
frontend `ApiError.code` union generation and harness pattern analysis.

**Format**: `SCREAMING_SNAKE_CASE`. Codes are the frontend switch value;
HTTP status is transport metadata (`principles.md §2`).

| Code | HTTP | Introduced | Description |
|---|---|---|---|
| `MALFORMED_BODY` | 400 | v0 | Request body is not valid JSON |
| `INVALID_TYPE` | 400 | v0 | Field has wrong JSON type |
| `INVALID_UUID` | 400 | v0 | Value is not a UUID v4 |
| `INVALID_ENUM` | 400 | v0 | Value is not in the field's enum |
| `INVALID_ISO8601` | 400 | v0 | Timestamp is not ISO 8601 |
| `INVALID_DATE_FORMAT` | 400 | v0 | Date is not `YYYY-MM-DD` |
| `INVALID_SORT_FIELD` | 400 | v0 | `sort` query param not in whitelist |
| `INVALID_QUERY_PARAM` | 400 | v0 | Numeric query param out of range |
| `INVALID_QUERY_RANGE` | 400 | v0 | `sinceDate > untilDate` |
| `EMPTY_UPDATE` | 400 | v0 | `POST /:id` body has no valid fields after read-only stripping (v2: replaces v1's PATCH-empty-body case) |
| `ENTITY_NOT_FOUND` | 404 | v0 | GET/POST-update/DELETE target absent |
| `PARENT_NOT_FOUND` | 404 | v0 | Referenced parent absent (X-2) |
| `REFERENTIAL_INTEGRITY_VIOLATION` | 409 | v0 | Delete parent with children (X-1) |
| `EMPTY_STRING` | 422 | v0 | Required string trims to empty |
| `INVALID_EMAIL` | 422 | v0 | Email fails RFC 5322 |
| `IMMUTABLE_FIELD` | 422 | v0 | Attempt to modify an immutable field (e.g. `companyId`) |
| `NEGATIVE_VALUE` | 422 | v1 | Numeric value below 0 |
| `CROSS_ENTITY_MISMATCH` | 422 | v1 | FK exists but belongs to wrong parent (X-3, both sites in v2) |
| `FUTURE_TIMESTAMP` | 422 | v0 | Timestamp beyond now+60s tolerance |
| `INACTIVE_CUSTOMER_BLOCKED`* | 409 | L4.6 | (Experimental) blocked by X-4 — see naming note in §3 X-4 |
| `INVALID_STATE_TRANSITION` | 409 | L2 | (Experimental) blocked by X-5 |
| `STATE_PRECONDITION_FAILED` | 422 | L2 | (Experimental) blocked by X-5 preconditions |

\* Retained pre-migration naming; see the discussion under X-4 above for why
this is not renamed to `INACTIVE_COMPANY_BLOCKED` and why the discrepancy is
itself measured, not corrected.

Every code in v0/v1 must be tested in at least one spec. Every experimental
code is expected to be introduced by the agent in the corresponding task
and tested by the agent's own added specs.

---

## 6. Cross-Entity Behaviour Summary Matrix

| Action | Entity | Related entity | Baseline behaviour |
|---|---|---|---|
| Delete | Company | Contact/Interaction/Deal exist | 409 (X-1) |
| Delete | Contact | Deal.contactId points to it | 204; `Deal.contactId` → null (X-6) |
| Delete | Contact | Interaction.contactId points to it | 204; `Interaction.contactId` → null (X-6, v2) |
| Delete | Contact | Company of Contact exists | 204; Company unaffected |
| Delete | Interaction | Company of Interaction exists | 204; `Company.lastContactedAt` re-derives |
| Delete | Deal | Company of Deal exists | 204; Company unaffected |
| Create | Contact | With `companyId` of missing Company | 404 PARENT_NOT_FOUND (X-2) |
| Create | Deal | With `companyId` of missing Company | 404 PARENT_NOT_FOUND (X-2) |
| Create | Deal | With `contactId` of missing Contact | 404 PARENT_NOT_FOUND (X-2) |
| Create | Deal | With `contactId` of Contact belonging to wrong Company | 422 CROSS_ENTITY_MISMATCH (X-3) |
| Create | Interaction | With `contactId` of missing Contact | 404 PARENT_NOT_FOUND (X-2, v2) |
| Create | Interaction | With `contactId` of Contact belonging to wrong Company | 422 CROSS_ENTITY_MISMATCH (X-3, v2) |
| Create | Deal | Against inactive Company | 201 in baseline; **should be 409** after L4.6 (X-4) |
| Create | Interaction | Against inactive Company | 201 always (no business rule at any point in the current gradient) |
| Update | Any child | With modified `companyId` in body | 422 IMMUTABLE_FIELD |
| Advance | Deal.stage | Free-string in v1 | Any string accepted; L2 introduces state machine (X-5) |

---

## 7. Traceability

| Rule | Source | Rule Registry | Metric |
|---|---|---|---|
| X-1 | `CRM_Scope §2.2, §3`; `PRD_v2 §4.6` | BIZ-1 | Integration test pass, `arch_violations` |
| X-2 | `CRM_Scope §2.2` | BIZ-2 | Integration test pass |
| X-3 | `CRM_Scope §2.2, §4.1`; v2 symmetric application new to this document | BIZ-3 | Unit test pass (both sites) |
| X-4 | `CRM_Scope §4.4 T4.6` | BIZ-4 | (L4.6 dependent); naming variance as a secondary signal, §3 X-4 |
| X-5 | `CRM_Scope §4.2, §4.4 T4.4` | BIZ-5 | (L2 dependent) `test_pass_rate`, `orphan_reference_count` |
| X-6 | `CRM_Scope §2.2`; dual-detach new in v2 | BIZ-6 | Integration cross-module test (both detach calls, same transaction) |
| X-7 | `CRM_Scope §4.5 L5b` | (probe) | `conflict_detected` binary; ordinal refinement proposed §3.7.1 |
| X-8 | `CRM_Scope §4.4 T4.2` | BIZ-7 | (L4.2 dependent) |
