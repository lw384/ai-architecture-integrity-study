// Functional acceptance suite for T3 (Deal pipeline state machine).
//
// Overlaid by the experiment runner into:
//   <workspace>/backend/test/acceptance/T3/deal-stage.e2e-spec.ts
// Both prompt strategies run these same behavioural assertions, derived from
// their identical "## 4. Requirements" sections. T3 runs after T2, whose
// Minimal prompt leaves several HTTP field names open while Structured fixes
// them. Narrow helpers discover and normalize only those transport differences.
import { execSync } from "node:child_process";
import { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import request from "supertest";
import { createTestApp } from "../../setup/test-app";
import {
  closeTestDataSource,
  resetDatabaseSchema,
} from "../../setup/test-database";
import {
  normalizeResponse,
  recordFieldMapping,
} from "./acceptance-adapter";

jest.setTimeout(60000);

const UNKNOWN_UUID = "7f4f54f7-cd3c-4ef2-b22d-8f1d68d9f1aa";
const CANONICAL_STAGES = [
  "lead",
  "qualified",
  "active",
  "negotiation",
  "closed_won",
  "closed_lost",
] as const;

type DealStage = (typeof CANONICAL_STAGES)[number];

const ALLOWED_TARGETS: Record<DealStage, DealStage[]> = {
  lead: ["qualified", "closed_lost"],
  qualified: ["active", "closed_lost"],
  active: ["negotiation", "closed_lost"],
  negotiation: ["closed_won", "closed_lost"],
  closed_won: [],
  closed_lost: ["lead"],
};

const SUCCESSFUL_TRANSITIONS = CANONICAL_STAGES.flatMap((source) => [
  [source, source] as const,
  ...ALLOWED_TARGETS[source].map((target) => [source, target] as const),
]);

const INVALID_TRANSITIONS = CANONICAL_STAGES.flatMap((source) =>
  CANONICAL_STAGES.filter(
    (target) => target !== source && !ALLOWED_TARGETS[source].includes(target),
  ).map((target) => [source, target] as const),
);

type DealContactLink = {
  contactId: string;
  role: string | null;
};

type ContactPayload = {
  companies: Array<{ id: string; isPrimary: boolean }>;
  name: string;
  email: string;
  phone: string;
  role?: string | null;
};

type DealPayload = {
  name: string;
  value: number;
  companyId: string;
  stage?: string;
  expectedCloseDate?: string | null;
  contactLinks?: DealContactLink[];
  primaryContactId?: string | null;
};

type StageFixtureOptions = {
  withContacts?: boolean;
  expectedCloseDate?: string | null;
};

type RelationshipContract = {
  contactCompanyKey: "id" | "companyId";
  dealLinksKey: "contactLinks" | "contacts";
};

type JsonRecord = Record<string, unknown>;

let relationshipContract: RelationshipContract;

describe("T3 Deal pipeline API (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let seq = 0;

  beforeAll(async () => {
    await resetDatabaseSchema();
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await truncateBusinessData(dataSource);
    relationshipContract = await discoverRelationshipContract();
    await truncateBusinessData(dataSource);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await closeTestDataSource();
  });

  // Checkpoint 1 - Requirements 1-4 and error semantics 25/26.
  describe("checkpoint 1: controlled vocabulary and initial stage", () => {
    it('defaults an omitted stage to "lead"', async () => {
      const company = await createCompany("default-stage");
      const payload = buildDealPayload("default-stage", {
        companyId: company.id,
      });
      delete payload.stage;

      const created = await request(app.getHttpServer())
        .post("/api/deals")
        .send(serializeDealPayload(payload))
        .expect(201);
      const detail = await getDeal(extractCreatedEntityId(created.body, "deal"));
      expect(detail.stage).toBe("lead");
    });

    it.each(["lead", "qualified"] as const)(
      "accepts %s as an initial stage",
      async (stage) => {
        const company = await createCompany(`initial-${stage}`);
        const created = await createDeal(`initial-${stage}`, {
          companyId: company.id,
          stage,
        });
        expect((await getDeal(created.id)).stage).toBe(stage);
      },
    );

    it.each(["active", "negotiation", "closed_won", "closed_lost"] as const)(
      "rejects %s as an initial stage",
      async (stage) => {
        const company = await createCompany(`invalid-initial-${stage}`);
        const response = await request(app.getHttpServer())
          .post("/api/deals")
          .send(
            serializeDealPayload(
              buildDealPayload(`invalid-initial-${stage}`, {
                companyId: company.id,
                stage,
              }),
            ),
          )
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          statusCode: 400,
          code: "INVALID_INITIAL_STAGE",
        });
      },
    );

    it("rejects an unrecognised initial stage as UNKNOWN_STAGE", async () => {
      const company = await createCompany("unknown-initial");
      const response = await request(app.getHttpServer())
        .post("/api/deals")
        .send(
          serializeDealPayload(
            buildDealPayload("unknown-initial", {
              companyId: company.id,
              stage: "quailified",
            }),
          ),
        )
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 400,
        code: "UNKNOWN_STAGE",
      });
    });
  });

  // Checkpoint 2 - Requirements 5-12 and error semantics 27. This is a full
  // table-driven check of every canonical source/target pair.
  describe("checkpoint 2: transition matrix", () => {
    it.each(SUCCESSFUL_TRANSITIONS)(
      "allows %s -> %s through the dedicated endpoint",
      async (source, target) => {
        const fixture = await createDealAtStage(
          `allowed-${source}-${target}`,
          source,
          { withContacts: true, expectedCloseDate: "2026-10-31" },
        );

        const response = await request(app.getHttpServer())
          .post(`/api/deals/${fixture.id}/stage`)
          .send({ stage: target })
          .expect(200);

        expect(response.body.stage).toBe(target);
        expect((await getDeal(fixture.id)).stage).toBe(target);
      },
    );

    it.each(INVALID_TRANSITIONS)(
      "rejects %s -> %s and preserves the stored stage",
      async (source, target) => {
        const fixture = await createDealAtStage(
          `invalid-${source}-${target}`,
          source,
          { withContacts: true, expectedCloseDate: "2026-10-31" },
        );

        const response = await request(app.getHttpServer())
          .post(`/api/deals/${fixture.id}/stage`)
          .send({ stage: target })
          .expect(422);

        expect(response.body).toMatchObject({
          success: false,
          statusCode: 422,
          code: "INVALID_STAGE_TRANSITION",
        });
        expect((await getDeal(fixture.id)).stage).toBe(source);
      },
    );
  });

  // Checkpoint 3 - Requirements 13-16 and error semantics 28.
  describe("checkpoint 3: transition preconditions", () => {
    it("rejects qualified -> active when the Deal has zero linked Contacts", async () => {
      const fixture = await createDealAtStage(
        "active-without-contact",
        "qualified",
        { withContacts: false, expectedCloseDate: null },
      );

      const response = await request(app.getHttpServer())
        .post(`/api/deals/${fixture.id}/stage`)
        .send({ stage: "active" })
        .expect(422);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 422,
        code: "TRANSITION_PRECONDITION_UNMET",
      });
      expect((await getDeal(fixture.id)).stage).toBe("qualified");
    });

    it("allows qualified -> active with T2 Contact links and preserves relationship data", async () => {
      const company = await createCompany("active-with-contacts");
      const contactA = await createContact("active-contact-a", company.id);
      const contactB = await createContact("active-contact-b", company.id);
      const links: DealContactLink[] = [
        { contactId: contactA.id, role: "decision-maker" },
        { contactId: contactB.id, role: "legal" },
      ];
      const deal = await createDeal("active-with-contacts", {
        companyId: company.id,
        stage: "qualified",
        contactLinks: links,
        primaryContactId: contactA.id,
      });

      await request(app.getHttpServer())
        .post(`/api/deals/${deal.id}/stage`)
        .send({ stage: "active" })
        .expect(200);
      const detail = await getDeal(deal.id);

      expect(detail.stage).toBe("active");
      expect(detail.contactLinks).toEqual(expect.arrayContaining(links));
      expect(detail.primaryContactId).toBe(contactA.id);
      expect(detail.companyId).toBe(company.id);
    });

    it("rejects active -> negotiation without an expected close date", async () => {
      const fixture = await createDealAtStage(
        "negotiation-without-date",
        "active",
        { withContacts: true, expectedCloseDate: null },
      );

      const response = await request(app.getHttpServer())
        .post(`/api/deals/${fixture.id}/stage`)
        .send({ stage: "negotiation" })
        .expect(422);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 422,
        code: "TRANSITION_PRECONDITION_UNMET",
      });
      expect((await getDeal(fixture.id)).stage).toBe("active");
    });

    it("allows active -> negotiation when the date is already stored", async () => {
      const fixture = await createDealAtStage(
        "negotiation-stored-date",
        "active",
        { withContacts: true, expectedCloseDate: "2026-11-30" },
      );

      const response = await request(app.getHttpServer())
        .post(`/api/deals/${fixture.id}/stage`)
        .send({ stage: "negotiation" })
        .expect(200);
      expect(response.body.stage).toBe("negotiation");
    });

    it("allows active -> negotiation when the generic update supplies the date atomically", async () => {
      const fixture = await createDealAtStage(
        "negotiation-same-request",
        "active",
        { withContacts: true, expectedCloseDate: null },
      );

      const response = await request(app.getHttpServer())
        .post(`/api/deals/${fixture.id}`)
        .send({
          stage: "negotiation",
          expectedCloseDate: "2026-12-31",
        })
        .expect(200);

      expect(response.body).toMatchObject({
        stage: "negotiation",
        expectedCloseDate: "2026-12-31",
      });
    });

    it("allows closing a no-Contact, no-date lead as lost", async () => {
      const fixture = await createDealAtStage("close-lost-no-data", "lead", {
        withContacts: false,
        expectedCloseDate: null,
      });

      const response = await request(app.getHttpServer())
        .post(`/api/deals/${fixture.id}/stage`)
        .send({ stage: "closed_lost" })
        .expect(200);
      expect(response.body.stage).toBe("closed_lost");
    });

    it("treats a same-stage request as a no-op without rechecking entry preconditions", async () => {
      const fixture = await createDealAtStage("same-active-no-op", "active", {
        withContacts: true,
      });
      await request(app.getHttpServer())
        .post(`/api/deals/${fixture.id}`)
        .send(serializeDealLinkUpdate([], null))
        .expect(200);

      const response = await request(app.getHttpServer())
        .post(`/api/deals/${fixture.id}/stage`)
        .send({ stage: "active" })
        .expect(200);
      expect(response.body.stage).toBe("active");
      expect(normalizeDeal(response.body).contactLinks).toEqual([]);
    });
  });

  // Checkpoint 4 - Requirements 17-19 and error semantics 25/27-29.
  describe("checkpoint 4: generic-update parity and errors", () => {
    it("produces the same successful result through generic and dedicated endpoints", async () => {
      const generic = await createDealAtStage("parity-generic", "lead");
      const dedicated = await createDealAtStage("parity-dedicated", "lead");

      const genericResponse = await request(app.getHttpServer())
        .post(`/api/deals/${generic.id}`)
        .send({ stage: "qualified" })
        .expect(200);
      const dedicatedResponse = await request(app.getHttpServer())
        .post(`/api/deals/${dedicated.id}/stage`)
        .send({ stage: "qualified" })
        .expect(200);

      expect(genericResponse.body.stage).toBe("qualified");
      expect(dedicatedResponse.body.stage).toBe("qualified");
    });

    it("returns the same invalid-transition error through both endpoints", async () => {
      const generic = await createDealAtStage("invalid-parity-generic", "lead");
      const dedicated = await createDealAtStage(
        "invalid-parity-dedicated",
        "lead",
      );

      for (const [id, path] of [
        [generic.id, `/api/deals/${generic.id}`],
        [dedicated.id, `/api/deals/${dedicated.id}/stage`],
      ] as const) {
        const response = await request(app.getHttpServer())
          .post(path)
          .send({ stage: "closed_won" })
          .expect(422);
        expect(response.body).toMatchObject({
          success: false,
          statusCode: 422,
          code: "INVALID_STAGE_TRANSITION",
        });
        expect((await getDeal(id)).stage).toBe("lead");
      }
    });

    it("returns the same precondition error through both endpoints", async () => {
      const generic = await createDealAtStage(
        "precondition-parity-generic",
        "qualified",
      );
      const dedicated = await createDealAtStage(
        "precondition-parity-dedicated",
        "qualified",
      );

      for (const [id, path] of [
        [generic.id, `/api/deals/${generic.id}`],
        [dedicated.id, `/api/deals/${dedicated.id}/stage`],
      ] as const) {
        const response = await request(app.getHttpServer())
          .post(path)
          .send({ stage: "active" })
          .expect(422);
        expect(response.body).toMatchObject({
          success: false,
          statusCode: 422,
          code: "TRANSITION_PRECONDITION_UNMET",
        });
        expect((await getDeal(id)).stage).toBe("qualified");
      }
    });

    it("updates a terminal Deal without revalidating stage when stage is omitted", async () => {
      const fixture = await createDealAtStage(
        "terminal-non-stage-update",
        "closed_won",
        { withContacts: true, expectedCloseDate: "2026-10-31" },
      );

      const response = await request(app.getHttpServer())
        .post(`/api/deals/${fixture.id}`)
        .send({ name: "Updated terminal Deal" })
        .expect(200);
      expect(response.body).toMatchObject({
        name: "Updated terminal Deal",
        stage: "closed_won",
      });
    });

    it.each([
      ["generic", (id: string) => `/api/deals/${id}`],
      ["dedicated", (id: string) => `/api/deals/${id}/stage`],
    ] as const)(
      "rejects an unknown stage through the %s endpoint",
      async (_label, pathFor) => {
        const fixture = await createDealAtStage(
          `unknown-stage-${_label}`,
          "lead",
        );
        const response = await request(app.getHttpServer())
          .post(pathFor(fixture.id))
          .send({ stage: "proposal_sent" })
          .expect(400);
        expect(response.body).toMatchObject({
          success: false,
          statusCode: 400,
          code: "UNKNOWN_STAGE",
        });
        expect((await getDeal(fixture.id)).stage).toBe("lead");
      },
    );

    it("returns 404 for a stage update on an unknown Deal", async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/deals/${UNKNOWN_UUID}/stage`)
        .send({ stage: "qualified" })
        .expect(404);

      // Shared Requirement 29 fixes this domain code for both strategies; it
      // is a behavioural assertion and deliberately is not strategy-adapted.
      expect(response.body).toMatchObject({
        success: false,
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });

    it("returns only canonical stages from Deal list and detail responses", async () => {
      const list = await request(app.getHttpServer())
        .get("/api/deals?page=1&pageSize=100")
        .expect(200);
      expect(list.body.items.length).toBeGreaterThan(0);
      expect(
        list.body.items.every((deal: { stage: string }) =>
          CANONICAL_STAGES.includes(deal.stage as DealStage),
        ),
      ).toBe(true);

      const detail = await getDeal(list.body.items[0].id);
      expect(CANONICAL_STAGES).toContain(detail.stage);
    });
  });

  async function createCompany(scope: string) {
    seq += 1;
    const response = await request(app.getHttpServer())
      .post("/api/companies")
      .send({
        name: `t3-company-${scope}-${seq}`,
        email: `t3-company-${seq}@test.local`,
        phone: `0300-${String(seq).padStart(4, "0")}`,
        website: `https://t3-company-${seq}.example.com`,
        industry: "OTHER",
      })
      .expect(201);
    return { id: response.body.companyId ?? response.body.id };
  }

  async function createContact(scope: string, companyId: string) {
    seq += 1;
    const response = await request(app.getHttpServer())
      .post("/api/contacts")
      .send(
        serializeContactPayload({
          companies: [{ id: companyId, isPrimary: true }],
          name: `t3-contact-${scope}-${seq}`,
          email: `t3-contact-${seq}@test.local`,
          phone: `0400-${String(seq).padStart(4, "0")}`,
          role: "Buyer",
        }),
      )
      .expect(201);
    return { id: extractCreatedEntityId(response.body, "contact") };
  }

  async function createDeal(
    scope: string,
    overrides: Partial<DealPayload> & { companyId: string },
  ) {
    const response = await request(app.getHttpServer())
      .post("/api/deals")
      .send(serializeDealPayload(buildDealPayload(scope, overrides)))
      .expect(201);
    return getDeal(extractCreatedEntityId(response.body, "deal"));
  }

  function buildDealPayload(
    scope: string,
    overrides: Partial<DealPayload> & { companyId: string },
  ): DealPayload {
    seq += 1;
    return {
      name: `t3-deal-${scope}-${seq}`,
      value: 1000 + seq,
      stage: "lead",
      expectedCloseDate: null,
      contactLinks: [],
      primaryContactId: null,
      ...overrides,
    };
  }

  async function createDealAtStage(
    scope: string,
    targetStage: DealStage,
    options: StageFixtureOptions = {},
  ) {
    const company = await createCompany(scope);
    const contacts = [];
    if (options.withContacts) {
      contacts.push(await createContact(`${scope}-contact`, company.id));
    }
    const links = contacts.map((contact) => ({
      contactId: contact.id,
      role: "owner",
    }));
    const initialStage: DealStage =
      targetStage === "lead" || targetStage === "closed_lost"
        ? "lead"
        : "qualified";
    const deal = await createDeal(scope, {
      companyId: company.id,
      stage: initialStage,
      expectedCloseDate: options.expectedCloseDate ?? null,
      contactLinks: links,
      primaryContactId: contacts[0]?.id ?? null,
    });

    const pathByTarget: Partial<Record<DealStage, DealStage[]>> = {
      active: ["active"],
      negotiation: ["active", "negotiation"],
      closed_won: ["active", "negotiation", "closed_won"],
      closed_lost: ["closed_lost"],
    };
    for (const stage of pathByTarget[targetStage] ?? []) {
      await request(app.getHttpServer())
        .post(`/api/deals/${deal.id}/stage`)
        .send({ stage })
        .expect(200);
    }
    return deal;
  }

  async function getDeal(dealId: string) {
    const response = await request(app.getHttpServer())
      .get(`/api/deals/${dealId}`)
      .expect(200);
    return normalizeDeal(response.body);
  }

  async function discoverRelationshipContract(): Promise<RelationshipContract> {
    const company = await createCompany("contract-discovery");
    let contactCompanyKey:
      | RelationshipContract["contactCompanyKey"]
      | undefined;
    let contactId: string | undefined;
    const contactAttempts: string[] = [];

    for (const candidate of ["id", "companyId"] as const) {
      seq += 1;
      const response = await request(app.getHttpServer())
        .post("/api/contacts")
        .send(
          serializeContactPayloadForKey(
            {
              companies: [{ id: company.id, isPrimary: true }],
              name: `t3-contact-contract-discovery-${seq}`,
              email: `t3-contact-contract-${seq}@test.local`,
              phone: `0400-${String(seq).padStart(4, "0")}`,
              role: "Buyer",
            },
            candidate,
          ),
        );
      contactAttempts.push(`${candidate}:${response.status}`);
      if (response.status === 201) {
        contactCompanyKey = candidate;
        contactId = extractCreatedEntityId(response.body, "contact");
        break;
      }
    }
    if (!contactCompanyKey || !contactId) {
      throw new Error(
        `T3 acceptance could not discover a valid Contact link contract (${contactAttempts.join(", ")})`,
      );
    }

    const payload = buildDealPayload("contract-discovery", {
      companyId: company.id,
      contactLinks: [{ contactId, role: "owner" }],
      primaryContactId: contactId,
    });
    let dealLinksKey: RelationshipContract["dealLinksKey"] | undefined;
    const dealAttempts: string[] = [];
    for (const candidate of ["contactLinks", "contacts"] as const) {
      const response = await request(app.getHttpServer())
        .post("/api/deals")
        .send(serializeDealPayloadForKey(payload, candidate));
      dealAttempts.push(`${candidate}:${response.status}`);
      if (response.status === 201) {
        extractCreatedEntityId(response.body, "deal");
        dealLinksKey = candidate;
        break;
      }
    }
    if (!dealLinksKey) {
      throw new Error(
        `T3 acceptance could not discover a valid Deal link contract (${dealAttempts.join(", ")})`,
      );
    }

    return { contactCompanyKey, dealLinksKey };
  }
});

function serializeContactPayload(payload: ContactPayload): JsonRecord {
  return serializeContactPayloadForKey(
    payload,
    relationshipContract.contactCompanyKey,
  );
}

function serializeContactPayloadForKey(
  payload: ContactPayload,
  key: RelationshipContract["contactCompanyKey"],
): JsonRecord {
  const { companies, ...fields } = payload;
  return {
    ...fields,
    companies: companies.map(({ id, isPrimary }) =>
      key === "id"
        ? // Strategy adapter — Structured fixes `companies[].id`.
          { id, isPrimary }
        : // Strategy adapter — Minimal leaves the field open; the
          // baseline-compatible implementation uses `companies[].companyId`.
          { companyId: id, isPrimary },
    ),
  };
}

function serializeDealPayload(payload: DealPayload): JsonRecord {
  return serializeDealPayloadForKey(payload, relationshipContract.dealLinksKey);
}

function serializeDealPayloadForKey(
  payload: DealPayload,
  key: RelationshipContract["dealLinksKey"],
): JsonRecord {
  const { contactLinks, ...fields } = payload;
  if (contactLinks === undefined) {
    return fields;
  }
  return {
    ...fields,
    // Strategy adapter — Structured fixes `contactLinks`; Minimal leaves the
    // transport open and the baseline-compatible implementation uses `contacts`.
    [key]: contactLinks,
  };
}

function serializeDealLinkUpdate(
  contactLinks: DealContactLink[],
  primaryContactId: string | null,
): JsonRecord {
  return {
    [relationshipContract.dealLinksKey]: contactLinks,
    primaryContactId,
  };
}

function extractCreatedEntityId(
  body: unknown,
  entity: "contact" | "deal",
): string {
  const response = (body ?? {}) as JsonRecord;
  const nested = (response[entity] ?? {}) as JsonRecord;
  const entityIdKey = `${entity}Id`;
  const id = [response.id, response[entityIdKey], nested.id].find(
    (candidate): candidate is string => typeof candidate === "string",
  );
  if (!id) {
    throw new Error(`T3 acceptance could not extract a created ${entity} id`);
  }
  return id;
}

function normalizeDeal(body: unknown): JsonRecord & {
  id: string;
  companyId: string;
  primaryContactId: string | null;
  contactLinks: DealContactLink[];
} {
  const deal = normalizeResponse((body ?? {}) as JsonRecord);
  const rawLinks = Array.isArray(deal.contactLinks)
    ? deal.contactLinks
    : Array.isArray(deal.contacts)
      ? (recordFieldMapping("contacts", "contactLinks"), deal.contacts)
      : [];
  return {
    ...deal,
    id: String(deal.id),
    companyId: String(
      deal.companyId ?? (deal.company as JsonRecord | undefined)?.id,
    ),
    primaryContactId:
      typeof deal.primaryContactId === "string" ? deal.primaryContactId : null,
    contactLinks: rawLinks.map((value) => {
      const link = value as JsonRecord;
      return {
        contactId: String(link.contactId ?? link.id),
        role: typeof link.role === "string" ? link.role : null,
      };
    }),
  };
}

async function truncateBusinessData(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    'TRUNCATE TABLE "deals", "contacts", "companies" RESTART IDENTITY CASCADE',
  );
}

// Checkpoint 5 - Requirements 38/39: seed scenarios are isolated because the
// reset seed commands replace all business data.
describe("T3 seed scenarios (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    await resetDatabaseSchema();
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await closeTestDataSource();
  });

  it("demo seed includes at least one Deal in every canonical stage", async () => {
    runSeedCommand("npm run db:reset:seed:demo");
    const list = await request(app.getHttpServer())
      .get("/api/deals?page=1&pageSize=100")
      .expect(200);
    const stages = new Set(
      list.body.items.map((deal: { stage: DealStage }) => deal.stage),
    );
    for (const stage of CANONICAL_STAGES) {
      expect(stages).toContain(stage);
    }
  });

  it("edge-case seed includes a zero-Contact Deal whose active transition fails its precondition", async () => {
    runSeedCommand("npm run db:reset:seed:edge-case");
    const list = await request(app.getHttpServer())
      .get("/api/deals?page=1&pageSize=100")
      .expect(200);
    const candidate = list.body.items
      .map((deal: unknown) => normalizeDeal(deal))
      .find(
        (deal: ReturnType<typeof normalizeDeal>) =>
          deal.stage === "qualified" && deal.contactLinks.length === 0,
      );
    expect(candidate).toBeTruthy();

    const response = await request(app.getHttpServer())
      .post(`/api/deals/${candidate.id}/stage`)
      .send({ stage: "active" })
      .expect(422);
    expect(response.body).toMatchObject({
      success: false,
      statusCode: 422,
      code: "TRANSITION_PRECONDITION_UNMET",
    });
  });
});

function runSeedCommand(command: string) {
  execSync(command, { cwd: process.cwd(), stdio: "pipe" });
}
