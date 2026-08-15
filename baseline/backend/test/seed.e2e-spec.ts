import { execSync } from 'node:child_process';
import { DataSource } from 'typeorm';
import { closeTestDataSource, resetDatabaseSchema } from './setup/test-database';

jest.setTimeout(30000);

describe('Seed scenarios (e2e)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await resetDatabaseSchema();
  });

  afterAll(async () => {
    await closeTestDataSource();
  });

  beforeEach(async () => {
    dataSource = await resetDatabaseSchema();
  });

  it('creates the demo seed with expected counts', async () => {
    // Verifies the demo seed creates the expected company and contact counts.
    runSeedCommand('pnpm db:reset:seed:demo');

    const [{ count: companyCount }] = await dataSource.query(
      `
        SELECT COUNT(*)::int AS count
        FROM "companies"
        WHERE "name" LIKE 'Demo Seed Company%'
      `,
    );
    const [{ count: contactCount }] = await dataSource.query(
      `
        SELECT COUNT(*)::int AS count
        FROM "contacts"
        WHERE "email" LIKE 'demo-contact-%@baseline.local'
      `,
    );

    expect(companyCount).toBe(10);
    expect(contactCount).toBe(33);
  });

  it('does not duplicate demo seed rows across reruns', async () => {
    // Verifies rerunning the demo seed does not duplicate baseline rows.
    runSeedCommand('pnpm db:reset:seed:demo');
    runSeedCommand('pnpm db:seed:demo');

    const [{ count: companyCount }] = await dataSource.query(
      `
        SELECT COUNT(*)::int AS count
        FROM "companies"
        WHERE "name" LIKE 'Demo Seed Company%'
      `,
    );
    const [{ count: contactCount }] = await dataSource.query(
      `
        SELECT COUNT(*)::int AS count
        FROM "contacts"
        WHERE "email" LIKE 'demo-contact-%@baseline.local'
      `,
    );

    expect(companyCount).toBe(10);
    expect(contactCount).toBe(33);
  });

  it('creates edge-case seed data for nulls, max length, pagination, and valid references', async () => {
    // Verifies the edge-case seed covers nulls, long fields, pagination, and valid links.
    runSeedCommand('pnpm db:reset:seed:edge-case');

    const [{ count: companyCount }] = await dataSource.query(
      `
        SELECT COUNT(*)::int AS count
        FROM "companies"
        WHERE "name" LIKE 'Edge Seed Company%'
           OR "name" LIKE 'Edge Seed Company Long Name%'
      `,
    );
    const [{ count: emptyCompanyCount }] = await dataSource.query(
      `
        SELECT COUNT(*)::int AS count
        FROM "companies" company
        WHERE company.name = 'Edge Seed Company 00 Empty Contacts'
          AND NOT EXISTS (
            SELECT 1
            FROM "contacts" contact
            WHERE contact."companyId" = company.id
          )
      `,
    );
    const [{ count: nullFieldCount }] = await dataSource.query(
      `
        SELECT COUNT(*)::int AS count
        FROM "companies"
        WHERE "name" = 'Edge Seed Company 01 Missing Fields'
          AND "email" IS NULL
          AND "phone" IS NULL
          AND "website" IS NULL
      `,
    );
    const [{ count: longNameCompanyCount }] = await dataSource.query(
      `
        SELECT COUNT(*)::int AS count
        FROM "companies"
        WHERE "name" LIKE 'Edge Seed Company Long Name%'
          AND LENGTH("name") >= 250
      `,
    );
    const [{ count: maxLengthRoleCount }] = await dataSource.query(
      `
        SELECT COUNT(*)::int AS count
        FROM "contacts"
        WHERE LENGTH(COALESCE("role", '')) = 100
      `,
    );
    const [{ count: orphanCount }] = await dataSource.query(
      `
        SELECT COUNT(*)::int AS count
        FROM "contacts" contact
        LEFT JOIN "companies" company ON company.id = contact."companyId"
        WHERE company.id IS NULL
      `,
    );

    expect(companyCount).toBe(25);
    expect(emptyCompanyCount).toBe(1);
    expect(nullFieldCount).toBe(1);
    expect(longNameCompanyCount).toBeGreaterThanOrEqual(1);
    expect(maxLengthRoleCount).toBeGreaterThanOrEqual(1);
    expect(orphanCount).toBe(0);
  });
});

function runSeedCommand(command: string) {
  execSync(command, {
    cwd: '/Users/luowei/project/ai-architecture-integrity-study/baseline/backend',
    stdio: 'pipe',
  });
}
