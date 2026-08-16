import assert from 'node:assert/strict';
import test from 'node:test';

import { run } from '../../adapters/computed-metrics/implementations/cross/CROSS-EP-M-001.mjs';

const RULE_ID = 'CROSS-EP-C-001-frontend-api-url-resolves-to-backend-route';

function fakeConstraintsLayer({ findingCount = 0, frontendEndpointCount = 0 } = {}) {
    return {
        findings_by_rule: {
            [RULE_ID]: Array.from({ length: findingCount }, (_, index) => ({
                rule_id: RULE_ID,
                evidence: { source_tool: 'cross-static', source_rule_id: 'cross-static/frontend-endpoint-missing-backend-route', payload: {} },
                location: { file: `frontend/src/api/example${index}.js` },
            })),
        },
        adapter_meta: {
            'cross-static': {
                frontend_endpoint_count: frontendEndpointCount,
            },
        },
    };
}

test('every frontend call site resolves: ratio is 0', async () => {
    const result = await run({
        constraintsLayer: fakeConstraintsLayer({ findingCount: 0, frontendEndpointCount: 5 }),
        config: {},
    });

    assert.equal(result.score.value, 0);
    assert.equal(result.details.target.unresolvedCallSiteCount, 0);
    assert.equal(result.details.target.totalCallSiteCount, 5);
});

test('a fraction of call sites are unresolved: ratio is computed precisely', async () => {
    const result = await run({
        constraintsLayer: fakeConstraintsLayer({ findingCount: 2, frontendEndpointCount: 8 }),
        config: {},
    });

    assert.equal(result.score.value, 0.25);
    assert.equal(result.score.direction, 'lower_is_better');
    assert.equal(result.score.unit, 'ratio');
});

test('zero frontend call sites yields a null ratio rather than dividing by zero', async () => {
    const result = await run({
        constraintsLayer: fakeConstraintsLayer({ findingCount: 0, frontendEndpointCount: 0 }),
        config: {},
    });

    assert.equal(result.score.value, null);
});

test('a custom source_rule_id in config is honored instead of the default CROSS-EP-C-001 id', async () => {
    const constraintsLayer = {
        findings_by_rule: {
            'CUSTOM-EP-RULE': [{ rule_id: 'CUSTOM-EP-RULE' }],
        },
        adapter_meta: {
            'cross-static': { frontend_endpoint_count: 4 },
        },
    };

    const result = await run({
        constraintsLayer,
        config: { source_rule_id: 'CUSTOM-EP-RULE' },
    });

    assert.equal(result.details.target.unresolvedCallSiteCount, 1);
    assert.equal(result.score.value, 0.25);
});
