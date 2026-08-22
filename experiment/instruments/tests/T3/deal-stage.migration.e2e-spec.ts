// Migration acceptance for T3 Deal stage canonicalisation.
//
// The test rewinds at least the latest migration and, when necessary, keeps
// rewinding until the Deal stage column accepts a legacy free-form value. It
// then inserts all mappings required by T3 and reapplies the pending migration.
import { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import request from "supertest";
import { createTestApp } from "../../setup/test-app";
import {
  closeTestDataSource,
  resetDatabaseSchema,
} from "../../setup/test-database";
import { discoverCollectionRoute, normalizeResponse } from "./acceptance-adapter";

jest.setTimeout(60000);

const COMPANY_ID = "10000000-0000-4000-8000-000000000099";
const PROBE_DEAL_ID = "30000000-0000-4000-8000-000000000099";
const CANONICAL_STAGES = [
  "lead",
  "qualified",
  "active",
  "negotiation",
  "closed_won",
  "closed_lost",
] as const;

const LEGACY_STAGE_CASES: Array<{
  id: string;
  input: string | null;
  expected: (typeof CANONICAL_STAGES)[number];
}> = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    input: "LEAD",
    expected: "lead",
  },
  {
    id: "30000000-0000-4000-8000-000000000002",
    input: "Qualified",
    expected: "qualified",
  },
  {
    id: "30000000-0000-4000-8000-000000000003",
    input: "ACTIVE",
    expected: "active",
  },
  {
    id: "30000000-0000-4000-8000-000000000004",
    input: "Negotiation",
    expected: "negotiation",
  },
  {
    id: "30000000-0000-4000-8000-000000000005",
    input: "CLOSED_WON",
    expected: "closed_won",
  },
  {
    id: "30000000-0000-4000-8000-000000000006",
    input: "CLOSED_LOST",
    expected: "closed_lost",
  },
  {
    id: "30000000-0000-4000-8000-000000000007",
    input: "won",
    expected: "closed_won",
  },
  {
    id: "30000000-0000-4000-8000-000000000008",
    input: "lost",
    expected: "closed_lost",
  },
  {
    id: "30000000-0000-4000-8000-000000000009",
    input: "prospect",
    expected: "lead",
  },
  {
    id: "30000000-0000-4000-8000-000000000010",
    input: "proposal_sent",
    expected: "negotiation",
  },
  {
    id: "30000000-0000-4000-8000-000000000011",
    input: "",
    expected: "lead",
  },
  {
    id: "30000000-0000-4000-8000-000000000012",
    input: null,
    expected: "lead",
  },
  {
    id: "30000000-0000-4000-8000-000000000013",
    input: "custom-legacy-stage",
    expected: "lead",
  },
];

describe("T3 Deal stage migration (e2e)", () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = await resetDatabaseSchema();
  });

  afterEach(async () => {
    await closeTestDataSource();
  });

  // Requirements 20-24: case-insensitive canonical values, named aliases,
  // blank/null/unknown fallback, canonical post-state, and safe rerun.
  it("canonicalises every required legacy stage mapping and is safe to rerun", async () => {
    await insertCompany(dataSource);
    await insertDeal(dataSource, {
      id: PROBE_DEAL_ID,
      name: "T3 migration probe",
      stage: "lead",
    });

    const reverted = await rewindUntilFreeFormStage(dataSource);
    expect(reverted).toBeGreaterThan(0);
    await dataSource.query('DELETE FROM "deals" WHERE "id" = $1', [
      PROBE_DEAL_ID,
    ]);

    // The task explicitly requires handling null legacy values even if an
    // earlier agent happened to make T1's free-form column NOT NULL.
    await dataSource.query(
      'ALTER TABLE "deals" ALTER COLUMN "stage" DROP NOT NULL',
    );

    for (const [index, stageCase] of LEGACY_STAGE_CASES.entries()) {
      await insertDeal(dataSource, {
        id: stageCase.id,
        name: `T3 legacy stage ${index + 1}`,
        stage: stageCase.input,
      });
    }

    const applied = await dataSource.runMigrations({ transaction: "each" });
    expect(applied.length).toBeGreaterThan(0);

    const stored = await dataSource.query(
      `
        SELECT "id", "stage"
        FROM "deals"
        WHERE "id" = ANY($1::uuid[])
        ORDER BY "id"
      `,
      [LEGACY_STAGE_CASES.map((stageCase) => stageCase.id)],
    );
    expect(stored).toHaveLength(LEGACY_STAGE_CASES.length);
    for (const stageCase of LEGACY_STAGE_CASES) {
      expect(
        stored.find((row: { id: string }) => row.id === stageCase.id)?.stage,
      ).toBe(stageCase.expected);
    }
    expect(
      stored.every((row: { stage: string }) =>
        CANONICAL_STAGES.includes(
          row.stage as (typeof CANONICAL_STAGES)[number],
        ),
      ),
    ).toBe(true);

    let app: INestApplication | undefined;
    try {
      app = await createTestApp();
      const dealBasePath = await discoverCollectionRoute(
        app.getHttpServer(),
        "deals",
      );
      for (const stageCase of LEGACY_STAGE_CASES) {
        const response = await request(app.getHttpServer())
          .get(`${dealBasePath}/${stageCase.id}`)
          .expect(200);
        expect(normalizeResponse(response.body).stage).toBe(stageCase.expected);
      }

      const rerun = await dataSource.runMigrations({ transaction: "each" });
      expect(rerun).toEqual([]);

      const afterRerun = await dataSource.query(
        'SELECT COUNT(*)::int AS count FROM "deals" WHERE "id" = ANY($1::uuid[])',
        [LEGACY_STAGE_CASES.map((stageCase) => stageCase.id)],
      );
      expect(Number(afterRerun[0].count)).toBe(LEGACY_STAGE_CASES.length);
    } finally {
      if (app) {
        await app.close();
      }
    }
  });
});

async function rewindUntilFreeFormStage(
  dataSource: DataSource,
): Promise<number> {
  let reverted = 0;
  const maximum = Math.max(dataSource.migrations.length, 1);

  do {
    const executed = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM "migrations"',
    );
    if (Number(executed[0]?.count ?? 0) === 0) {
      break;
    }
    await dataSource.undoLastMigration({ transaction: "each" });
    reverted += 1;

    if (await acceptsArbitraryStage(dataSource)) {
      return reverted;
    }
  } while (reverted < maximum);

  throw new Error(
    "Could not reach the pre-T3 schema that accepts free-form Deal stages",
  );
}

async function acceptsArbitraryStage(dataSource: DataSource): Promise<boolean> {
  try {
    await dataSource.query('UPDATE "deals" SET "stage" = $1 WHERE "id" = $2', [
      "t3-free-form-probe",
      PROBE_DEAL_ID,
    ]);
    await dataSource.query('UPDATE "deals" SET "stage" = $1 WHERE "id" = $2', [
      "lead",
      PROBE_DEAL_ID,
    ]);
    return true;
  } catch {
    return false;
  }
}

async function insertCompany(dataSource: DataSource): Promise<void> {
  const now = new Date("2026-08-01T12:00:00.000Z");
  await insertAvailableColumns(dataSource, "companies", {
    id: COMPANY_ID,
    name: "T3 migration company",
    email: "t3-migration-company@test.local",
    phone: "0300-0099",
    website: "https://t3-migration-company.example.com",
    status: "2",
    industry: "OTHER",
    lastContactedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
}

async function insertDeal(
  dataSource: DataSource,
  input: { id: string; name: string; stage: string | null },
): Promise<void> {
  const now = new Date("2026-08-01T12:00:00.000Z");
  await insertAvailableColumns(dataSource, "deals", {
    id: input.id,
    name: input.name,
    value: 25000,
    companyId: COMPANY_ID,
    stage: input.stage,
    expectedCloseDate: null,
    primaryContactId: null,
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
      `Table ${tableName} was not available for migration testing`,
    );
  }

  const columns = entries.map(([name]) => `"${name}"`).join(", ");
  const placeholders = entries.map((_, index) => `$${index + 1}`).join(", ");
  await dataSource.query(
    `INSERT INTO "${tableName}" (${columns}) VALUES (${placeholders})`,
    entries.map(([, value]) => value),
  );
}
