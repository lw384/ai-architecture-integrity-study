import assert from 'node:assert/strict';
import test from 'node:test';

import { run } from '../../adapters/computed-metrics/implementations/frontend/FE-DATA-M-001.mjs';
import { runFrontendMetric } from './frontend-metric-test-helpers.mjs';

test('data wrapping ratio counts fetch and aliased axios calls by approved file location', async () => {
    const result = await runFrontendMetric(run, {
        'src/api/client.js': `
            import http from 'axios';
            export const loadA = () => fetch('/a');
            export const loadB = () => http.get('/b');
        `,
        'src/pages/Page.jsx': `
            import { get as axiosGet } from 'axios';
            export const loadC = () => axiosGet('/c');
            export const loadD = () => fetch('/d');
        `,
    }, { approved_data_paths: ['^src\\/api(?:\\/.*)?\\.(js|jsx|ts|tsx)$'] });

    assert.equal(result.details.target.totalCalls, 4);
    assert.equal(result.details.target.approvedCalls, 2);
    assert.equal(result.score.value, 0.5);
});

test('no network calls is a fully wrapped result and test calls are excluded', async () => {
    const result = await runFrontendMetric(run, {
        'src/App.jsx': 'export const App = () => <main />;',
        'src/App.test.jsx': "fetch('/not-production');",
    });

    assert.equal(result.details.target.totalCalls, 0);
    assert.equal(result.score.value, 1);
});
