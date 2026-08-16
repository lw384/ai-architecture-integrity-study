import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  PRODUCTION_IGNORE_GLOBS,
  isGeneratedSourcePath,
  isProductionSourcePath,
  isStorySourcePath,
  isTestSourcePath,
} from '../../adapters/_shared/production-files.mjs';
import {
  analyzeStateDistribution,
} from '../../adapters/computed-metrics/implementations/frontend/frontend-source-analysis.mjs';
import {
  analyzeMethodParameters,
} from '../../adapters/computed-metrics/implementations/backend/backend-source-analysis.mjs';
import { runAdapter as runCrossStaticAdapter } from '../../adapters/cross-static/adapter.mjs';
import { buildFrontendInventory } from '../../adapters/frontend-static/inventory.mjs';
import backendEslintConfig from '../../rulepacks/ts-nestjs-backend/tool-configs/eslint.config.js';

const require = createRequire(import.meta.url);
const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function writeFixture(rootDir, relativePath, content) {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

test('production path policy excludes test, spec, story, and generated sources', () => {
  const excluded = [
    'src/Widget.test.jsx',
    'src/Widget.spec.ts',
    'src/Widget.story.jsx',
    'src/Widget.stories.jsx',
    'src/Widget.generated.ts',
    'src/__tests__/Widget.jsx',
    'src/test/Widget.ts',
    'src/tests/Widget.ts',
    'src/stories/Widget.jsx',
    'src/generated/Widget.ts',
    'src/__generated__/Widget.ts',
  ];

  for (const filePath of excluded) {
    assert.equal(isProductionSourcePath(filePath), false, filePath);
  }

  assert.equal(isProductionSourcePath('src/pages/Widget.jsx'), true);
  assert.equal(isTestSourcePath('src/Widget.spec.ts'), true);
  assert.equal(isStorySourcePath('src/stories/Widget.jsx'), true);
  assert.equal(isGeneratedSourcePath('src/Widget.generated.ts'), true);
});

test('frontend inventory and backend ESLint share the production ignore policy', (t) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-production-frontend-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  writeFixture(projectRoot, 'src/Widget.jsx', 'export const Widget = () => <div />;');

  for (const relative of [
    'src/Widget.test.jsx',
    'src/Widget.spec.jsx',
    'src/Widget.story.jsx',
    'src/Widget.generated.jsx',
    'src/__tests__/Widget.jsx',
    'src/generated/Widget.jsx',
  ]) {
    writeFixture(projectRoot, relative, 'export const Widget = () => <div />;');
  }

  const inventory = buildFrontendInventory(projectRoot);
  const backendIgnores = backendEslintConfig[0].ignores;

  assert.deepEqual(inventory.files.map((file) => file.relative), ['src/Widget.jsx']);

  for (const pattern of PRODUCTION_IGNORE_GLOBS) {
    assert.ok(backendIgnores.includes(pattern), `backend missing ${pattern}`);
  }
});

test('dep-cruiser excludes the same non-production source families', () => {
  const config = require('../../adapters/dep-cruiser/config.cjs');
  const excludedPath = new RegExp(config.options.exclude.path);

  for (const filePath of [
    'src/company/company.service.spec.ts',
    'src/company/company.service.test.tsx',
    'src/company/Company.stories.jsx',
    'src/generated/company.service.ts',
    'src/__tests__/company.service.ts',
  ]) {
    assert.match(filePath, excludedPath);
  }

  assert.doesNotMatch('src/company/company.service.ts', excludedPath);
});

test('computed production metrics ignore non-production files', (t) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-production-metrics-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

  const providerSource = 'export const Widget = () => <Theme.Provider value={{}}><div /></Theme.Provider>;';
  writeFixture(projectRoot, 'frontend/src/components/Widget.jsx', providerSource);
  writeFixture(projectRoot, 'frontend/src/components/Widget.test.jsx', providerSource);
  writeFixture(projectRoot, 'frontend/src/components/Widget.spec.jsx', providerSource);
  writeFixture(projectRoot, 'frontend/src/components/Widget.stories.jsx', providerSource);
  writeFixture(projectRoot, 'frontend/src/generated/Widget.jsx', providerSource);

  const state = analyzeStateDistribution(path.join(projectRoot, 'frontend'));
  assert.equal(state.contextProviders, 1);
  assert.deepEqual(state.details.map((item) => item.file), ['src/components/Widget.jsx']);

  const serviceSource = 'export class WidgetService { run(a: unknown, b: unknown, c: unknown, d: unknown) {} }';
  writeFixture(projectRoot, 'backend/src/widget.service.ts', serviceSource);
  writeFixture(projectRoot, 'backend/src/test/widget.service.ts', serviceSource);
  writeFixture(projectRoot, 'backend/src/generated/widget.service.ts', serviceSource);
  writeFixture(projectRoot, 'backend/src/widget.story.service.ts', serviceSource);

  const methods = analyzeMethodParameters(path.join(projectRoot, 'backend'));
  assert.equal(methods.totalMethods, 1);
  assert.equal(methods.violatingMethods, 1);
  assert.deepEqual(methods.details.map((item) => item.file), ['src/widget.service.ts']);
});

test('cross-static endpoint inventory ignores non-production frontend requests', async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-production-cross-'));
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeFixture(workspaceRoot, 'backend/src/main.ts', "app.setGlobalPrefix('api');");
  writeFixture(workspaceRoot, 'backend/src/app.module.ts', `
    import { Module } from '@nestjs/common';
    import { HealthModule } from './modules/health/health.module';
    @Module({ imports: [HealthModule] }) export class AppModule {}
  `);
  writeFixture(workspaceRoot, 'backend/src/modules/health/health.module.ts', `
    import { Module } from '@nestjs/common';
    import { HealthController } from './health.controller';
    @Module({ controllers: [HealthController] }) export class HealthModule {}
  `);
  writeFixture(workspaceRoot, 'backend/src/modules/health/health.controller.ts', `
    import { Controller, Get } from '@nestjs/common';
    @Controller('health') export class HealthController { @Get() getHealth() {} }
  `);
  writeFixture(workspaceRoot, 'frontend/src/api/request.js', `
    export const request = (url) => url;
  `);
  writeFixture(workspaceRoot, 'frontend/src/api/healthApi.js', `
    import { request } from './request';
    export const getHealth = () => request('/health');
  `);
  writeFixture(workspaceRoot, 'frontend/src/api/healthApi.test.js', `
    import { request } from './request';
    request('/missing-test-route');
  `);
  writeFixture(workspaceRoot, 'frontend/src/api/healthApi.stories.js', `
    import { request } from './request';
    request('/missing-story-route');
  `);
  writeFixture(workspaceRoot, 'frontend/src/generated/healthApi.js', `
    import { request } from '../api/request';
    request('/missing-generated-route');
  `);

  const result = await runCrossStaticAdapter({
    targetDir: workspaceRoot,
    adapterConfig: {
      configPath: path.join(harnessRoot, 'rulepacks/cross/tool-configs/cross-static.config.json'),
    },
    toolVersion: 'test',
  });

  const endpointFindings = result.normalized_events.filter(
    (event) => event.source_rule_id === 'cross-static/frontend-endpoint-missing-backend-route',
  );
  assert.deepEqual(endpointFindings, []);
  assert.equal(result.execution_meta.frontend_endpoint_count, 1);
});
