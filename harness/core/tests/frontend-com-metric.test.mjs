import assert from 'node:assert/strict';
import test from 'node:test';

import { run } from '../../adapters/computed-metrics/implementations/frontend/FE-COM-M-001.mjs';
import { runFrontendMetric } from './frontend-metric-test-helpers.mjs';

test('JSX depth uses each component file maximum and averages those maxima', async () => {
    const result = await runFrontendMetric(run, {
        'src/Deep.jsx': `
            export function Deep() {
                return <main><section><span>deep</span></section></main>;
            }
        `,
        'src/Flat.tsx': `
            export function Flat() {
                return <div>flat</div>;
            }
        `,
    });

    assert.equal(result.details.target.totalComponents, 2);
    assert.equal(result.score.value, 2);
    assert.deepEqual(
        result.details.target.details.map(({ file, maxDepth }) => ({ file, maxDepth })),
        [
            { file: 'src/Deep.jsx', maxDepth: 3 },
            { file: 'src/Flat.tsx', maxDepth: 1 },
        ],
    );
});

test('configured technical wrappers and fragments are transparent to JSX depth', async () => {
    const result = await runFrontendMetric(run, {
        'src/Wrapped.jsx': `
            export function Wrapped() {
                return <><Portal><Modal><article><strong>x</strong></article></Modal></Portal></>;
            }
        `,
        'src/Wrapped.test.jsx': '<div><div><div><div><div /></div></div></div></div>',
    }, { transparent_wrappers: ['Portal', 'Modal'] });

    assert.equal(result.details.target.totalComponents, 1);
    assert.equal(result.score.value, 2);
});
