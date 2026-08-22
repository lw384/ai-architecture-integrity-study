import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { run } from '../../adapters/computed-metrics/implementations/backend/BE-TEST-M-001.mjs';

function writeFiles(rootDir, files) {
    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(rootDir, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
    }
}

async function runOn(files) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-test-m-001-'));
    try {
        writeFiles(rootDir, files);
        return await run({ targetDir: rootDir, baselineDir: null, config: {} });
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
}

test('it()/test() calls are counted as test cases, jest.spyOn() as a mock', async () => {
    const result = await runOn({
        'src/modules/users/users.service.spec.ts': `
            describe('UsersService', () => {
                it('creates a user', () => { jest.spyOn(repo, 'save'); });
                test('finds a user', () => {});
            });
        `,
    });

    assert.equal(result.details.target.testCases, 2);
    assert.equal(result.details.target.mocks, 1);
    assert.equal(result.score.value, 0.5);
});

test('the object-literal provider form ({ provide, useValue }) counts as a mock', async () => {
    const result = await runOn({
        'src/modules/users/users.service.spec.ts': `
            const module = { providers: [{ provide: UsersRepository, useValue: mockRepo }] };
            it('works', () => {});
        `,
    });

    assert.equal(result.details.target.testCases, 1);
    assert.equal(result.details.target.mocks, 1);
});

test('the chained method-call form (overrideProvider(X).useValue(Y)) also counts as a mock', async () => {
    const result = await runOn({
        'src/modules/users/users.service.spec.ts': `
            it('works', () => {
                moduleRef.overrideProvider(UsersRepository).useValue(mockRepo);
            });
        `,
    });

    assert.equal(result.details.target.testCases, 1);
    assert.equal(result.details.target.mocks, 1);
});

test('a file with zero test cases yields a null ratio rather than dividing by zero', async () => {
    const result = await runOn({
        'src/modules/users/users.service.spec.ts': `export const helper = () => 1;`,
    });

    assert.equal(result.score, null);
    assert.equal(result.details.target.testCases, 0);
});

test('non-spec/test files are not scanned even if they contain it()-shaped calls', async () => {
    const result = await runOn({
        'src/modules/users/users.service.ts': `it('this is not a real test file', () => {});`,
    });

    assert.equal(result.details.target.testCases, 0);
});
