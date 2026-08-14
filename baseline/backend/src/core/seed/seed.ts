import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../../app.module';
import { demoSeedScenario } from './scenarios/demo.seed';
import { edgeCaseSeedScenario } from './scenarios/edge-case.seed';
import { SeedScenario, SeedScenarioName } from './seed.types';
import { resetSeedTables } from './seed.utils';

const logger = new Logger('Seed');

const scenarios: Record<SeedScenarioName, SeedScenario> = {
  demo: demoSeedScenario,
  'edge-case': edgeCaseSeedScenario,
};

const parseArgs = (argv: string[]) => {
  const scenarioName = (argv[0] ?? 'demo') as SeedScenarioName;
  const shouldReset = argv.includes('--reset');

  if (!(scenarioName in scenarios)) {
    throw new Error(
      `Unknown seed scenario "${scenarioName}". Use one of: ${Object.keys(scenarios).join(', ')}`,
    );
  }

  return {
    scenarioName,
    shouldReset,
  };
};

const run = async () => {
  const { scenarioName, shouldReset } = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const dataSource = app.get(DataSource);

    if (shouldReset) {
      await resetSeedTables({ dataSource, now: new Date() });
      logger.log('Reset companies and contacts tables.');
    }

    const summary = await scenarios[scenarioName].run({
      dataSource,
      now: new Date(),
    });

    logger.log(
      `Scenario ${summary.scenario} completed: ${summary.companiesCreated} companies, ${summary.contactsCreated} contacts.`,
    );

    for (const note of summary.notes) {
      logger.log(note);
    }
  } finally {
    await app.close();
  }
};

void run();
