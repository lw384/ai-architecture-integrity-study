import assert from 'node:assert/strict';
import test from 'node:test';

import { run } from '../../adapters/computed-metrics/implementations/frontend/FE-COMM-M-001.mjs';
import { runFrontendMetric } from './frontend-metric-test-helpers.mjs';

test('prop-drilling average includes only JSX elements meeting the configured threshold', async () => {
    const result = await runFrontendMetric(run, {
        'src/Tree.jsx': `
            export const Tree = (rest) => <>
                <Wide a={1} b={2} c={3} d={4} />
                <Wider a={1} b={2} c={3} d={4} e={5} f={6} />
                <Narrow a={1} b={2} c={3} />
                <Spread {...rest} a={1} b={2} c={3} />
            </>;
        `,
    });

    assert.equal(result.details.target.candidateCount, 2);
    assert.equal(result.score.value, 5);
    assert.deepEqual(result.details.target.details.map((item) => item.propCount), [4, 6]);
});

test('prop-drilling threshold is configurable', async () => {
    const result = await runFrontendMetric(run, {
        'src/Card.tsx': 'export const Card = () => <Panel title="x" value={1} />;',
    }, { prop_drilling_threshold: 2 });

    assert.equal(result.details.target.candidateCount, 1);
    assert.equal(result.score.value, 2);
});
