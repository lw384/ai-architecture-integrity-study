import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { analyzeJsxDepth } from '../../../adapters/computed-metrics/implementations/_shared/frontend-source-analysis.mjs';
import { runConstraints } from '../../../core/layers/constraints_runner.mjs';

const rulepackDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = path.join(
    rulepackDir,
    'fixtures',
    'constraints',
    'FE-COM-C-002-jsx-max-depth',
);
const fullRuleId = 'FE-COM-C-002-jsx-max-depth';

function evaluateFixture(fixtureName) {
    return runConstraints({
        targetDir: path.join(fixturesDir, fixtureName),
        rulepackDir,
        taskConfig: {
            enabled: {
                constraints: ['FE-COM-C-002'],
                metrics: [],
                judgments: [],
            },
        },
    });
}

function assertCleanResult(result) {
    assert.equal(result.rules_evaluated, 1);
    assert.equal(result.adapter_meta.eslint.status, 'ok');
    assert.equal(result.adapter_meta.eslint.exit_code, 0);
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.findings_by_rule[fullRuleId], []);
}

for (const fixtureName of [
    'valid-depth-5',
    'transparent-wrappers',
    'render-prop-depth-5',
    'ignored-test-files',
]) {
    test(`FE-COM-C-002 accepts ${fixtureName}`, async () => {
        assertCleanResult(await evaluateFixture(fixtureName));
    });
}

test('FE-COM-C-002 reports one finding for a render tree at depth six', async () => {
    const result = await evaluateFixture('violation-depth-6');

    assert.equal(result.rules_evaluated, 1);
    assert.equal(result.adapter_meta.eslint.status, 'ok');
    assert.equal(result.adapter_meta.eslint.exit_code, 1);
    assert.equal(result.status, 'fail');
    assert.equal(result.findings.length, 1);

    const [finding] = result.findings;
    assert.equal(finding.rule_id, fullRuleId);
    assert.equal(finding.rule_version, '0.3.0');
    assert.equal(finding.severity, 'warning');
    assert.match(finding.message, /reaches 6 effective JSX levels/);
    assert.equal(finding.evidence.source_rule_id, 'architecture/business-jsx-max-depth');
    assert.match(finding.evidence.payload.message, /reaches 6 effective JSX levels/);
});

test('FE-COM-C-002 reports sibling overflow only once per render tree', async () => {
    const result = await evaluateFixture('sibling-overflow-one-finding');

    assert.equal(result.status, 'fail');
    assert.equal(result.findings.length, 1);
});

test('FE-COM-C-002 evaluates a deep render-prop callback as an independent tree', async () => {
    const result = await evaluateFixture('render-prop-depth-6');

    assert.equal(result.status, 'fail');
    assert.equal(result.findings.length, 1);
    assert.match(result.findings[0].evidence.payload.message, /reaches 6 effective JSX levels/);
});

test('FE-COM-M-002 shares the constraint depth and ignored-file semantics', () => {
    const renderPropResult = analyzeJsxDepth(path.join(fixturesDir, 'render-prop-depth-6'));
    const transparentResult = analyzeJsxDepth(path.join(fixturesDir, 'transparent-wrappers'));
    const ignoredTestResult = analyzeJsxDepth(path.join(fixturesDir, 'ignored-test-files'));

    assert.equal(renderPropResult.averageDepth, 6);
    assert.equal(transparentResult.averageDepth, 5);
    assert.equal(ignoredTestResult.totalComponents, 1);
    assert.equal(ignoredTestResult.averageDepth, 1);
});
