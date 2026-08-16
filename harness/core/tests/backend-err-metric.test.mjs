import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { run } from '../../adapters/computed-metrics/implementations/backend/BE-ERR-M-001.mjs';

function writeFiles(rootDir, files) {
    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(rootDir, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
    }
}

function fakeConstraintsLayer(findingsByRule) {
    return { findings_by_rule: findingsByRule };
}

async function runOn(files, constraintsLayer, config = {}) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-err-m-001-'));
    try {
        writeFiles(rootDir, files);
        return await run({ targetDir: rootDir, constraintsLayer, config });
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
}

test('weighted sum reuses the real constraint finding counts (no re-scanning) with default weight 1', async () => {
    const result = await runOn(
        {
            'src/modules/users/users.service.ts': 'export class UsersService {}',
            'src/modules/orders/orders.service.ts': 'export class OrdersService {}',
        },
        fakeConstraintsLayer({
            'BE-ERR-C-001-no-http-exception-in-service': [{}, {}],
            'BE-ERR-C-002-throw-only-app-exception': [{}],
            'BE-ERR-C-003-no-silent-catch': [],
        }),
    );

    assert.equal(result.details.target.weightedViolationCount, 3); // 2 + 1 + 0
    assert.equal(result.details.target.serviceFileCount, 2);
    assert.equal(result.score.value, 1.5); // 3 / 2
});

test('custom weights change the weighted sum', async () => {
    const result = await runOn(
        { 'src/modules/users/users.service.ts': 'export class UsersService {}' },
        fakeConstraintsLayer({ 'BE-ERR-C-001-no-http-exception-in-service': [{}] }),
        { weights: { 'BE-ERR-C-001-no-http-exception-in-service': 2 } },
    );

    assert.equal(result.details.target.weightedViolationCount, 2); // 1 finding * weight 2
    assert.equal(result.score.value, 2); // 2 / 1 service file
});

test('the denominator floors at 1 when there are zero service files', async () => {
    const result = await runOn(
        {},
        fakeConstraintsLayer({ 'BE-ERR-C-001-no-http-exception-in-service': [{}] }),
    );

    assert.equal(result.details.target.serviceFileCount, 0);
    assert.equal(result.details.target.denominator, 1);
    assert.equal(result.score.value, 1);
});

test('a missing constraintsLayer is treated as zero findings for every rule', async () => {
    const result = await runOn(
        { 'src/modules/users/users.service.ts': 'export class UsersService {}' },
        undefined,
    );

    assert.equal(result.details.target.weightedViolationCount, 0);
    assert.equal(result.score.value, 0);
});

test('delta_vs_baseline is always null (no baseline constraint run exists to compare against)', async () => {
    const result = await runOn(
        { 'src/modules/users/users.service.ts': 'export class UsersService {}' },
        fakeConstraintsLayer({}),
    );

    assert.equal(result.delta_vs_baseline, null);
});
