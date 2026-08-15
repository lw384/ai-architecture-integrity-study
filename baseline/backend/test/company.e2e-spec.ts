import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { CompanyStatus, Industry } from '../src/modules/company/company.entity';
import { createTestApp } from './setup/test-app';
import {
  closeTestDataSource,
  resetDatabaseSchema,
  truncateBusinessTables,
} from './setup/test-database';

jest.setTimeout(30000);

describe('Company API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let companySeq = 0;

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

  it('creates a valid company and fetches it', async () => {
    // Verifies a company can be created and fetched by id.
    const payload = buildCompanyPayload('create', {
      status: CompanyStatus.ACTIVE,
      industry: Industry.TECHNOLOGY,
    });

    const createResponse = await request(app.getHttpServer())
      .post('/api/companies')
      .send(payload)
      .expect(201);

    expect(createResponse.body).toMatchObject({
      success: true,
      message: 'Company created successfully',
    });

    const detailResponse = await request(app.getHttpServer())
      .get(`/api/companies/${createResponse.body.companyId}`)
      .expect(200);

    expect(detailResponse.body).toMatchObject({
      id: createResponse.body.companyId,
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      website: payload.website,
      status: payload.status,
      industry: payload.industry,
    });
  });

  it('uses the default status when status is omitted', async () => {
    // Verifies the API applies the default company status.
    const payload = buildCompanyPayload('default-status');
    delete payload.status;

    const createResponse = await request(app.getHttpServer())
      .post('/api/companies')
      .send(payload)
      .expect(201);

    const detailResponse = await request(app.getHttpServer())
      .get(`/api/companies/${createResponse.body.companyId}`)
      .expect(200);

    expect(detailResponse.body.status).toBe(CompanyStatus.PENDING);
  });

  it('rejects missing required fields', async () => {
    // Verifies validation rejects requests missing required fields.
    const response = await request(app.getHttpServer())
      .post('/api/companies')
      .send({
        email: 'company-required@test.local',
      })
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(response.body.details.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'name' })]),
    );
  });

  it('rejects invalid company fields and unknown properties', async () => {
    // Verifies validation rejects invalid fields and extra payload properties.
    const response = await request(app.getHttpServer())
      .post('/api/companies')
      .send({
        name: 'codex-e2e-invalid-company',
        email: 'invalid-email',
        website: 'not-a-url',
        status: 'BAD_STATUS',
        industry: 'BAD_INDUSTRY',
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
        expect.objectContaining({ field: 'email' }),
        expect.objectContaining({ field: 'website' }),
        expect.objectContaining({ field: 'status' }),
        expect.objectContaining({ field: 'industry' }),
        expect.objectContaining({ field: 'extraField' }),
      ]),
    );
  });

  it('supports default pagination, filters, and out-of-range pages', async () => {
    // Verifies list pagination, filtering, and empty last-page behavior.
    const activeTechA = await createCompany('list-a', {
      status: CompanyStatus.ACTIVE,
      industry: Industry.TECHNOLOGY,
      phone: '555-101',
    });
    await createCompany('list-b', {
      status: CompanyStatus.ACTIVE,
      industry: Industry.TECHNOLOGY,
      phone: '555-102',
    });
    await createCompany('list-c', {
      status: CompanyStatus.INACTIVE,
      industry: Industry.FINANCE,
      phone: '555-103',
    });

    const defaultList = await request(app.getHttpServer())
      .get('/api/companies')
      .expect(200);

    expect(defaultList.body.page).toBe(1);
    expect(defaultList.body.pageSize).toBe(10);

    const filteredList = await request(app.getHttpServer())
      .get(
        `/api/companies?q=555-10&status=${CompanyStatus.ACTIVE}&industry=${Industry.TECHNOLOGY}&page=1&pageSize=1`,
      )
      .expect(200);

    expect(filteredList.body.total).toBe(2);
    expect(filteredList.body.page).toBe(1);
    expect(filteredList.body.pageSize).toBe(1);
    expect(filteredList.body.totalPages).toBe(2);
    expect(filteredList.body.items).toHaveLength(1);

    const lastPage = await request(app.getHttpServer())
      .get(
        `/api/companies?q=555-10&status=${CompanyStatus.ACTIVE}&industry=${Industry.TECHNOLOGY}&page=3&pageSize=1`,
      )
      .expect(200);

    expect(lastPage.body.items).toEqual([]);

    const detail = await request(app.getHttpServer())
      .get(`/api/companies/${activeTechA}`)
      .expect(200);

    expect(detail.body.phone).toBe('555-101');
  });

  it('distinguishes invalid uuid from missing company', async () => {
    // Verifies invalid ids and missing entities return different errors.
    const invalidResponse = await request(app.getHttpServer())
      .get('/api/companies/not-a-uuid')
      .expect(400);

    expect(invalidResponse.body).toMatchObject({
      success: false,
      statusCode: 400,
      code: 'INVALID_UUID',
    });

    const missingResponse = await request(app.getHttpServer())
      .get('/api/companies/7f4f54f7-cd3c-4ef2-b22d-8f1d68d9f1aa')
      .expect(404);

    expect(missingResponse.body).toMatchObject({
      success: false,
      statusCode: 404,
      code: 'ENTITY_NOT_FOUND',
    });
  });

  it('updates a company', async () => {
    // Verifies partial company updates persist successfully.
    const companyId = await createCompany('update');

    const response = await request(app.getHttpServer())
      .post(`/api/companies/${companyId}`)
      .send({
        name: 'codex-e2e-company-updated',
        status: CompanyStatus.INACTIVE,
        industry: Industry.RETAIL,
      })
      .expect(201);

    expect(response.body).toMatchObject({
      id: companyId,
      name: 'codex-e2e-company-updated',
      status: CompanyStatus.INACTIVE,
      industry: Industry.RETAIL,
    });
  });

  it('deletes a company without contacts and blocks delete with contacts', async () => {
    // Verifies delete succeeds without contacts and fails with blocking contacts.
    const removableCompanyId = await createCompany('delete-free');
    const blockedCompanyId = await createCompany('delete-blocked');

    await dataSource.query(
      `
        INSERT INTO "contacts" ("id", "companyId", "name", "email", "phone", "role", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), $1, 'Delete Blocker', 'delete-blocker@test.local', '0200-9000', 'User', NOW(), NOW())
      `,
      [blockedCompanyId],
    );

    await request(app.getHttpServer())
      .delete(`/api/companies/${removableCompanyId}`)
      .expect(204);

    const deletedDetail = await request(app.getHttpServer())
      .get(`/api/companies/${removableCompanyId}`)
      .expect(404);

    expect(deletedDetail.body.code).toBe('ENTITY_NOT_FOUND');

    const blockedResponse = await request(app.getHttpServer())
      .delete(`/api/companies/${blockedCompanyId}`)
      .expect(409);

    expect(blockedResponse.body).toMatchObject({
      success: false,
      statusCode: 409,
      code: 'REFERENTIAL_INTEGRITY_VIOLATION',
    });
  });

  async function createCompany(
    scope: string,
    overrides: Partial<CompanyPayload> = {},
  ): Promise<string> {
    const payload = buildCompanyPayload(scope, overrides);
    const response = await request(app.getHttpServer())
      .post('/api/companies')
      .send(payload)
      .expect(201);

    return response.body.companyId;
  }

  function buildCompanyPayload(
    scope: string,
    overrides: Partial<CompanyPayload> = {},
  ): CompanyPayload {
    companySeq += 1;

    return {
      name: `codex-e2e-company-${scope}-${companySeq}`,
      email: `company-${companySeq}@test.local`,
      phone: `0100-${String(companySeq).padStart(4, '0')}`,
      website: `https://company-${companySeq}.example.com`,
      status: CompanyStatus.PENDING,
      industry: Industry.OTHER,
      ...overrides,
    };
  }
});

type CompanyPayload = {
  name: string;
  email: string;
  phone: string;
  website: string;
  status?: CompanyStatus;
  industry: Industry;
};
