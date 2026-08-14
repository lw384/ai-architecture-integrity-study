import { DataSource } from 'typeorm';

export type SeedScenarioName = 'demo' | 'edge-case';

export type SeedSummary = {
  scenario: SeedScenarioName;
  companiesCreated: number;
  contactsCreated: number;
  notes: string[];
};

export type SeedContext = {
  dataSource: DataSource;
  now: Date;
};

export type SeedScenario = {
  name: SeedScenarioName;
  run: (context: SeedContext) => Promise<SeedSummary>;
};
