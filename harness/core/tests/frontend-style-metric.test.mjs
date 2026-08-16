import assert from 'node:assert/strict';
import test from 'node:test';

import { run } from '../../adapters/computed-metrics/implementations/frontend/FE-STYLE-M-001.mjs';
import { runFrontendMetric } from './frontend-metric-test-helpers.mjs';

test('style mixing ratio counts files using more than one supported style mechanism', async () => {
    const result = await runFrontendMetric(run, {
        'src/Mixed.jsx': 'export const Mixed = () => <div sx={{ p: 1 }} className="box" />;',
        'src/Single.jsx': 'export const Single = () => <div style={{ color: "red" }} />;',
        'src/Styled.jsx': `
            const Root = styled('div')({ color: 'red' });
            export const Styled = () => <Root sx={{ p: 1 }} />;
        `,
        'src/Plain.js': 'export const value = 1;',
    });

    assert.equal(result.details.target.totalFiles, 4);
    assert.equal(result.details.target.mixedFiles, 2);
    assert.equal(result.score.value, 0.5);
});

test('style signals are de-duplicated within a file and test files do not affect the denominator', async () => {
    const result = await runFrontendMetric(run, {
        'src/Same.jsx': 'export const Same = () => <><div sx={{}} /><span sx={{}} /></>;',
        'src/Same.test.jsx': 'export const Test = () => <div sx={{}} className="mixed" />;',
    });

    assert.equal(result.details.target.totalFiles, 1);
    assert.equal(result.score.value, 0);
});
