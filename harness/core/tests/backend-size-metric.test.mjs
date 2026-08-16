import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { run } from '../../adapters/computed-metrics/implementations/backend/BE-SIZE-M-001.mjs';

function writeProject(rootDir, files) {
    fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(rootDir, 'src', relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
    }
}

async function runOn(files, config = {}) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-size-m-001-'));
    try {
        writeProject(rootDir, files);
        return await run({ targetDir: rootDir, baselineDir: null, config });
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
}

function findMethod(result, methodName) {
    return result.details.target.details.find((item) => item.methodName === methodName);
}

test('a method with no branches has complexity 1 and does not violate the default threshold', async () => {
    const result = await runOn({
        'modules/users/users.service.ts': `
            export class SimpleService {
                identity(x) { return x; }
            }
        `,
    });

    assert.equal(findMethod(result, 'identity').complexity, 1);
    assert.equal(result.details.target.violatingMethods, 0);
    assert.equal(result.score.value, 0);
});

test('a method with 12 independent if-branches has complexity 13 and violates the default threshold (10)', async () => {
    const ifs = Array.from({ length: 12 }, (_, i) => `if (a > ${i}) result += 1;`).join('\n                ');
    const result = await runOn({
        'modules/users/users.service.ts': `
            export class BigService {
                process(a) {
                    let result = 0;
                    ${ifs}
                    return result;
                }
            }
        `,
    });

    assert.equal(findMethod(result, 'process').complexity, 13);
    assert.equal(result.details.target.violatingMethods, 1);
    assert.ok(result.score.value > 0);
});

test('switch cases count individually, default does not', async () => {
    const result = await runOn({
        'modules/users/users.service.ts': `
            export class RouterService {
                route(status) {
                    switch (status) {
                        case 'a': return 1;
                        case 'b': return 2;
                        case 'c': return 3;
                        default: return 0;
                    }
                }
            }
        `,
    });

    assert.equal(findMethod(result, 'route').complexity, 4); // 1 + 3 cases, default excluded
});

test('&&, ||, and ternary each add one decision point', async () => {
    const result = await runOn({
        'modules/users/users.service.ts': `
            export class GuardService {
                allow(a, b, c) {
                    return (a && b) || c ? true : false;
                }
            }
        `,
    });

    assert.equal(findMethod(result, 'allow').complexity, 4); // 1 + && + || + ternary
});

test('branches inside a nested callback do not inflate the enclosing method complexity', async () => {
    const result = await runOn({
        'modules/users/users.service.ts': `
            export class CallbackService {
                mapValues(items) {
                    return items.map((item) => (item > 0 ? 1 : 0));
                }
            }
        `,
    });

    assert.equal(findMethod(result, 'mapValues').complexity, 1);
});

test('constructors are excluded', async () => {
    const result = await runOn({
        'modules/users/users.service.ts': `
            export class UsersService {
                constructor(a, b, c) {
                    if (a) { this.a = a; }
                    if (b) { this.b = b; }
                }
            }
        `,
    });

    assert.equal(result.details.target.totalMethods, 0);
});

test('spec files are excluded from analysis', async () => {
    const result = await runOn({
        'modules/users/users.service.spec.ts': `
            export class UsersService {
                identity(x) { if (x) { return x; } return null; }
            }
        `,
    });

    assert.equal(result.details.target.totalMethods, 0);
});

test('the max_complexity threshold is configurable', async () => {
    const result = await runOn({
        'modules/users/users.service.ts': `
            export class SmallService {
                check(a) {
                    if (a) { return 1; }
                    return 0;
                }
            }
        `,
    }, { max_complexity: 1 });

    assert.equal(findMethod(result, 'check').complexity, 2);
    assert.equal(result.details.target.violatingMethods, 1);
});
