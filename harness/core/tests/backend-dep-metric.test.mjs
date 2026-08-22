import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { run } from '../../adapters/computed-metrics/implementations/backend/BE-DEP-M-001.mjs';

async function runOnReport(report, constraintsLayer = undefined) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-dep-m-001-'));
    try {
        fs.mkdirSync(path.join(dir, 'reports'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'reports/depcruise-raw.json'), JSON.stringify(report));
        return await run({ targetDir: dir, baselineDir: null, constraintsLayer, config: {} });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test('a clean layered graph (controller->service->repository) has zero violations', async () => {
    const result = await runOnReport({
        modules: [
            { source: 'src/modules/users/users.controller.ts', dependencies: [{ resolved: 'src/modules/users/users.service.ts' }] },
            { source: 'src/modules/users/users.service.ts', dependencies: [{ resolved: 'src/modules/users/users.repository.ts' }] },
        ],
    });

    assert.equal(result.details.target.mvcViolations, 0);
    assert.equal(result.details.target.cyclicDependencyCount, 0);
    assert.equal(result.details.target.totalImportEdges, 2);
    assert.equal(result.score.value, 0);
});

test('an entity importing its own module controller is a same-module layering violation', async () => {
    const result = await runOnReport({
        modules: [
            { source: 'src/modules/users/user.entity.ts', dependencies: [{ resolved: 'src/modules/users/users.controller.ts' }] },
        ],
    });

    assert.equal(result.details.target.mvcViolations, 1);
    assert.equal(result.details.target.totalImportEdges, 1);
    assert.equal(result.score.value, 1);
});

test('a cross-module controller-to-repository edge is not counted as a layering violation', async () => {
    const result = await runOnReport({
        modules: [
            { source: 'src/modules/orders/orders.controller.ts', dependencies: [{ resolved: 'src/modules/users/users.repository.ts' }] },
        ],
    });

    assert.equal(result.details.target.mvcViolations, 0);
    assert.equal(result.score.value, 0);
});

test('only edges within the same strongly-connected component count as cyclic; a bridge edge between two separate cycles does not', async () => {
    const result = await runOnReport({
        modules: [
            { source: 'src/a.ts', dependencies: [{ resolved: 'src/b.ts' }, { resolved: 'src/x.ts' }] },
            { source: 'src/b.ts', dependencies: [{ resolved: 'src/a.ts' }] },
            { source: 'src/x.ts', dependencies: [{ resolved: 'src/y.ts' }] },
            { source: 'src/y.ts', dependencies: [{ resolved: 'src/x.ts' }] },
        ],
    });

    assert.equal(result.details.target.mvcViolations, 0); // plain .ts files, no recognized layer
    assert.equal(result.details.target.cyclicDependencyCount, 4); // a<->b (2) + x<->y (2); a->x bridge excluded
    assert.equal(result.details.target.totalImportEdges, 5);
    assert.equal(result.score.value, 0.8);
});

test('edges without a resolved target are ignored (unresolved imports do not count)', async () => {
    const result = await runOnReport({
        modules: [
            { source: 'src/a.ts', dependencies: [{ resolved: null }, { module: 'left-pad' }] },
        ],
    });

    assert.equal(result.details.target.totalImportEdges, 0);
    assert.equal(result.score.value, 0);
});

test('an empty report yields a zero ratio rather than dividing by zero', async () => {
    const result = await runOnReport({ modules: [] });

    assert.equal(result.details.target.totalImportEdges, 0);
    assert.equal(result.score.value, 0);
});

test('a live dep-cruiser report from the constraint layer overrides the report file', async () => {
    const result = await runOnReport(
        { modules: [] },
        {
            adapterRawOutputs: {
                'dep-cruiser': {
                    modules: [
                        {
                            source: 'src/modules/users/user.entity.ts',
                            dependencies: [{ resolved: 'src/modules/users/users.controller.ts' }],
                        },
                    ],
                },
            },
        },
    );

    assert.equal(result.details.target.totalImportEdges, 1);
    assert.equal(result.details.target.mvcViolations, 1);
    assert.equal(result.score.value, 1);
});
