import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { readTaskConfig } from '../io/task_config_reader.mjs';
import { runMetrics } from '../layers/metrics_runner.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const harnessRoot = path.resolve(testDir, '../..');
const rulepackDir = path.join(harnessRoot, 'rulepacks/js-react-frontend');
const canonicalMetricIds = [
    'FE-COM-M-001',
    'FE-STATE-M-001',
    'FE-ROUTE-M-001',
    'FE-STYLE-M-001',
    'FE-DATA-M-001',
    'FE-COMM-M-001',
    'FE-DUP-M-001',
];

test('every evaluation task enables exactly the seven canonical frontend metrics', () => {
    for (const taskName of ['Base', 'T0', 'T1', 'T2', 'T3']) {
        const task = readTaskConfig(path.join(harnessRoot, `tasks/${taskName}.eval.yaml`));
        const frontend = task.evaluation_scopes.find((scope) => scope.scope_id === 'frontend');

        assert.equal(frontend.rulepack_version, '0.4.0', taskName);
        assert.deepEqual([...frontend.enabled.metrics].sort(), [...canonicalMetricIds].sort(), taskName);
    }
});

test('the frontend rulepack resolves and executes all seven registered metric implementations', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-metric-registration-'));

    try {
        fs.mkdirSync(path.join(rootDir, 'src/routes'), { recursive: true });
        fs.writeFileSync(path.join(rootDir, 'src/App.jsx'), 'export const App = () => <main />;', 'utf8');
        fs.writeFileSync(path.join(rootDir, 'src/routes/index.js'), 'export const routes = [];', 'utf8');

        const results = await runMetrics({
            targetDir: rootDir,
            baselineDir: null,
            rulepackDir,
            taskConfig: { enabled: { metrics: canonicalMetricIds } },
        });

        assert.equal(results.length, canonicalMetricIds.length);
        assert.deepEqual(
            results.map((result) => result.name.replace(/-[a-z].*$/, '')).sort(),
            [...canonicalMetricIds].sort(),
        );
        assert.deepEqual(results.map((result) => result.status), Array(results.length).fill('pass'));
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});
