// Functional acceptance suite for T2 (Contact-Company and Deal-Contact
// many-to-many relationships).
//
// The experiment runner overlays this file into:
//   <workspace>/backend/test/acceptance/T2/relationships.e2e-spec.ts
// and executes it only in a throwaway copy of the agent-produced workspace.
// Both prompt strategies run these same behavioural assertions, derived from
// their identical "## 4. Requirements" sections. The Structured prompt fixes
// several HTTP field names while Minimal leaves them open, so narrowly scoped
// helpers below discover and normalize only those transport-level differences.
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
  discoverCollectionRoute,
  extractEntityId,
  normalizeResponse,
  recordDiscovery,
  recordFieldMapping,
  recordUnresolved,
} from "./acceptance-adapter";

jest.setTimeout(45000);

const UNKNOWN_UUID = "7f4f54f7-cd3c-4ef2-b22d-8f1d68d9f1aa";

type CompanyLinkInput = {
  id: string;
  isPrimary: boolean;
};

type DealContactLinkInput = {
  contactId: string;
  role?: string | null;
};

type ContactPayload = {
  companies: CompanyLinkInput[];
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
  contactLinks?: DealContactLinkInput[];
  primaryContactId?: string | null;
};

type RelationshipContract = {
  contactCompanyKey: "id" | "companyId";
  contactUpdateMethod: "patch" | "post";
  dealLinksKey: "contactLinks" | "contacts";
};

type JsonRecord = Record<string, unknown>;

let relationshipContract: RelationshipContract;
let contactBasePath: string;
let dealBasePath: string;

describe("T2 relationship API (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let seq = 0;

  beforeAll(async () => {
    await resetDatabaseSchema();
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await truncateBusinessData(dataSource);
    contactBasePath = await discoverCollectionRoute(app.getHttpServer(), "contacts");
    dealBasePath = await discoverCollectionRoute(app.getHttpServer(), "deals");
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

  // Checkpoint 1 - Target schema, Modified CRUD 1/3, Error semantics 1/2,
  // and Edge case 1: Contact creation requires exactly one primary Company.
  describe("checkpoint 1: Contact creation and representation", () => {
    it("creates a Contact linked to one Company and returns that primary link", async () => {
      const company = await createCompany("contact-one-company");
      const payload = buildContactPayload("contact-one-company", [
        { id: company.id, isPrimary: true },
      ]);

      const created = await request(app.getHttpServer())
        .post(contactBasePath)
        .send(serializeContactPayload(payload))
        .expect(201);

      const contactId = extractCreatedEntityId(created.body, "contact");
      const detail = await getContact(contactId);

      expect(detail).toMatchObject({
        id: contactId,
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
      });
      expect(detail.companies).toEqual([
        expect.objectContaining({
          id: company.id,
          name: company.name,
          isPrimary: true,
        }),
      ]);
      expect(detail).not.toHaveProperty("companyId");
    });

    it("creates a multi-Company Contact and orders the primary Company first", async () => {
      const primary = await createCompany("contact-primary");
      const secondary = await createCompany("contact-secondary");

      const created = await createContact("contact-multiple", [
        { id: secondary.id, isPrimary: false },
        { id: primary.id, isPrimary: true },
      ]);

      const detail = await getContact(created.id);
      expect(detail.companies).toHaveLength(2);
      expect(detail.companies[0]).toMatchObject({
        id: primary.id,
        name: primary.name,
        isPrimary: true,
      });
      expect(detail.companies[1]).toMatchObject({
        id: secondary.id,
        name: secondary.name,
        isPrimary: false,
      });
    });

    it.each([
      ["no Company links", []],
      [
        "no primary Company",
        [
          { id: "COMPANY_A", isPrimary: false },
          { id: "COMPANY_B", isPrimary: false },
        ],
      ],
      [
        "two primary Companies",
        [
          { id: "COMPANY_A", isPrimary: true },
          { id: "COMPANY_B", isPrimary: true },
        ],
      ],
    ])("rejects a Contact with %s", async (_label, template) => {
      const companyA = await createCompany(`invalid-primary-a-${seq}`);
      const companyB = await createCompany(`invalid-primary-b-${seq}`);
      const companies = template.map((link) => ({
        ...link,
        id: link.id === "COMPANY_A" ? companyA.id : companyB.id,
      }));

      const response = await request(app.getHttpServer())
        .post(contactBasePath)
        .send(
          serializeContactPayload(
            buildContactPayload(`invalid-primary-${seq}`, companies),
          ),
        )
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 400,
        code: "VALIDATION_ERROR",
      });
    });

    it("rejects an unknown Company and does not create the Contact", async () => {
      const payload = buildContactPayload("unknown-company", [
        { id: UNKNOWN_UUID, isPrimary: true },
      ]);

      const response = await request(app.getHttpServer())
        .post(contactBasePath)
        .send(serializeContactPayload(payload))
        .expect(404);

      expect(response.body).toMatchObject({ success: false, statusCode: 404 });
      const list = await request(app.getHttpServer())
        .get(
          `${contactBasePath}?q=${encodeURIComponent(payload.email)}&page=1&pageSize=10`,
        )
        .expect(200);
      expect(list.body.items).toEqual([]);
    });
  });

  // Checkpoint 2 - Link operations 1-5 and Modified CRUD 2: one operation
  // supplies the complete desired Company-link set and replaces it atomically.
  describe("checkpoint 2: atomic Contact-Company replacement", () => {
    it("attaches a secondary Company, promotes it, and demotes the old primary", async () => {
      const companyA = await createCompany("replace-company-a");
      const companyB = await createCompany("replace-company-b");
      const contact = await createContact("replace-contact", [
        { id: companyA.id, isPrimary: true },
      ]);

      const attached = await patchContactCompanies(contact.id, [
        { id: companyA.id, isPrimary: true },
        { id: companyB.id, isPrimary: false },
      ]);
      expect(attached.companies).toHaveLength(2);

      const promoted = await patchContactCompanies(contact.id, [
        { id: companyA.id, isPrimary: false },
        { id: companyB.id, isPrimary: true },
      ]);
      expect(promoted.companies[0]).toMatchObject({
        id: companyB.id,
        isPrimary: true,
      });
      expect(promoted.companies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: companyA.id, isPrimary: false }),
        ]),
      );
    });

    it("detaches a secondary Company without deleting the Contact", async () => {
      const companyA = await createCompany("detach-primary");
      const companyB = await createCompany("detach-secondary");
      const contact = await createContact("detach-secondary", [
        { id: companyA.id, isPrimary: true },
        { id: companyB.id, isPrimary: false },
      ]);

      const updated = await patchContactCompanies(contact.id, [
        { id: companyA.id, isPrimary: true },
      ]);
      expect(updated.id).toBe(contact.id);
      expect(updated.companies).toEqual([
        expect.objectContaining({ id: companyA.id, isPrimary: true }),
      ]);

      const detail = await getContact(contact.id);
      expect(detail.id).toBe(contact.id);
    });

    it("atomically removes the old primary when the same operation designates a replacement", async () => {
      const companyA = await createCompany("replace-primary-a");
      const companyB = await createCompany("replace-primary-b");
      const contact = await createContact("replace-primary", [
        { id: companyA.id, isPrimary: true },
        { id: companyB.id, isPrimary: false },
      ]);

      const updated = await patchContactCompanies(contact.id, [
        { id: companyB.id, isPrimary: true },
      ]);
      expect(updated.companies).toEqual([
        expect.objectContaining({ id: companyB.id, isPrimary: true }),
      ]);
    });

    it("rejects an update with no primary and leaves all links unchanged", async () => {
      const companyA = await createCompany("invalid-replace-a");
      const companyB = await createCompany("invalid-replace-b");
      const contact = await createContact("invalid-replace", [
        { id: companyA.id, isPrimary: true },
        { id: companyB.id, isPrimary: false },
      ]);
      const before = await getContact(contact.id);

      const response = await contactCompanyReplacementRequest(contact.id).send(
        serializeContactCompanies([{ id: companyB.id, isPrimary: false }]),
      );

      // Shared-requirement ambiguity: Error semantics 2 classifies a final set
      // with no primary as VALIDATION_ERROR, while Link operation 5/ Error
      // semantics 7 classifies removal of the current primary without a
      // replacement as INVALID_LINK_STATE. This request is both. The common
      // suite accepts only those two explicitly specified outcomes.
      expect([400, 422]).toContain(response.status);
      expect(response.body).toMatchObject({ success: false });
      expect(["VALIDATION_ERROR", "INVALID_LINK_STATE"]).toContain(
        response.body.code,
      );
      expect((await getContact(contact.id)).companies).toEqual(
        before.companies,
      );
    });

    it("rejects an update with two primary Companies and leaves all links unchanged", async () => {
      const companyA = await createCompany("two-primary-a");
      const companyB = await createCompany("two-primary-b");
      const contact = await createContact("two-primary", [
        { id: companyA.id, isPrimary: true },
        { id: companyB.id, isPrimary: false },
      ]);
      const before = await getContact(contact.id);

      const response = await contactCompanyReplacementRequest(contact.id)
        .send(
          serializeContactCompanies([
            { id: companyA.id, isPrimary: true },
            { id: companyB.id, isPrimary: true },
          ]),
        )
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 400,
        code: "VALIDATION_ERROR",
      });
      expect((await getContact(contact.id)).companies).toEqual(
        before.companies,
      );
    });

    it("rejects an unknown Company atomically", async () => {
      const company = await createCompany("atomic-unknown-company");
      const contact = await createContact("atomic-unknown-company", [
        { id: company.id, isPrimary: true },
      ]);
      const before = await getContact(contact.id);

      const response = await contactCompanyReplacementRequest(contact.id)
        .send(
          serializeContactCompanies([{ id: UNKNOWN_UUID, isPrimary: true }]),
        )
        .expect(404);

      expect(response.body).toMatchObject({ success: false, statusCode: 404 });
      expect((await getContact(contact.id)).companies).toEqual(
        before.companies,
      );
    });

    it("returns 404 when the Contact being attached does not exist", async () => {
      const company = await createCompany("unknown-contact");
      const response = await contactCompanyReplacementRequest(UNKNOWN_UUID)
        .send(serializeContactCompanies([{ id: company.id, isPrimary: true }]))
        .expect(404);

      expect(response.body).toMatchObject({ success: false, statusCode: 404 });
    });
  });

  // Checkpoint 3 - Modified CRUD 3/5: Contact list representations and the
  // companyId filter include both primary and secondary links.
  describe("checkpoint 3: Contact list and Company filtering", () => {
    it("finds a Contact by either its primary or secondary Company link", async () => {
      const primary = await createCompany("filter-primary");
      const secondary = await createCompany("filter-secondary");
      const outside = await createCompany("filter-outside");
      const contact = await createContact("filter-linked", [
        { id: primary.id, isPrimary: true },
        { id: secondary.id, isPrimary: false },
      ]);
      await createContact("filter-outside", [
        { id: outside.id, isPrimary: true },
      ]);

      for (const companyId of [primary.id, secondary.id]) {
        const list = await request(app.getHttpServer())
          .get(`${contactBasePath}?companyId=${companyId}&page=1&pageSize=100`)
          .expect(200);
        const found = list.body.items.find(
          (item: { id: string }) => item.id === contact.id,
        );
        expect(found).toBeTruthy();
        expect(found.companies[0]).toMatchObject({
          id: primary.id,
          isPrimary: true,
        });
        expect(found).not.toHaveProperty("companyId");
      }
    });
  });

  // Checkpoint 4 - Target schema 3-6, Modified CRUD 4/6, Error semantics 3,
  // and Edge case 2: Deals support zero or many role-bearing Contact links.
  describe("checkpoint 4: Deal creation and representation", () => {
    it("creates and reads a Deal with zero linked Contacts", async () => {
      const company = await createCompany("deal-zero");
      const created = await createDeal("deal-zero", {
        companyId: company.id,
        contactLinks: [],
        primaryContactId: null,
      });

      const detail = await getDeal(created.id);
      expect(detail.contactLinks).toEqual([]);
      expect(detail.primaryContactId).toBeNull();
      expect(detail.company).toMatchObject({
        id: company.id,
        name: company.name,
      });
      expect(detail).not.toHaveProperty("contactId");
    });

    it("round-trips multiple Contact links, optional roles, and a linked primary", async () => {
      const company = await createCompany("deal-many");
      const contactA = await createContact("deal-many-a", [
        { id: company.id, isPrimary: true },
      ]);
      const contactB = await createContact("deal-many-b", [
        { id: company.id, isPrimary: true },
      ]);
      const contactC = await createContact("deal-many-c", [
        { id: company.id, isPrimary: true },
      ]);

      const created = await createDeal("deal-many", {
        companyId: company.id,
        contactLinks: [
          { contactId: contactA.id, role: "decision-maker" },
          { contactId: contactB.id, role: "legal" },
          { contactId: contactC.id, role: null },
        ],
        primaryContactId: contactA.id,
      });
      const detail = await getDeal(created.id);

      expect(detail.contactLinks).toEqual(
        expect.arrayContaining([
          { contactId: contactA.id, role: "decision-maker" },
          { contactId: contactB.id, role: "legal" },
          { contactId: contactC.id, role: null },
        ]),
      );
      expect(detail.primaryContactId).toBe(contactA.id);
      expect(
        detail.contactLinks.some(
          (link: DealContactLinkInput) =>
            link.contactId === detail.primaryContactId,
        ),
      ).toBe(true);
      expect(detail).not.toHaveProperty("contactId");
    });

    it("rejects a primaryContactId outside the linked-Contact set", async () => {
      const company = await createCompany("deal-invalid-primary");
      const linked = await createContact("deal-invalid-primary-linked", [
        { id: company.id, isPrimary: true },
      ]);
      const unlinked = await createContact("deal-invalid-primary-unlinked", [
        { id: company.id, isPrimary: true },
      ]);

      const response = await request(app.getHttpServer())
        .post(dealBasePath)
        .send(
          serializeDealPayload(
            buildDealPayload("deal-invalid-primary", {
              companyId: company.id,
              contactLinks: [{ contactId: linked.id, role: null }],
              primaryContactId: unlinked.id,
            }),
          ),
        )
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 400,
        code: "VALIDATION_ERROR",
      });
    });

    it("rejects Deal creation when any linked Contact is unknown", async () => {
      const company = await createCompany("deal-unknown-contact");
      const known = await createContact("deal-known-contact", [
        { id: company.id, isPrimary: true },
      ]);
      const payload = buildDealPayload("deal-unknown-contact", {
        companyId: company.id,
        contactLinks: [
          { contactId: known.id, role: "owner" },
          { contactId: UNKNOWN_UUID, role: "unknown" },
        ],
        primaryContactId: known.id,
      });

      const response = await request(app.getHttpServer())
        .post(dealBasePath)
        .send(serializeDealPayload(payload))
        .expect(404);

      expect(response.body).toMatchObject({ success: false, statusCode: 404 });
      const list = await request(app.getHttpServer())
        .get(`${dealBasePath}?companyId=${company.id}&page=1&pageSize=100`)
        .expect(200);
      expect(
        list.body.items.some(
          (deal: { name: string }) => deal.name === payload.name,
        ),
      ).toBe(false);
    });
  });

  // Checkpoint 5 - Link operation 6 and Error semantics 6: Deal link-set
  // replacement is atomic, including roles and primaryContactId.
  describe("checkpoint 5: atomic Deal-Contact replacement", () => {
    it("replaces all Contact links, roles, and the primary in one update", async () => {
      const company = await createCompany("deal-replace");
      const contactA = await createContact("deal-replace-a", [
        { id: company.id, isPrimary: true },
      ]);
      const contactB = await createContact("deal-replace-b", [
        { id: company.id, isPrimary: true },
      ]);
      const contactC = await createContact("deal-replace-c", [
        { id: company.id, isPrimary: true },
      ]);
      const deal = await createDeal("deal-replace", {
        companyId: company.id,
        contactLinks: [
          { contactId: contactA.id, role: "owner" },
          { contactId: contactB.id, role: "legal" },
        ],
        primaryContactId: contactA.id,
      });

      const response = await request(app.getHttpServer())
        .post(`${dealBasePath}/${deal.id}`)
        .send(
          serializeDealLinkUpdate(
            [
              { contactId: contactB.id, role: "reviewer" },
              { contactId: contactC.id, role: "technical" },
            ],
            contactC.id,
          ),
        );

      expectSuccessfulStatus(response.status, "Deal relationship update");
      const updated = await getDeal(deal.id);
      expect(updated.contactLinks).toEqual(
        expect.arrayContaining([
          { contactId: contactB.id, role: "reviewer" },
          { contactId: contactC.id, role: "technical" },
        ]),
      );
      expect(updated.contactLinks).toHaveLength(2);
      expect(updated.primaryContactId).toBe(contactC.id);
      expect(updated.companyId).toBe(company.id);
    });

    it("rejects any unknown Contact and leaves the whole Deal unchanged", async () => {
      const company = await createCompany("deal-atomic-failure");
      const contact = await createContact("deal-atomic-failure", [
        { id: company.id, isPrimary: true },
      ]);
      const deal = await createDeal("deal-atomic-failure", {
        companyId: company.id,
        contactLinks: [{ contactId: contact.id, role: "owner" }],
        primaryContactId: contact.id,
      });
      const before = await getDeal(deal.id);

      const response = await request(app.getHttpServer())
        .post(`${dealBasePath}/${deal.id}`)
        .send(
          serializeDealLinkUpdate(
            [
              { contactId: contact.id, role: "changed" },
              { contactId: UNKNOWN_UUID, role: "unknown" },
            ],
            contact.id,
          ),
        )
        .expect(404);

      expect(response.body).toMatchObject({ success: false, statusCode: 404 });
      const after = await getDeal(deal.id);
      expect(after.contactLinks).toEqual(before.contactLinks);
      expect(after.primaryContactId).toBe(before.primaryContactId);
      expect(after.companyId).toBe(before.companyId);
    });

    it("replaces a non-empty set with zero Contacts without changing the Company", async () => {
      const company = await createCompany("deal-clear");
      const contact = await createContact("deal-clear", [
        { id: company.id, isPrimary: true },
      ]);
      const deal = await createDeal("deal-clear", {
        companyId: company.id,
        contactLinks: [{ contactId: contact.id, role: "owner" }],
        primaryContactId: contact.id,
      });

      const response = await request(app.getHttpServer())
        .post(`${dealBasePath}/${deal.id}`)
        .send(serializeDealLinkUpdate([], null));

      expectSuccessfulStatus(response.status, "Deal relationship update");
      const updated = await getDeal(deal.id);
      expect(updated.contactLinks).toEqual([]);
      expect(updated.primaryContactId).toBeNull();
      expect(updated.companyId).toBe(company.id);
    });
  });

  async function createCompany(scope: string) {
    seq += 1;
    const name = `t2-company-${scope}-${seq}`;
    const response = await request(app.getHttpServer())
      .post("/api/companies")
      .send({
        name,
        email: `t2-company-${seq}@test.local`,
        phone: `0300-${String(seq).padStart(4, "0")}`,
        website: `https://t2-company-${seq}.example.com`,
        industry: "OTHER",
      })
      .expect(201);

    return { id: response.body.companyId ?? response.body.id, name };
  }

  async function createContact(scope: string, companies: CompanyLinkInput[]) {
    const payload = buildContactPayload(scope, companies);
    const response = await request(app.getHttpServer())
      .post(contactBasePath)
      .send(serializeContactPayload(payload))
      .expect(201);
    return getContact(extractCreatedEntityId(response.body, "contact"));
  }

  function buildContactPayload(
    scope: string,
    companies: CompanyLinkInput[],
  ): ContactPayload {
    seq += 1;
    return {
      companies,
      name: `t2-contact-${scope}-${seq}`,
      email: `t2-contact-${seq}@test.local`,
      phone: `0400-${String(seq).padStart(4, "0")}`,
      role: "Buyer",
    };
  }

  async function patchContactCompanies(
    contactId: string,
    companies: CompanyLinkInput[],
  ) {
    const response = await contactCompanyReplacementRequest(contactId).send(
      serializeContactCompanies(companies),
    );
    expectSuccessfulStatus(response.status, "Contact relationship update");
    return getContact(contactId);
  }

  async function getContact(contactId: string) {
    const response = await request(app.getHttpServer())
      .get(`${contactBasePath}/${contactId}`)
      .expect(200);
    return normalizeContact(response.body);
  }

  async function createDeal(
    scope: string,
    overrides: Partial<DealPayload> & { companyId: string },
  ) {
    const response = await request(app.getHttpServer())
      .post(dealBasePath)
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
      name: `t2-deal-${scope}-${seq}`,
      value: 1000 + seq,
      stage: "lead",
      expectedCloseDate: null,
      ...overrides,
    };
  }

  async function getDeal(dealId: string) {
    const response = await request(app.getHttpServer())
      .get(`${dealBasePath}/${dealId}`)
      .expect(200);
    return normalizeDeal(response.body);
  }

  async function discoverRelationshipContract(): Promise<RelationshipContract> {
    const company = await createCompany("contract-discovery");
    const contactPayload = buildContactPayload("contract-discovery", [
      { id: company.id, isPrimary: true },
    ]);

    let contactCompanyKey:
      RelationshipContract["contactCompanyKey"] | undefined;
    let contactId: string | undefined;
    const contactAttempts: string[] = [];
    for (const candidate of ["id", "companyId"] as const) {
      const response = await request(app.getHttpServer())
        .post(contactBasePath)
        .send(serializeContactPayloadForKey(contactPayload, candidate));
      contactAttempts.push(`${candidate}:${response.status}`);
      if (response.status === 201) {
        contactCompanyKey = candidate;
        contactId = extractCreatedEntityId(response.body, "contact");
        break;
      }
    }
    if (!contactCompanyKey || !contactId) {
      return recordUnresolved(
        "request_field",
        "Contact.companies[].id",
        contactAttempts,
      );
    }
    recordDiscovery(
      "request_field",
      "Contact.companies[].id",
      contactCompanyKey,
      contactAttempts,
    );
    if (contactCompanyKey !== "id") {
      recordFieldMapping("companies[].companyId", "companies[].id");
    }

    let contactUpdateMethod:
      RelationshipContract["contactUpdateMethod"] | undefined;
    const updateAttempts: string[] = [];
    for (const candidate of ["patch", "post"] as const) {
      const response = await contactCompanyReplacementRequestForMethod(
        contactId,
        candidate,
      ).send(
        serializeContactCompaniesForKey(
          [{ id: company.id, isPrimary: true }],
          contactCompanyKey,
        ),
      );
      updateAttempts.push(`${candidate}:${response.status}`);
      if (response.status >= 200 && response.status < 300) {
        contactUpdateMethod = candidate;
        break;
      }
    }
    if (!contactUpdateMethod) {
      return recordUnresolved(
        "http_method",
        "replace Contact Company links",
        updateAttempts,
      );
    }
    recordDiscovery(
      "http_method",
      "replace Contact Company links",
      contactUpdateMethod,
      updateAttempts,
    );

    const dealPayload = buildDealPayload("contract-discovery", {
      companyId: company.id,
      contactLinks: [],
      primaryContactId: null,
    });
    let dealLinksKey: RelationshipContract["dealLinksKey"] | undefined;
    const dealAttempts: string[] = [];
    for (const candidate of ["contactLinks", "contacts"] as const) {
      const response = await request(app.getHttpServer())
        .post(dealBasePath)
        .send(serializeDealPayloadForKey(dealPayload, candidate));
      dealAttempts.push(`${candidate}:${response.status}`);
      if (response.status === 201) {
        extractCreatedEntityId(response.body, "deal");
        dealLinksKey = candidate;
        break;
      }
    }
    if (!dealLinksKey) {
      return recordUnresolved(
        "request_field",
        "Deal.contactLinks",
        dealAttempts,
      );
    }
    recordDiscovery(
      "request_field",
      "Deal.contactLinks",
      dealLinksKey,
      dealAttempts,
    );
    if (dealLinksKey !== "contactLinks") {
      recordFieldMapping("contacts", "contactLinks");
    }

    return { contactCompanyKey, contactUpdateMethod, dealLinksKey };
  }

  function contactCompanyReplacementRequest(contactId: string) {
    return contactCompanyReplacementRequestForMethod(
      contactId,
      relationshipContract.contactUpdateMethod,
    );
  }

  function contactCompanyReplacementRequestForMethod(
    contactId: string,
    method: RelationshipContract["contactUpdateMethod"],
  ) {
    const server = app.getHttpServer();
    const path = `${contactBasePath}/${contactId}`;
    return method === "patch"
      ? request(server).patch(path)
      : request(server).post(path);
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
    ...serializeContactCompaniesForKey(companies, key),
  };
}

function serializeContactCompanies(companies: CompanyLinkInput[]): JsonRecord {
  return serializeContactCompaniesForKey(
    companies,
    relationshipContract.contactCompanyKey,
  );
}

function serializeContactCompaniesForKey(
  companies: CompanyLinkInput[],
  key: RelationshipContract["contactCompanyKey"],
): JsonRecord {
  return {
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
  contactLinks: DealContactLinkInput[],
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
  return extractEntityId(body, entity);
}

function expectSuccessfulStatus(status: number, operation: string): void {
  if (status < 200 || status >= 300) {
    throw new Error(`${operation} returned non-success HTTP status ${status}`);
  }
}

function normalizeContact(body: unknown): JsonRecord & {
  id: string;
  companies: Array<JsonRecord & { id: string; isPrimary: boolean }>;
} {
  const contact = normalizeResponse((body ?? {}) as JsonRecord);
  const companies = Array.isArray(contact.companies) ? contact.companies : [];
  return {
    ...contact,
    id: String(contact.id),
    companies: companies.map((value) => {
      const company = value as JsonRecord;
      return {
        ...company,
        id: String(company.id ?? company.companyId),
        isPrimary: Boolean(company.isPrimary),
      };
    }),
  };
}

function normalizeDeal(body: unknown): JsonRecord & {
  id: string;
  companyId: string;
  primaryContactId: string | null;
  contactLinks: DealContactLinkInput[];
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

// Checkpoint 6 - Data setup requirements. These run after the relationship
// tests because reset seed commands intentionally replace all business data.
describe("T2 seed scenarios (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    await resetDatabaseSchema();
    app = await createTestApp();
    contactBasePath = await discoverCollectionRoute(app.getHttpServer(), "contacts");
    dealBasePath = await discoverCollectionRoute(app.getHttpServer(), "deals");
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await closeTestDataSource();
  });

  it("demo seed includes a multi-Company Contact with exactly one primary", async () => {
    runSeedCommand("npm run db:reset:seed:demo");

    const list = await request(app.getHttpServer())
      .get(`${contactBasePath}?page=1&pageSize=100`)
      .expect(200);
    const candidate = list.body.items.find(
      (contact: { companies?: CompanyLinkInput[] }) =>
        Array.isArray(contact.companies) && contact.companies.length >= 2,
    );

    expect(candidate).toBeTruthy();
    expect(
      candidate.companies.filter(
        (company: CompanyLinkInput) => company.isPrimary,
      ),
    ).toHaveLength(1);
  });

  it("demo seed includes a Deal with three distinct non-empty Contact roles", async () => {
    runSeedCommand("npm run db:reset:seed:demo");

    const list = await request(app.getHttpServer())
      .get(`${dealBasePath}?page=1&pageSize=100`)
      .expect(200);
    const deals = await Promise.all(
      list.body.items.map(async (item: { id: string }) => {
        const detail = await request(app.getHttpServer())
          .get(`${dealBasePath}/${item.id}`)
          .expect(200);
        return normalizeDeal(detail.body);
      }),
    );
    const candidate = deals.find((deal: ReturnType<typeof normalizeDeal>) => {
      const roles = deal.contactLinks
        .map((link: DealContactLinkInput) => link.role)
        .filter((role: string | null | undefined): role is string => Boolean(role));
      return deal.contactLinks.length >= 3 && new Set(roles).size >= 3;
    });

    expect(candidate).toBeTruthy();
  });

  it("edge-case seed includes a Deal with zero linked Contacts", async () => {
    runSeedCommand("npm run db:reset:seed:edge-case");

    const list = await request(app.getHttpServer())
      .get(`${dealBasePath}?page=1&pageSize=100`)
      .expect(200);
    const deals = await Promise.all(
      list.body.items.map(async (item: { id: string }) => {
        const detail = await request(app.getHttpServer())
          .get(`${dealBasePath}/${item.id}`)
          .expect(200);
        return normalizeDeal(detail.body);
      }),
    );
    expect(deals.some((deal) => deal.contactLinks.length === 0)).toBe(true);
  });
});

async function truncateBusinessData(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    'TRUNCATE TABLE "deals", "contacts", "companies" RESTART IDENTITY CASCADE',
  );
}

function runSeedCommand(command: string) {
  execSync(command, { cwd: process.cwd(), stdio: "pipe" });
}
