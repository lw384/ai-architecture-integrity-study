// Functional acceptance suite for T1 ("Add Deal tracking to the CRM").
//
// This file is NOT part of baseline/ and is never visible to the agent while
// it works — experiment/instruments/agent-runners/acceptance_runner.py overlays it
// into a throwaway copy of the produced workspace, at exactly
// <workspace>/backend/test/acceptance/T1/deal.e2e-spec.ts (the relative
// imports below assume that exact destination — two levels up from
// test/acceptance/T1/ reaches the workspace's own test/setup/*, NOT
// baseline's, since the agent's copy may have modified those helpers), runs
// the configured npm/Jest command against it, then discards the
// whole acceptance/ directory. The acceptance standard is the shared
// "## 4. Requirements" in experiment/design/tasks/T1_{minimal,structured}.md.
//
// It reuses the same e2e harness baseline/backend/test/{company,contact}.e2e
// -spec.ts already use (createTestApp / resetDatabaseSchema). Both prompt
// strategies run this same set of behavioural assertions. Where the Minimal
// prompt deliberately leaves response wrapping open but the Structured prompt
// fixes it, a narrowly scoped helper below normalizes only that wrapper and
// documents which branch corresponds to which prompt strategy.
//
// Error-code note: the task doc's "Shared Error Contract" section says
// unknown-parent/unknown-id responses carry code `NOT_FOUND`, but the
// existing codebase convention (see src/common/errors/error-codes.ts,
// exercised by company.e2e-spec.ts / contact.e2e-spec.ts) uses
// `PARENT_NOT_FOUND` for a missing referenced parent and `ENTITY_NOT_FOUND`
// for a missing entity itself — there is no `NOT_FOUND` code anywhere in the
// codebase. Section 2 of the task doc asks the agent to preserve existing
// externally observable behaviour, so this file only asserts the HTTP status
// (404) and the `success: false` envelope for those cases, not one specific
// `code` string, to avoid failing a correct implementation over a doc/code
// naming mismatch that predates this task.
import { execSync } from 'node:child_process';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp } from '../../setup/test-app';
import {
  closeTestDataSource,
  resetDatabaseSchema,
  truncateBusinessTables,
} from '../../setup/test-database';
import {
  discoverCollectionRoute,
  expectSuccessfulMutation,
  extractEntityId,
  normalizeResponse,
  requestWithDiscoveredMethod,
} from './acceptance-adapter';

jest.setTimeout(30000);

type DealPayload = {
  name: string;
  value: number;
  companyId: string;
  stage?: string;
  contactId?: string | null;
  expectedCloseDate?: string | null;
};

let dealBasePath: string;

describe('Deal API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let seq = 0;

  beforeAll(async () => {
    await resetDatabaseSchema();
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await truncateBusinessTables(dataSource);
    dealBasePath = await discoverCollectionRoute(app.getHttpServer(), 'deals');
    await truncateBusinessTables(dataSource);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    await closeTestDataSource();
  });

  // Checkpoint 1 — Req 1,2,3,4,6,7: core creation path, default stage, and
  // rejection of requests missing a required field.
  describe('checkpoint 1: creation', () => {
    it('creates a Deal with all fields supplied and returns it on fetch', async () => {
      const companyId = await createCompany('create-full');
      const contactId = await createContact('create-full', companyId);
      const payload = buildDealPayload('create-full', {
        companyId,
        contactId,
        stage: 'qualified',
        expectedCloseDate: '2026-09-30',
      });

      const createResponse = await request(app.getHttpServer())
        .post(dealBasePath)
        .send(payload)
        .expect(201);

      const dealId = extractEntityId(createResponse.body, 'deal');

      const detail = await request(app.getHttpServer())
        .get(`${dealBasePath}/${dealId}`)
        .expect(200);
      const detailBody = normalizeResponse(detail.body);

      expect(detailBody).toMatchObject({
        id: dealId,
        name: payload.name,
        value: payload.value,
        stage: 'qualified',
        companyId,
        contactId,
      });

      // Shared requirement adapter — both strategies must preserve the same
      // calendar date, while Minimal may expose a database timestamp and
      // Structured may expose the ISO date literal shown in its API Contract.
      expect(Date.parse(detailBody.expectedCloseDate)).toBe(
        Date.parse(payload.expectedCloseDate as string),
      );
    });

    it('defaults stage to "lead" when omitted', async () => {
      const companyId = await createCompany('create-default-stage');
      const payload = buildDealPayload('create-default-stage', { companyId });
      delete payload.stage;

      const createResponse = await request(app.getHttpServer())
        .post(dealBasePath)
        .send(payload)
        .expect(201);

      const dealId = extractEntityId(createResponse.body, 'deal');
      const detail = await request(app.getHttpServer())
        .get(`${dealBasePath}/${dealId}`)
        .expect(200);

      expect(normalizeResponse(detail.body).stage).toBe('lead');
    });

    it('rejects a request missing name, value, or companyId', async () => {
      const companyId = await createCompany('create-missing-fields');

      for (const omittedField of ['name', 'value', 'companyId'] as const) {
        // Required fields can't be `delete`d off the strongly-typed
        // DealPayload (strictNullChecks forbids deleting a non-optional
        // property), so build each variant through a loosely-typed record.
        const payload: Record<string, unknown> = buildDealPayload(
          'create-missing-fields',
          { companyId },
        );
        delete payload[omittedField];

        const response = await request(app.getHttpServer())
          .post(dealBasePath)
          .send(payload)
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }
    });
  });

  // Checkpoint 2 — Req 8,9: referential integrity against Company and Contact.
  describe('checkpoint 2: referential integrity on create', () => {
    it('rejects an unknown companyId', async () => {
      const response = await request(app.getHttpServer())
        .post(dealBasePath)
        .send(
          buildDealPayload('missing-company', {
            companyId: '7f4f54f7-cd3c-4ef2-b22d-8f1d68d9f1aa',
          }),
        )
        .expect(404);

      expect(response.body).toMatchObject({ success: false, statusCode: 404 });
    });

    it('rejects an unknown contactId', async () => {
      const companyId = await createCompany('missing-contact');

      const response = await request(app.getHttpServer())
        .post(dealBasePath)
        .send(
          buildDealPayload('missing-contact', {
            companyId,
            contactId: '7f4f54f7-cd3c-4ef2-b22d-8f1d68d9f1aa',
          }),
        )
        .expect(404);

      expect(response.body).toMatchObject({ success: false, statusCode: 404 });
    });
  });

  // Checkpoint 3 — Req 10,11,12,13: pagination, stage filter, companyId
  // filter, and an out-of-range page returning an empty list, not an error.
  describe('checkpoint 3: list query', () => {
    it('supports pagination, stage/companyId filters, and out-of-range pages', async () => {
      const companyA = await createCompany('list-a');
      const companyB = await createCompany('list-b');

      await createDeal('list-a-1', { companyId: companyA, stage: 'qualified' });
      await createDeal('list-a-2', { companyId: companyA, stage: 'qualified' });
      await createDeal('list-a-3', { companyId: companyA, stage: 'won' });
      await createDeal('list-b-1', { companyId: companyB, stage: 'qualified' });

      const filtered = await request(app.getHttpServer())
        .get(`${dealBasePath}?stage=qualified&companyId=${companyA}&page=1&pageSize=10`)
        .expect(200);
      const filteredBody = normalizeResponse(filtered.body);

      expect(filteredBody.total).toBe(2);
      expect(filteredBody.page).toBe(1);
      expect(filteredBody.pageSize).toBe(10);
      expect(
        filteredBody.items.every(
          (item: { companyId: string; stage: string }) =>
            item.companyId === companyA && item.stage === 'qualified',
        ),
      ).toBe(true);

      const beyondLastPage = await request(app.getHttpServer())
        .get(`${dealBasePath}?stage=qualified&companyId=${companyA}&page=99&pageSize=10`)
        .expect(200);

      expect(normalizeResponse(beyondLastPage.body).items).toEqual([]);
    });
  });

  // Checkpoint 4 — Req 14,15,16,17,18: detail with company summary, unknown
  // id, partial update, empty-body rejection, and immutable-field rejection.
  describe('checkpoint 4: detail and update', () => {
    it('returns the linked company summary on detail fetch', async () => {
      const companyId = await createCompany('detail-company');
      const dealId = await createDeal('detail-company', { companyId });

      const detail = await request(app.getHttpServer())
        .get(`${dealBasePath}/${dealId}`)
        .expect(200);

      expect(normalizeResponse(detail.body).company).toMatchObject({ id: companyId });
    });

    it('returns 404 for an unknown deal id', async () => {
      const response = await request(app.getHttpServer())
        .get(`${dealBasePath}/7f4f54f7-cd3c-4ef2-b22d-8f1d68d9f1aa`)
        .expect(404);

      expect(response.body).toMatchObject({ success: false, statusCode: 404 });
    });

    it('accepts a partial update and rejects an empty body', async () => {
      const companyId = await createCompany('update-partial');
      const dealId = await createDeal('update-partial', { companyId, stage: 'lead' });

      const updated = await requestWithDiscoveredMethod(
        app.getHttpServer(),
        'update Deal',
        `${dealBasePath}/${dealId}`,
        { stage: 'won' },
      );

      expectSuccessfulMutation(updated);
      const updatedDetail = await request(app.getHttpServer())
        .get(`${dealBasePath}/${dealId}`)
        .expect(200);
      expect(normalizeResponse(updatedDetail.body).stage).toBe('won');

      const emptyBodyResponse = await requestWithDiscoveredMethod(
        app.getHttpServer(),
        'update Deal',
        `${dealBasePath}/${dealId}`,
        {},
      );
      expect(emptyBodyResponse.status).toBe(400);

      expect(emptyBodyResponse.body).toMatchObject({
        success: false,
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('rejects updating with a field outside the Deal schema', async () => {
      const companyId = await createCompany('update-immutable');
      const dealId = await createDeal('update-immutable', { companyId });

      // Shared Req 18 covers fields outside the Deal schema. `companyId`
      // immutability is specified only by the Structured §5 API Contract, so
      // it is deliberately not used as the cross-strategy acceptance probe.
      const response = await requestWithDiscoveredMethod(
        app.getHttpServer(),
        'update Deal',
        `${dealBasePath}/${dealId}`,
        { unexpectedField: 'not-part-of-deal-schema' },
      );
      expect(response.status).toBe(400);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  // Checkpoint 5 — Req 3,5,19,20: value must be non-negative; contactId and
  // expectedCloseDate must round-trip as null without error.
  describe('checkpoint 5: value and null-field robustness', () => {
    it('rejects a negative value', async () => {
      const companyId = await createCompany('negative-value');
      const payload = buildDealPayload('negative-value', { companyId, value: -1 });

      const response = await request(app.getHttpServer())
        .post(dealBasePath)
        .send(payload)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('persists and returns contactId=null and expectedCloseDate=null without error', async () => {
      const companyId = await createCompany('null-fields');
      const payload = buildDealPayload('null-fields', {
        companyId,
        contactId: null,
        expectedCloseDate: null,
      });

      const createResponse = await request(app.getHttpServer())
        .post(dealBasePath)
        .send(payload)
        .expect(201);

      const dealId = extractEntityId(createResponse.body, 'deal');
      const detail = await request(app.getHttpServer())
        .get(`${dealBasePath}/${dealId}`)
        .expect(200);
      const detailBody = normalizeResponse(detail.body);

      expect(detailBody.contactId).toBeNull();
      expect(detailBody.expectedCloseDate).toBeNull();
    });
  });

  async function createCompany(scope: string): Promise<string> {
    seq += 1;
    const response = await request(app.getHttpServer())
      .post('/api/companies')
      .send({
        name: `deal-e2e-company-${scope}-${seq}`,
        email: `deal-company-${seq}@test.local`,
        phone: `0300-${String(seq).padStart(4, '0')}`,
        website: `https://deal-company-${seq}.example.com`,
        industry: 'OTHER',
      })
      .expect(201);

    return response.body.companyId;
  }

  async function createContact(scope: string, companyId: string): Promise<string> {
    seq += 1;
    const response = await request(app.getHttpServer())
      .post('/api/contacts')
      .send({
        companyId,
        name: `deal-e2e-contact-${scope}-${seq}`,
        email: `deal-contact-${seq}@test.local`,
        phone: `0400-${String(seq).padStart(4, '0')}`,
      })
      .expect(201);

    return response.body.id;
  }

  async function createDeal(
    scope: string,
    overrides: Partial<DealPayload> & { companyId: string },
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(dealBasePath)
      .send(buildDealPayload(scope, overrides))
      .expect(201);

    return extractEntityId(response.body, 'deal');
  }

  function buildDealPayload(
    scope: string,
    overrides: Partial<DealPayload> & { companyId: string },
  ): DealPayload {
    seq += 1;

    return {
      name: `deal-e2e-${scope}-${seq}`,
      value: 1000 + seq,
      stage: 'lead',
      ...overrides,
    };
  }
});

// Checkpoint 6 — Req 23,24: demo and edge-case seed data. Runs in its own
// describe block, after the block above, because the seed CLI's --reset
// flag truncates business tables and would otherwise wipe fixtures the
// earlier checkpoints depend on.
describe('Deal seed scenarios (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await resetDatabaseSchema();
    app = await createTestApp();
    dealBasePath = await discoverCollectionRoute(app.getHttpServer(), 'deals');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    await closeTestDataSource();
  });

  it('creates at least 8 Deals across at least 4 distinct stages after the demo seed', async () => {
    runSeedCommand('npm run db:reset:seed:demo');

    const list = await request(app.getHttpServer())
      .get(`${dealBasePath}?pageSize=50`)
      .expect(200);
    const listBody = normalizeResponse(list.body);

    expect(listBody.total).toBeGreaterThanOrEqual(8);
    const distinctStages = new Set(
      (listBody.items as Array<{ stage: string }>).map((item) => item.stage),
    );
    expect(distinctStages.size).toBeGreaterThanOrEqual(4);
  });

  it('creates a Deal with contactId=null and a Deal with expectedCloseDate=null after the edge-case seed', async () => {
    runSeedCommand('npm run db:reset:seed:edge-case');

    const list = await request(app.getHttpServer())
      .get(`${dealBasePath}?pageSize=50`)
      .expect(200);

    const items = normalizeResponse(list.body).items as Array<{
      contactId: string | null;
      expectedCloseDate: string | null;
    }>;

    expect(items.some((item) => item.contactId === null)).toBe(true);
    expect(items.some((item) => item.expectedCloseDate === null)).toBe(true);
  });
});

function runSeedCommand(command: string) {
  execSync(command, { cwd: process.cwd(), stdio: 'pipe' });
}
