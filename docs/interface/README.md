# CRM Baseline API Documentation — v2

> **Status**: synchronised with `PRD_v2.docx`. Reflects three structural
> changes relative to v1: (1) `Customer` → `Company`; (2) `PATCH` removed,
> `POST` overloaded for create/update; (3) `Interaction.contactId` added
> with a symmetric `X-3` rule. See `PRD_v2.docx §1.2` for the full migration
> rationale.

## Reading order

1. **[principles.md](./principles.md)** — cross-cutting conventions: error
   envelope, the POST double-role convention, status codes, pagination,
   null semantics, timestamps, naming. Read this first — every other
   document assumes it.
2. **[errors.md](./errors.md)** — current backend error envelope, business
   error code registry, validation/UUID error flow, and where to change them.
3. **[company.md](./company.md)** — Company resource. Root aggregate
   (formerly "Customer" in v1).
4. **[contact.md](./contact.md)** — Contact resource. Child of Company.
5. **[interaction.md](./interaction.md)** — Interaction resource. Child of
   Company, **optionally** of Contact (new in v2). Feeds
   `Company.lastContactedAt`.
6. **[deal.md](./deal.md)** — Deal resource. Child of Company, optionally
   references Contact. **Only exists in `baseline-v1`.**
7. **[cross-entity.md](./cross-entity.md)** — rules spanning multiple
   entities: referential integrity, cross-references, state machines, the
   L5b conflict probe, and the full error-code registry. Read this after
   all entity specs — it is where the v2 migration's two most consequential
   behavioural changes live (symmetric `X-3`, dual-detach `X-6`).

## Version scope

| Version | Contains |
|---|---|
| `baseline-v0` | Company + Contact + Interaction |
| `baseline-v1` | `baseline-v0` + Deal |

Anything marked "L2", "L3", "L4.x", "L5a", "L5b" is **not** in the baseline;
those are experimental tasks the agent will produce and are documented here
only to make the baseline's deliberate omissions auditable.

## What changed in v2 (quick reference)

| Change | Where documented | Affects |
|---|---|---|
| `Customer` → `Company`; `customerId` → `companyId` | every file, `PRD_v2 §1.2.1` | all 6 files, `openapi.yaml`, frontend types |
| `PATCH` removed; `POST /resource` creates, `POST /resource/:id` updates | [principles.md §3](./principles.md#3-http-method-semantics-v2--post-only-for-writes), `PRD_v2 §1.2.2` | every endpoint table in every entity file |
| `Interaction.contactId` added (nullable, X-3 symmetric) | [interaction.md §4](./interaction.md#4-the-new-contactid-field-v2-addition) | interaction.md, cross-entity.md X-3, deal.md (comparison table) |
| `Contact` delete now **dual-detaches** (Deal *and* Interaction) | [cross-entity.md X-6](./cross-entity.md#x-6-delete-contact--null-referencing-fks) | contact.md, deal.md, interaction.md |

**PATCH sensor note**: because the baseline is POST-only by design, any
`PATCH` route an agent introduces in L1/L4 is itself a measurable signal
(specification gap-filling in the sense of `CRM_Scope §4.5`) — see
[principles.md §3.1](./principles.md#31-the-post-double-role-convention)
for the full argument. This property should be reported in the dissertation
regardless of whether it was the primary research question, since it costs
nothing to observe and bears on the "agent prior vs. in-context instruction"
question raised in `PRD_v2 §1.2.2`.

## Outstanding pre-freeze item

`T1_minimal.md` and `T1_structured.md` still name `PATCH /deals/:id` and
`customerId` in their Interface block (Block 5) and Requirements block
(Block 4). These must be updated and re-hashed (SHA-256 of Blocks 3+4+5,
per `prompt_meta_template_v3.md §5` S1) **before** the next
`prompts-frozen-v4` tag. See [deal.md §12.1](./deal.md#121-pre-freeze-checklist-v1--v2-migration)
for the itemised checklist.

## Machine-readable contract

`backend/openapi.yaml` is generated to reflect these documents and is the
single source of truth for `frontend/src/services/api/types/generated.ts`.
Any change to these documents must be accompanied by a matching change to
`openapi.yaml` in the same commit. The v2 migration additionally requires
regenerating `openapi.yaml` from scratch rather than patching it, since the
resource path prefix itself changed (`/customers` → `/companies`).

## Traceability convention

Every non-trivial statement in these documents cites its source:

- `PRD_v2.docx §X.Y` — the product requirements document (authoritative for
  the three v2 structural changes)
- `CRM_Scope_v2_Task_Design.docx §X.Y` — the experimental scope document
- `Rule_Registry_v0.1.md` — the rule ID registry (R1..R7)
- `T1_minimal.md`, `T1_structured.md` — task prompts (pending re-freeze,
  see above)
- `principles.md §N`, `cross-entity.md X-N` — internal references

Rules referenced by ID (`X-1`, `I-Co-3`, `I-D-9`, `R6`) are stable across
versions; if a rule's semantics changes, the ID is retired and a new ID is
allocated rather than reused. The one exception, documented explicitly
where it occurs, is the error code `INACTIVE_CUSTOMER_BLOCKED`
([cross-entity.md X-4](./cross-entity.md#x-4-inactive-company-blocks-new-deal-creation)),
which retains its pre-migration name because it is part of the wire
contract rather than internal documentation prose, and its eventual
agent-chosen spelling is itself an L4.6 measurement target.

## Anchor-integrity note

All cross-file links in this document set (`[text](./file.md#anchor)`) were
verified programmatically against GitHub-flavoured-Markdown header slugs
before this freeze. If you rename a header in any of the six files, re-run
the anchor check before committing — a silently broken cross-reference in
documentation has the same practical effect as an undefined symbol
reference in code: it is invisible until a reader (or an agent) follows it.
