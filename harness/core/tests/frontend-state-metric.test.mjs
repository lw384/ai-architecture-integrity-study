import assert from 'node:assert/strict';
import test from 'node:test';

import { run } from '../../adapters/computed-metrics/implementations/frontend/FE-STATE-M-001.mjs';
import { runFrontendMetric } from './frontend-metric-test-helpers.mjs';

test('context-provider ratio includes local hooks, React-qualified hooks, and JSX providers', async () => {
    const result = await runFrontendMetric(run, {
        'src/State.jsx': `
            import React, { useReducer, useState } from 'react';
            export function State() {
                useState(0);
                useReducer((state) => state, 0);
                React.useState(1);
                return <><Theme.Provider value={{}} /><Auth.Provider value={{}} /></>;
            }
        `,
    });

    assert.equal(result.details.target.localStateHooks, 3);
    assert.equal(result.details.target.contextProviders, 2);
    assert.equal(result.score.value, 0.4);
});

test('state ratio is zero when production files contain neither signal and ignores tests', async () => {
    const result = await runFrontendMetric(run, {
        'src/Empty.jsx': 'export const Empty = () => <div />;',
        'src/Empty.test.jsx': 'export const Test = () => <Theme.Provider />;',
    });

    assert.equal(result.score.value, 0);
    assert.equal(result.details.target.details.length, 0);
});
