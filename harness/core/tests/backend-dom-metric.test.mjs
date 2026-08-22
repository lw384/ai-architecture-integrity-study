import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { run } from '../../adapters/computed-metrics/implementations/backend/BE-DOM-M-001.mjs';

async function runOnReport(report, config = {}, constraintsLayer = undefined) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-dom-m-001-'));
    try {
        fs.mkdirSync(path.join(dir, 'reports'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'reports/depcruise-raw.json'), JSON.stringify(report));
        return await run({ targetDir: dir, baselineDir: null, constraintsLayer, config });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

const TAG = 'BE-DOM-C-001-no-cross-module-deep-import';

test('an edge tagged with the target dep-cruiser rule is counted', async () => {
    const result = await runOnReport({
        modules: [
            {
                source: 'src/modules/orders/orders.service.ts',
                dependencies: [{ resolved: 'src/modules/users/users.service.ts', rules: [{ name: TAG }] }],
            },
        ],
    });

    assert.equal(result.score.value, 1);
    assert.equal(result.details.target.edges.length, 1);
});

test('an edge tagged with a different rule name is not counted', async () => {
    const result = await runOnReport({
        modules: [
            {
                source: 'src/modules/orders/orders.service.ts',
                dependencies: [{ resolved: 'src/modules/users/users.service.ts', rules: [{ name: 'some-other-rule' }] }],
            },
        ],
    });

    assert.equal(result.score.value, 0);
});

test('an edge with no rules array is not counted', async () => {
    const result = await runOnReport({
        modules: [
            { source: 'src/modules/orders/orders.service.ts', dependencies: [{ resolved: 'src/modules/users/users.service.ts' }] },
        ],
    });

    assert.equal(result.score.value, 0);
});

test('multiple tagged edges are all counted', async () => {
    const result = await runOnReport({
        modules: [
            {
                source: 'src/modules/orders/orders.service.ts',
                dependencies: [
                    { resolved: 'src/modules/users/users.service.ts', rules: [{ name: TAG }] },
                    { resolved: 'src/modules/billing/billing.service.ts', rules: [{ name: TAG }] },
                ],
            },
        ],
    });

    assert.equal(result.score.value, 2);
});

test('from/to module names are extracted via module_root_pattern for attribution', async () => {
    const result = await runOnReport({
        modules: [
            {
                source: 'src/modules/orders/orders.service.ts',
                dependencies: [{ resolved: 'src/modules/users/users.service.ts', rules: [{ name: TAG }] }],
            },
        ],
    });

    assert.deepEqual(result.details.target.byFromModule, { orders: 1 });
    assert.deepEqual(result.details.target.byToModule, { users: 1 });
});

test('source_rule_id is configurable to match a differently-named dep-cruiser rule', async () => {
    const result = await runOnReport(
        {
            modules: [
                {
                    source: 'src/modules/orders/orders.service.ts',
                    dependencies: [{ resolved: 'src/modules/users/users.service.ts', rules: [{ name: 'custom-rule-name' }] }],
                },
            ],
        },
        { source_rule_id: 'custom-rule-name' },
    );

    assert.equal(result.score.value, 1);
});

test('an empty report yields a zero count', async () => {
    const result = await runOnReport({ modules: [] });

    assert.equal(result.score.value, 0);
});

test('a live dep-cruiser report from the constraint layer overrides the report file', async () => {
    const result = await runOnReport(
        { modules: [] },
        {},
        {
            adapterRawOutputs: {
                'dep-cruiser': {
                    modules: [
                        {
                            source: 'src/modules/orders/orders.service.ts',
                            dependencies: [
                                {
                                    resolved: 'src/modules/users/users.service.ts',
                                    rules: [{ name: TAG }],
                                },
                            ],
                        },
                    ],
                },
            },
        },
    );

    assert.equal(result.score.value, 1);
    assert.equal(result.details.target.edges.length, 1);
});
