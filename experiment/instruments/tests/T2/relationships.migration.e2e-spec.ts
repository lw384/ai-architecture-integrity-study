// Migration acceptance for T2. This test deliberately rewinds the generated
// workspace to the latest schema that still has T1's contacts.companyId and
// deals.contactId columns, inserts representative legacy rows, and reapplies
// the pending T2 migration(s).
import { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import request from "supertest";
import { createTestApp } from "../../setup/test-app";
import {
  closeTestDataSource,
  resetDatabaseSchema,
} from "../../setup/test-database";

jest.setTimeout(45000);

const COMPANY_ID = "10000000-0000-4000-8000-000000000001";
const CONTACT_ID = "20000000-0000-4000-8000-000000000001";
const DEAL_ID = "30000000-0000-4000-8000-000000000001";

describe("T2 relationship migration (e2e)", () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = await resetDatabaseSchema();
  });

  afterEach(async () => {
    await closeTestDataSource();
  });

  // Migration semantics 1-5: legacy foreign keys are backfilled, old response
  // fields disappear, and rerunning the migration command is harmless.
  it("backfills legacy Contact and Deal relationships without loss or duplication", async () => {
    const reverted = await rewindToT1RelationshipSchema(dataSource);
    expect(reverted).toBeGreaterThan(0);

    await insertLegacyRows(dataSource);
    const applied = await dataSource.runMigrations({ transaction: "each" });
    expect(applied.length).toBeGreaterThan(0);

    let app: INestApplication | undefined;
    try {
      app = await createTestApp();

      const contact = await request(app.getHttpServer())
        .get(`/api/contacts/${CONTACT_ID}`)
        .expect(200);
      expect(contact.body).not.toHaveProperty("companyId");
      expect(contact.body.companies).toEqual([
        expect.objectContaining({
          id: COMPANY_ID,
          name: "T2 legacy company",
          isPrimary: true,
        }),
      ]);

      const deal = await request(app.getHttpServer())
        .get(`/api/deals/${DEAL_ID}`)
        .expect(200);
      expect(deal.body).not.toHaveProperty("contactId");
      const migratedDeal = normalizeDealLinks(deal.body);
      expect(migratedDeal.contactLinks).toEqual([
        expect.objectContaining({ contactId: CONTACT_ID, role: null }),
      ]);
      expect(migratedDeal.primaryContactId).toBe(CONTACT_ID);

      // TypeORM's normal "rerun" command finds no pending migration. The
      // observable requirement is that it succeeds and does not duplicate rows.
      const rerun = await dataSource.runMigrations({ transaction: "each" });
      expect(rerun).toEqual([]);

      const contactAfterRerun = await request(app.getHttpServer())
        .get(`/api/contacts/${CONTACT_ID}`)
        .expect(200);
      const dealAfterRerun = await request(app.getHttpServer())
        .get(`/api/deals/${DEAL_ID}`)
        .expect(200);
      expect(contactAfterRerun.body.companies).toHaveLength(1);
      expect(normalizeDealLinks(dealAfterRerun.body).contactLinks).toHaveLength(
        1,
      );
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  // Migration semantics 6: down migration restores the former relationship
  // columns. The prompt explicitly makes restoration of link data best-effort.
  it("rolls back to the former single-reference schema shape", async () => {
    const reverted = await rewindToT1RelationshipSchema(dataSource);
    expect(reverted).toBeGreaterThan(0);
    await expect(hasColumn(dataSource, "contacts", "companyId")).resolves.toBe(
      true,
    );
    await expect(hasColumn(dataSource, "deals", "contactId")).resolves.toBe(
      true,
    );
  });
});

function normalizeDealLinks(body: unknown) {
  const deal = (body ?? {}) as Record<string, unknown>;
  const rawLinks = Array.isArray(deal.contactLinks)
    ? deal.contactLinks
    : Array.isArray(deal.contacts)
      ? deal.contacts
      : [];

  return {
    ...deal,
    primaryContactId:
      typeof deal.primaryContactId === "string" ? deal.primaryContactId : null,
    contactLinks: rawLinks.map((value) => {
      const link = value as Record<string, unknown>;
      return {
        // Strategy adapter — Structured exposes `contactId`; the Minimal
        // implementation exposes Contact summaries whose identifier is `id`.
        contactId: String(link.contactId ?? link.id),
        role: typeof link.role === "string" ? link.role : null,
      };
    }),
  };
}

async function rewindToT1RelationshipSchema(
  dataSource: DataSource,
): Promise<number> {
  let reverted = 0;
  const maximum = Math.max(dataSource.migrations.length, 1);

  while (
    (!(await hasColumn(dataSource, "contacts", "companyId")) ||
      !(await hasColumn(dataSource, "deals", "contactId"))) &&
    reverted < maximum
  ) {
    const executed = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM "migrations"',
    );
    if (Number(executed[0]?.count ?? 0) === 0) {
      break;
    }
    await dataSource.undoLastMigration({ transaction: "each" });
    reverted += 1;
  }

  if (!(await hasColumn(dataSource, "contacts", "companyId"))) {
    throw new Error("T2 migration rollback did not restore contacts.companyId");
  }
  if (!(await hasColumn(dataSource, "deals", "contactId"))) {
    throw new Error("T2 migration rollback did not restore deals.contactId");
  }

  return reverted;
}

async function hasColumn(
  dataSource: DataSource,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const rows = await dataSource.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
      ) AS present
    `,
    [tableName, columnName],
  );
  return Boolean(rows[0]?.present);
}

async function insertLegacyRows(dataSource: DataSource): Promise<void> {
  const now = new Date("2026-08-01T12:00:00.000Z");

  await insertAvailableColumns(dataSource, "companies", {
    id: COMPANY_ID,
    name: "T2 legacy company",
    email: "legacy-company@test.local",
    phone: "0300-0001",
    website: "https://legacy-company.example.com",
    status: "2",
    industry: "OTHER",
    lastContactedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });

  await insertAvailableColumns(dataSource, "contacts", {
    id: CONTACT_ID,
    companyId: COMPANY_ID,
    name: "T2 legacy contact",
    email: "legacy-contact@test.local",
    phone: "0400-0001",
    role: "Buyer",
    lastContactedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });

  await insertAvailableColumns(dataSource, "deals", {
    id: DEAL_ID,
    name: "T2 legacy deal",
    value: 25000,
    companyId: COMPANY_ID,
    contactId: CONTACT_ID,
    stage: "qualified",
    expectedCloseDate: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
}

async function insertAvailableColumns(
  dataSource: DataSource,
  tableName: string,
  values: Record<string, unknown>,
): Promise<void> {
  const rows = await dataSource.query(
    `
      SELECT column_name AS name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
    `,
    [tableName],
  );
  const available = new Set(rows.map((row: { name: string }) => row.name));
  const entries = Object.entries(values).filter(([name]) =>
    available.has(name),
  );

  if (entries.length === 0) {
    throw new Error(
      `Legacy table ${tableName} was not available for migration testing`,
    );
  }

  const columns = entries.map(([name]) => `"${name}"`).join(", ");
  const placeholders = entries.map((_, index) => `$${index + 1}`).join(", ");
  await dataSource.query(
    `INSERT INTO "${tableName}" (${columns}) VALUES (${placeholders})`,
    entries.map(([, value]) => value),
  );
}
