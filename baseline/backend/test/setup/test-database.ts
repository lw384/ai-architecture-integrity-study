import { DataSource } from 'typeorm';
import migrationDataSource from '../../src/core/database/data-source';

export async function getTestDataSource(): Promise<DataSource> {
  if (!migrationDataSource.isInitialized) {
    await migrationDataSource.initialize();
  }

  return migrationDataSource;
}

export async function resetDatabaseSchema(): Promise<DataSource> {
  const dataSource = await getTestDataSource();

  // clean schema
  await dataSource.query('DROP SCHEMA IF EXISTS public CASCADE');
  await dataSource.query('CREATE SCHEMA public');
  await dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await dataSource.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  // base tables
  await dataSource.synchronize();

  // constraints/indexes
  await dataSource.runMigrations();

  return dataSource;
}

export async function truncateBusinessTables(
  dataSource: DataSource,
): Promise<void> {
  await dataSource.query(
    'TRUNCATE TABLE "contacts", "companies" RESTART IDENTITY CASCADE',
  );
}

export async function closeTestDataSource(): Promise<void> {
  if (migrationDataSource.isInitialized) {
    await migrationDataSource.destroy();
  }
}

export async function listConstraintNames(
  dataSource: DataSource,
  tableName: string,
): Promise<string[]> {
  const rows = await dataSource.query(
    `
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = $1::regclass
      ORDER BY conname
    `,
    [tableName],
  );

  return rows.map((row: { conname: string }) => row.conname);
}

export async function listIndexNames(
  dataSource: DataSource,
  tableName: string,
): Promise<string[]> {
  const rows = await dataSource.query(
    `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = $1
      ORDER BY indexname
    `,
    [tableName],
  );

  return rows.map((row: { indexname: string }) => row.indexname);
}
