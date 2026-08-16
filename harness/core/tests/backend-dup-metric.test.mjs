import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { run } from '../../adapters/computed-metrics/implementations/backend/BE-DUP-M-001.mjs';

// A function body long enough to comfortably clear the default 50-token / 5-line thresholds.
const LONG_FUNCTION_BODY = `
export function computeInvoiceTotal(items) {
    let subtotal = 0;
    let discount = 0;
    let taxTotal = 0;
    for (const item of items) {
        subtotal += item.price * item.quantity;
        discount += item.discount ?? 0;
        taxTotal += item.price * item.taxRate;
    }
    const total = subtotal - discount + taxTotal;
    return { subtotal, discount, taxTotal, total };
}
`;

// Same structure, every identifier and literal renamed/changed — a Type-2 clone of the above.
const LONG_FUNCTION_BODY_RENAMED = `
export function calculateOrderSum(lines) {
    let base = 1;
    let rebate = 1;
    let taxSum = 1;
    for (const line of lines) {
        base += line.cost * line.count;
        rebate += line.rebate ?? 1;
        taxSum += line.cost * line.rate;
    }
    const grandTotal = base - rebate + taxSum;
    return { base, rebate, taxSum, grandTotal };
}
`;

const UNRELATED_FUNCTION_BODY = `
export function slugify(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
`;

function writeProject(rootDir, files) {
    fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(rootDir, 'src', relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
    }
}

async function runOn(files) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-dup-m-001-'));
    try {
        writeProject(rootDir, files);
        const result = await run({ targetDir: rootDir, baselineDir: null, config: {} });
        return result;
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
}

test('Type-1 exact clone is detected and covers both occurrences', async () => {
    const result = await runOn({
        'a.ts': LONG_FUNCTION_BODY,
        'b.ts': LONG_FUNCTION_BODY,
    });

    assert.ok(result.score.value > 0, `expected a positive clone ratio, got ${result.score.value}`);
    assert.ok(result.details.target.matches.length >= 1, 'expected at least one reported clone match');
    assert.ok(result.details.target.duplicatedLines > 0, 'expected duplicated lines to be counted');
});

test('Type-2 clone (renamed identifiers/literals) is detected via token normalization', async () => {
    const result = await runOn({
        'a.ts': LONG_FUNCTION_BODY,
        'b.ts': LONG_FUNCTION_BODY_RENAMED,
    });

    assert.ok(result.score.value > 0, `expected a positive clone ratio, got ${result.score.value}`);
    assert.ok(result.details.target.matches.length >= 1, 'expected at least one reported clone match');
});

test('structurally different functions are not flagged as clones', async () => {
    const result = await runOn({
        'a.ts': LONG_FUNCTION_BODY,
        'b.ts': UNRELATED_FUNCTION_BODY,
    });

    assert.equal(result.score.value, 0, `expected zero clone ratio, got ${result.score.value}`);
    assert.equal(result.details.target.matches.length, 0, 'expected no clone matches');
});

test('a single short duplicated snippet below both thresholds is not flagged', async () => {
    const result = await runOn({
        'a.ts': 'export const two = 1 + 1;\n',
        'b.ts': 'export const two = 1 + 1;\n',
    });

    assert.equal(result.score.value, 0, `expected zero clone ratio for a short duplicate, got ${result.score.value}`);
});

test('spec/test files are excluded from clone detection', async () => {
    const result = await runOn({
        'a.ts': LONG_FUNCTION_BODY,
        'a.spec.ts': LONG_FUNCTION_BODY,
    });

    assert.equal(result.score.value, 0, 'a production file duplicated only in its own spec file must not be flagged');
});

test('a file cloned within itself (two occurrences in one file) is still detected', async () => {
    const result = await runOn({
        'a.ts': `${LONG_FUNCTION_BODY}\n${LONG_FUNCTION_BODY_RENAMED}\n`,
    });

    assert.ok(result.score.value > 0, `expected a positive clone ratio for an intra-file duplicate, got ${result.score.value}`);
});
