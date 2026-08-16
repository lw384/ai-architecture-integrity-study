import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { run } from '../../adapters/computed-metrics/implementations/cross/CROSS-PROP-M-001.mjs';
import { collectPropagationRuleEvents } from '../../adapters/cross-static/propagation-contracts.mjs';

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function fakeConstraintsLayer(meta = {}) {
    return { adapter_meta: { 'cross-static': meta } };
}

test('fully propagated change: missing is 0 out of a positive total, ratio is 0', async () => {
    const result = await run({
        constraintsLayer: fakeConstraintsLayer({
            propagation_counterpart_surface_missing: 0,
            propagation_counterpart_surface_total: 3,
            propagation_triggered_resources: 2,
        }),
    });

    assert.equal(result.score.value, 0);
});

test('a fraction of counterpart surfaces are missing: ratio is computed precisely', async () => {
    const result = await run({
        constraintsLayer: fakeConstraintsLayer({
            propagation_counterpart_surface_missing: 1,
            propagation_counterpart_surface_total: 4,
            propagation_triggered_resources: 3,
        }),
    });

    assert.equal(result.score.value, 0.25);
    assert.equal(result.score.direction, 'lower_is_better');
});

test('no comparable diff range: ratio is null, not 0, and the reason is surfaced in findings', async () => {
    const result = await run({
        constraintsLayer: fakeConstraintsLayer({
            propagation_counterpart_surface_missing: 0,
            propagation_counterpart_surface_total: 0,
            propagation_reason: 'No comparable diff range was provided.',
        }),
    });

    assert.equal(result.score.value, null);
    assert.ok(result.findings.includes('No comparable diff range was provided.'));
});

test('zero total counterpart surfaces with no reason still yields null rather than dividing by zero', async () => {
    const result = await run({ constraintsLayer: fakeConstraintsLayer({}) });

    assert.equal(result.score.value, null);
});

function initGitRepo(workspaceRoot) {
    const git = (...args) => execFileSync('git', args, { cwd: workspaceRoot, encoding: 'utf8' });
    git('init', '-q');
    git('config', 'user.email', 'test@test.com');
    git('config', 'user.name', 'test');
    return git;
}

function write(workspaceRoot, relativePath, content) {
    const filePath = path.join(workspaceRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
}

test('adapter: a backend-only change against an existing frontend counterpart is flagged missing and counted', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cross-prop-missing-'));

    try {
        const git = initGitRepo(workspaceRoot);
        write(workspaceRoot, 'backend/src/modules/orders/orders.controller.ts', `
            @Controller('orders') export class OrdersController {}
        `);
        write(workspaceRoot, 'frontend/src/api/ordersApi.js', `export const ordersApi = {};`);
        write(workspaceRoot, 'frontend/src/pages/orders/OrderList.jsx', `export function OrderList() { return null; }`);
        git('add', '-A');
        git('commit', '-q', '-m', 'init');
        const preCommit = git('rev-parse', 'HEAD').trim();

        write(workspaceRoot, 'backend/src/modules/orders/orders.controller.ts', `
            @Controller('orders') export class OrdersController { extra() {} }
        `);
        git('add', '-A');
        git('commit', '-q', '-m', 'change backend only');
        const postCommit = git('rev-parse', 'HEAD').trim();

        const config = JSON.parse(fs.readFileSync(
            path.join(harnessRoot, 'rulepacks/cross/tool-configs/cross-static.config.json'),
            'utf8',
        )).propagation_inventory;

        const result = collectPropagationRuleEvents(workspaceRoot, config, { preCommit, postCommit }, 'test');

        assert.equal(result.stats.propagation_triggered_resources, 1);
        assert.equal(result.stats.propagation_violation_count, 1);
        assert.equal(result.stats.propagation_counterpart_surface_total, 1);
        assert.equal(result.stats.propagation_counterpart_surface_missing, 1);
        assert.equal(result.normalizedEvents[0].payload.missing_surfaces, 'frontend adapter or UI surface');
    } finally {
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
});

test('adapter: a backend change accompanied by a matching frontend update satisfies both propagation-direction slots', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cross-prop-satisfied-'));

    try {
        const git = initGitRepo(workspaceRoot);
        write(workspaceRoot, 'backend/src/modules/orders/orders.controller.ts', `
            @Controller('orders') export class OrdersController {}
        `);
        write(workspaceRoot, 'frontend/src/api/ordersApi.js', `export const ordersApi = {};`);
        write(workspaceRoot, 'frontend/src/pages/orders/OrderList.jsx', `export function OrderList() { return null; }`);
        git('add', '-A');
        git('commit', '-q', '-m', 'init');
        const preCommit = git('rev-parse', 'HEAD').trim();

        write(workspaceRoot, 'backend/src/modules/orders/orders.controller.ts', `
            @Controller('orders') export class OrdersController { extra() {} }
        `);
        write(workspaceRoot, 'frontend/src/api/ordersApi.js', `export const ordersApi = { extra: () => {} };`);
        git('add', '-A');
        git('commit', '-q', '-m', 'change backend and frontend adapter together');
        const postCommit = git('rev-parse', 'HEAD').trim();

        const config = JSON.parse(fs.readFileSync(
            path.join(harnessRoot, 'rulepacks/cross/tool-configs/cross-static.config.json'),
            'utf8',
        )).propagation_inventory;

        const result = collectPropagationRuleEvents(workspaceRoot, config, { preCommit, postCommit }, 'test');

        // Both backend and frontend adapter changed together, so both
        // propagation-direction checks apply ("did the frontend follow the
        // backend?" and "did the backend follow the frontend?") and both are
        // satisfied: total counts both slots, missing counts neither.
        assert.equal(result.normalizedEvents.length, 0);
        assert.equal(result.stats.propagation_counterpart_surface_total, 2);
        assert.equal(result.stats.propagation_counterpart_surface_missing, 0);
    } finally {
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
});
