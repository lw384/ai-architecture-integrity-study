import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp } from './setup/test-app';
import {
  closeTestDataSource,
  resetDatabaseSchema,
  truncateBusinessTables,
} from './setup/test-database';

jest.setTimeout(30000);

describe('Contact API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let companySeq = 0;
  let contactSeq = 0;

  beforeAll(async () => {
    await resetDatabaseSchema();
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await truncateBusinessTables(dataSource);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    await closeTestDataSource();
  });

  it('creates a contact for an existing company and fetches it', async () => {
    // Verifies a contact can be created under an existing company.
    const companyId = await createCompany('contact-create');
    const payload = buildContactPayload('create', { companyId });

    const createResponse = await request(app.getHttpServer())
      .post('/api/contacts')
      .send(payload)
      .expect(201);

    expect(createResponse.body).toMatchObject({
      companyId,
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      role: payload.role,
    });

    const detailResponse = await request(app.getHttpServer())
      .get(`/api/contacts/${createResponse.body.id}`)
      .expect(200);

    expect(detailResponse.body).toMatchObject({
      id: createResponse.body.id,
      companyId,
      name: payload.name,
    });
  });

  it('returns PARENT_NOT_FOUND for an unknown companyId', async () => {
    // Verifies contact creation fails when the parent company is missing.
    const response = await request(app.getHttpServer())
      .post('/api/contacts')
      .send(
        buildContactPayload('missing-company', {
          companyId: '7f4f54f7-cd3c-4ef2-b22d-8f1d68d9f1aa',
        }),
      )
      .expect(404);

    expect(response.body).toMatchObject({
      success: false,
      statusCode: 404,
      code: 'PARENT_NOT_FOUND',
    });
  });

  it('rejects invalid fields and unknown properties', async () => {
    // Verifies validation rejects malformed contact payloads.
    const response = await request(app.getHttpServer())
      .post('/api/contacts')
      .send({
        companyId: 'not-a-uuid',
        email: 'invalid-email',
        phone: '0200-0001',
        extraField: 'blocked',
      })
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(response.body.details.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'companyId' }),
        expect.objectContaining({ field: 'name' }),
        expect.objectContaining({ field: 'email' }),
        expect.objectContaining({ field: 'extraField' }),
      ]),
    );
  });

  it('supports companyId, q, role, pagination, and sorting', async () => {
    // Verifies list filters, pagination, and sort order for contacts.
    const companyId = await createCompany('contact-list');
    const otherCompanyId = await createCompany('contact-list-other');
    await createContact('list-c', {
      companyId,
      name: 'codex-e2e-contact-list-c',
      role: 'User',
    });
    await createContact('list-a', {
      companyId,
      name: 'codex-e2e-contact-list-a',
      role: 'Decision Maker',
    });
    await createContact('list-b', {
      companyId,
      name: 'codex-e2e-contact-list-b',
      role: 'Decision Maker',
    });
    await createContact('list-outside', {
      companyId: otherCompanyId,
      name: 'codex-e2e-contact-list-outside',
      role: 'Decision Maker',
    });

    const response = await request(app.getHttpServer())
      .get(
        `/api/contacts?companyId=${companyId}&q=codex-e2e-contact-list&role=Decision%20Maker&sort=name&order=asc&page=1&pageSize=1`,
      )
      .expect(200);

    expect(response.body.total).toBe(2);
    expect(response.body.page).toBe(1);
    expect(response.body.pageSize).toBe(1);
    expect(response.body.totalPages).toBe(2);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      companyId,
      name: 'codex-e2e-contact-list-a',
      role: 'Decision Maker',
    });
  });

  it('distinguishes invalid uuid from missing contact', async () => {
    // Verifies invalid ids and missing contacts return different errors.
    const invalidResponse = await request(app.getHttpServer())
      .get('/api/contacts/not-a-uuid')
      .expect(400);

    expect(invalidResponse.body).toMatchObject({
      success: false,
      statusCode: 400,
      code: 'INVALID_UUID',
    });

    const missingResponse = await request(app.getHttpServer())
      .get('/api/contacts/7f4f54f7-cd3c-4ef2-b22d-8f1d68d9f1ab')
      .expect(404);

    expect(missingResponse.body).toMatchObject({
      success: false,
      statusCode: 404,
      code: 'ENTITY_NOT_FOUND',
    });
  });

  it('updates a contact and moves it to another existing company', async () => {
    // Verifies a contact can be updated and reassigned to another company.
    const sourceCompanyId = await createCompany('move-source');
    const targetCompanyId = await createCompany('move-target');
    const contactId = await createContact('move-contact', {
      companyId: sourceCompanyId,
    });

    const response = await request(app.getHttpServer())
      .post(`/api/contacts/${contactId}`)
      .send({
        companyId: targetCompanyId,
        role: 'Technical Buyer',
        phone: '0200-UPDATED',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      id: contactId,
      companyId: targetCompanyId,
      role: 'Technical Buyer',
      phone: '0200-UPDATED',
    });
  });

  it('keeps the original data when moving to an unknown company', async () => {
    // Verifies failed reassignment does not mutate the original contact.
    const companyId = await createCompany('move-missing-company');
    const contactId = await createContact('move-missing-contact', {
      companyId,
    });

    const response = await request(app.getHttpServer())
      .post(`/api/contacts/${contactId}`)
      .send({
        companyId: '7f4f54f7-cd3c-4ef2-b22d-8f1d68d9f1aa',
      })
      .expect(404);

    expect(response.body).toMatchObject({
      success: false,
      statusCode: 404,
      code: 'PARENT_NOT_FOUND',
    });

    const detailResponse = await request(app.getHttpServer())
      .get(`/api/contacts/${contactId}`)
      .expect(200);

    expect(detailResponse.body.companyId).toBe(companyId);
  });

  it('soft deletes a contact', async () => {
    // Verifies soft-deleted contacts are no longer returned by the API.
    const companyId = await createCompany('contact-delete');
    const contactId = await createContact('delete', { companyId });

    await request(app.getHttpServer())
      .delete(`/api/contacts/${contactId}`)
      .expect(204);

    const detailResponse = await request(app.getHttpServer())
      .get(`/api/contacts/${contactId}`)
      .expect(404);

    expect(detailResponse.body).toMatchObject({
      success: false,
      statusCode: 404,
      code: 'ENTITY_NOT_FOUND',
    });
  });

  async function createCompany(scope: string): Promise<string> {
    companySeq += 1;

    const response = await request(app.getHttpServer())
      .post('/api/companies')
      .send({
        name: `codex-e2e-company-${scope}-${companySeq}`,
        email: `contact-company-${companySeq}@test.local`,
        phone: `0100-${String(companySeq).padStart(4, '0')}`,
        website: `https://contact-company-${companySeq}.example.com`,
      })
      .expect(201);

    return response.body.companyId;
  }

  async function createContact(
    scope: string,
    overrides: Partial<ContactPayload> = {},
  ): Promise<string> {
    const payload = buildContactPayload(scope, overrides);
    const response = await request(app.getHttpServer())
      .post('/api/contacts')
      .send(payload)
      .expect(201);

    return response.body.id;
  }

  function buildContactPayload(
    scope: string,
    overrides: Partial<ContactPayload> = {},
  ): ContactPayload {
    contactSeq += 1;

    return {
      companyId: '00000000-0000-4000-8000-000000000001',
      name: `codex-e2e-contact-${scope}-${contactSeq}`,
      email: `contact-${contactSeq}@test.local`,
      phone: `0200-${String(contactSeq).padStart(4, '0')}`,
      role: 'User',
      ...overrides,
    };
  }
});

type ContactPayload = {
  companyId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
};
