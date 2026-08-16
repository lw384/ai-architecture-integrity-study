import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { run } from '../../adapters/computed-metrics/implementations/backend/BE-ROUTE-M-001.mjs';

function writeProject(rootDir, files) {
    fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(rootDir, 'src', relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
    }
}

async function runOn(files) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-route-m-001-'));
    try {
        writeProject(rootDir, files);
        return await run({ targetDir: rootDir, baselineDir: null, config: {} });
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
}

test('a global prefix set via literal string is detected', async () => {
    const result = await runOn({
        'main.ts': `app.setGlobalPrefix('api');`,
        'modules/users/users.controller.ts': `import { Controller, Get } from '@nestjs/common'; @Controller('user-profiles') export class UsersController { @Get(':userId') find() {} }`,
    });

    assert.equal(result.details.target.hasGlobalPrefix, true);
    assert.equal(result.details.target.violatingEndpoints, 0);
    assert.equal(result.score.value, 0);
});

test('a global prefix set via a same-file constant reference is resolved (not just literals)', async () => {
    const result = await runOn({
        'main.ts': `const API_PREFIX = 'api'; app.setGlobalPrefix(API_PREFIX);`,
        'modules/users/users.controller.ts': `import { Controller, Get } from '@nestjs/common'; @Controller('user-profiles') export class UsersController { @Get(':userId') find() {} }`,
    });

    assert.equal(result.details.target.hasGlobalPrefix, true);
    assert.equal(result.details.target.violatingEndpoints, 0);
});

test('a missing global prefix flags every endpoint as violating', async () => {
    const result = await runOn({
        'main.ts': `console.log('no prefix set');`,
        'modules/users/users.controller.ts': `import { Controller, Get } from '@nestjs/common'; @Controller('user-profiles') export class UsersController { @Get(':userId') find() {} @Get('active') findActive() {} }`,
    });

    assert.equal(result.details.target.hasGlobalPrefix, false);
    assert.equal(result.details.target.totalEndpoints, 2);
    assert.equal(result.details.target.violatingEndpoints, 2);
    assert.equal(result.score.value, 1);
});

test('wildcard routes ({*splat}) are not flagged as kebab-case violations', async () => {
    const result = await runOn({
        'main.ts': `app.setGlobalPrefix('api');`,
        'modules/users/users.controller.ts': `import { Controller, Get } from '@nestjs/common'; @Controller('user-profiles') export class UsersController { @Get('{*splat}') find() {} }`,
    });

    assert.equal(result.details.target.violatingEndpoints, 0);
});

test('version segments (v1/v2) are not flagged as kebab-case violations', async () => {
    const result = await runOn({
        'main.ts': `app.setGlobalPrefix('api');`,
        'modules/users/users.controller.ts': `import { Controller, Get } from '@nestjs/common'; @Controller('v1/user-profiles') export class UsersController { @Get() find() {} }`,
    });

    assert.equal(result.details.target.violatingEndpoints, 0);
});

test('a camelCase controller path is flagged as a kebab-case violation', async () => {
    const result = await runOn({
        'main.ts': `app.setGlobalPrefix('api');`,
        'modules/users/users.controller.ts': `import { Controller, Get } from '@nestjs/common'; @Controller('userProfiles') export class UsersController { @Get() find() {} }`,
    });

    assert.equal(result.details.target.totalEndpoints, 1);
    assert.equal(result.details.target.violatingEndpoints, 1);
    assert.equal(result.score.value, 1);
});

test('spec-file controllers are excluded from the scan', async () => {
    const result = await runOn({
        'main.ts': `app.setGlobalPrefix('api');`,
        'modules/users/users.controller.spec.ts': `import { Controller, Get } from '@nestjs/common'; @Controller('userProfiles') export class UsersController { @Get() find() {} }`,
    });

    assert.equal(result.details.target.totalEndpoints, 0);
    assert.equal(result.score.value, 0);
});
