import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { run } from '../../adapters/computed-metrics/implementations/backend/BE-STRUCT-M-001.mjs';

function writeFiles(rootDir, files) {
    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(rootDir, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
    }
}

async function runOn(files, config = {}) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-struct-m-001-'));
    try {
        writeFiles(rootDir, files);
        return await run({ targetDir: rootDir, baselineDir: null, config });
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
}

function findModule(result, name) {
    return result.details.target.details.find((item) => item.moduleName === name);
}

test('an entity-backed module with all three layers is complete', async () => {
    const result = await runOn({
        'src/modules/users/users.module.ts': 'export class UsersModule {}',
        'src/modules/users/users.entity.ts': 'export class UsersEntity {}',
        'src/modules/users/users.controller.ts': 'export class UsersController {}',
        'src/modules/users/users.service.ts': 'export class UsersService {}',
        'src/modules/users/users.repository.ts': 'export class UsersRepository {}',
    });

    const users = findModule(result, 'users');
    assert.equal(users.moduleType, 'entity');
    assert.deepEqual(users.requiredLayers, ['controller', 'service', 'repository']);
    assert.equal(users.isComplete, true);
});

test('an entity-backed module missing its repository is incomplete', async () => {
    const result = await runOn({
        'src/modules/orders/orders.module.ts': 'export class OrdersModule {}',
        'src/modules/orders/orders.entity.ts': 'export class OrdersEntity {}',
        'src/modules/orders/orders.controller.ts': 'export class OrdersController {}',
        'src/modules/orders/orders.service.ts': 'export class OrdersService {}',
    });

    const orders = findModule(result, 'orders');
    assert.equal(orders.isComplete, false);
    assert.deepEqual(orders.missing, ['repository']);
});

test('a "-link" suffixed module without an entity file only requires controller+service', async () => {
    const result = await runOn({
        'src/modules/users-teams-link/users-teams-link.module.ts': 'export class UsersTeamsLinkModule {}',
        'src/modules/users-teams-link/users-teams-link.controller.ts': 'export class UsersTeamsLinkController {}',
        'src/modules/users-teams-link/users-teams-link.service.ts': 'export class UsersTeamsLinkService {}',
    });

    const link = findModule(result, 'users-teams-link');
    assert.equal(link.moduleType, 'link');
    assert.deepEqual(link.requiredLayers, ['controller', 'service']);
    assert.equal(link.isComplete, true);
});

test('a module with no entity file and no -link/-relation suffix only requires a service', async () => {
    const result = await runOn({
        'src/modules/health/health.module.ts': 'export class HealthModule {}',
        'src/modules/health/health.service.ts': 'export class HealthService {}',
    });

    const health = findModule(result, 'health');
    assert.equal(health.moduleType, 'service');
    assert.deepEqual(health.requiredLayers, ['service']);
    assert.equal(health.isComplete, true);
});

test('app.module.ts is excluded and contributes no module to the count', async () => {
    const result = await runOn({
        'src/modules/root/app.module.ts': 'export class AppModule {}',
    });

    assert.equal(result.details.target.totalModules, 0);
});

test('ratio reflects the mix of complete and incomplete modules', async () => {
    const result = await runOn({
        'src/modules/users/users.module.ts': 'export class UsersModule {}',
        'src/modules/users/users.entity.ts': 'export class UsersEntity {}',
        'src/modules/users/users.controller.ts': 'export class UsersController {}',
        'src/modules/users/users.service.ts': 'export class UsersService {}',
        'src/modules/users/users.repository.ts': 'export class UsersRepository {}',

        'src/modules/orders/orders.module.ts': 'export class OrdersModule {}',
        'src/modules/orders/orders.entity.ts': 'export class OrdersEntity {}',
        'src/modules/orders/orders.controller.ts': 'export class OrdersController {}',
        'src/modules/orders/orders.service.ts': 'export class OrdersService {}',

        'src/modules/health/health.module.ts': 'export class HealthModule {}',
        'src/modules/health/health.service.ts': 'export class HealthService {}',

        'src/modules/users-teams-link/users-teams-link.module.ts': 'export class UsersTeamsLinkModule {}',
        'src/modules/users-teams-link/users-teams-link.controller.ts': 'export class UsersTeamsLinkController {}',
        'src/modules/users-teams-link/users-teams-link.service.ts': 'export class UsersTeamsLinkService {}',
    });

    assert.equal(result.details.target.totalModules, 4);
    assert.equal(result.details.target.violatingModules, 1);
    assert.equal(result.score.value, 0.25);
});

test('an empty project yields a zero ratio rather than dividing by zero', async () => {
    const result = await runOn({});

    assert.equal(result.details.target.totalModules, 0);
    assert.equal(result.score.value, 0);
});
