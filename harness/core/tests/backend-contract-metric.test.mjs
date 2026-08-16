import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { run } from '../../adapters/computed-metrics/implementations/backend/BE-CONTRACT-M-001.mjs';

function writeFiles(rootDir, files) {
    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(rootDir, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
    }
}

async function runOn(files) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-contract-m-001-'));
    try {
        writeFiles(rootDir, files);
        return await run({ targetDir: rootDir, baselineDir: null, config: {} });
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
}

test('a DTO with every field validated has full coverage', async () => {
    const result = await runOn({
        'src/modules/users/dto/create-user.dto.ts': `
            import { IsString } from 'class-validator';
            export class CreateUserDto {
                @IsString() name!: string;
                @IsString() email!: string;
            }
        `,
    });

    assert.equal(result.details.target.totalFields, 2);
    assert.equal(result.details.target.coveredFields, 2);
    assert.equal(result.score.value, 1);
});

test('an unvalidated field lowers the ratio', async () => {
    const result = await runOn({
        'src/modules/users/dto/update-user.dto.ts': `
            import { IsString } from 'class-validator';
            export class UpdateUserDto {
                @IsString() name!: string;
                email!: string;
            }
        `,
    });

    assert.equal(result.details.target.totalFields, 2);
    assert.equal(result.details.target.coveredFields, 1);
    assert.equal(result.score.value, 0.5);
});

test('classes named *ResponseDto are excluded from the request-DTO population', async () => {
    const result = await runOn({
        'src/modules/users/dto/user-response.dto.ts': `
            export class UserResponseDto {
                name!: string;
            }
        `,
    });

    assert.equal(result.details.target.totalFields, 0);
});

test('classes extending a mapped type (PartialType/PickType/...) are excluded', async () => {
    const result = await runOn({
        'src/modules/users/dto/patch-user.dto.ts': `
            import { PartialType } from '@nestjs/mapped-types';
            class CreateUserDto {}
            export class PatchUserDto extends PartialType(CreateUserDto) {
                extra!: string;
            }
        `,
    });

    assert.equal(result.details.target.totalFields, 0);
});

test('DTO-shaped classes outside a dto/ directory are not scanned', async () => {
    const result = await runOn({
        'src/modules/users/create-user.dto.ts': `
            export class CreateUserDto {
                name!: string;
            }
        `,
    });

    assert.equal(result.details.target.totalFields, 0);
});

test('spec files under dto/ are excluded from the scan', async () => {
    const result = await runOn({
        'src/modules/users/dto/create-user.dto.spec.ts': `
            export class CreateUserDto {
                name!: string;
            }
        `,
    });

    assert.equal(result.details.target.totalFields, 0);
});

test('a project with no DTO fields scores a perfect ratio of 1 rather than dividing by zero', async () => {
    const result = await runOn({});

    assert.equal(result.details.target.totalFields, 0);
    assert.equal(result.score.value, 1);
});
