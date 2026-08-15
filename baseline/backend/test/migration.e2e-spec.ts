import { DataSource } from 'typeorm';
import {
  closeTestDataSource,
  getTestDataSource,
  listConstraintNames,
  listIndexNames,
} from './setup/test-database';

jest.setTimeout(30000);

describe('Database migrations (e2e)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await getTestDataSource();
  });

  afterAll(async () => {
    await closeTestDataSource();
  });

  beforeEach(async () => {
    await dataSource.query('DROP SCHEMA IF EXISTS public CASCADE');
    await dataSource.query('CREATE SCHEMA public');
    await dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await dataSource.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await dataSource.synchronize();
  });

  it('runs the migration on a clean schema', async () => {
    // Verifies the migration creates the expected constraint and index.
    await dataSource.runMigrations();

    await expect(listConstraintNames(dataSource, 'contacts')).resolves.toEqual(
      expect.arrayContaining(['fk_contacts_company_id']),
    );
    await expect(listIndexNames(dataSource, 'contacts')).resolves.toEqual(
      expect.arrayContaining(['idx_contacts_company_id']),
    );
  });

  it('rolls back the migration', async () => {
    // Verifies rollback removes the migration artifacts.
    await dataSource.runMigrations();
    await dataSource.undoLastMigration();

    await expect(
      listConstraintNames(dataSource, 'contacts'),
    ).resolves.not.toContain('fk_contacts_company_id');
    await expect(listIndexNames(dataSource, 'contacts')).resolves.not.toContain(
      'idx_contacts_company_id',
    );
  });

  it('can rerun the migration after rollback', async () => {
    // Verifies the migration can be applied again after rollback.
    await dataSource.runMigrations();
    await dataSource.undoLastMigration();
    await dataSource.runMigrations();

    await expect(
      listConstraintNames(dataSource, 'contacts'),
    ).resolves.toContain('fk_contacts_company_id');
  });

  it('prevents orphan companyId values', async () => {
    // Verifies the foreign key blocks orphan contact rows.
    await dataSource.runMigrations();

    await expect(
      dataSource.query(
        `
          INSERT INTO "contacts" ("id", "companyId", "name", "email", "phone", "role", "createdAt", "updatedAt")
          VALUES (gen_random_uuid(), $1, 'Orphan Contact', 'orphan@test.local', '0200-7777', 'User', NOW(), NOW())
        `,
        ['7f4f54f7-cd3c-4ef2-b22d-8f1d68d9f1aa'],
      ),
    ).rejects.toThrow(/fk_contacts_company_id/i);
  });
});
