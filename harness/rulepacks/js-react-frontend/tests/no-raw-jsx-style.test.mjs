import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runConstraints } from '../../../core/layers/constraints_runner.mjs';

const rulepackDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = path.join(
    rulepackDir,
    'fixtures',
    'constraints',
    'FE-STYLE-C-001-no-raw-jsx-style',
);
const fullRuleId = 'FE-STYLE-C-001-no-raw-jsx-style';

function evaluateFixture(fixtureName) {
    return runConstraints({
        targetDir: path.join(fixturesDir, fixtureName),
        rulepackDir,
        taskConfig: {
            enabled: {
                constraints: ['FE-STYLE-C-001'],
                metrics: [],
                judgments: [],
            },
        },
    });
}

function assertSuccessfulEslintRun(result) {
    assert.equal(result.rules_evaluated, 1);
    assert.equal(result.adapter_meta.eslint.status, 'ok');
}

test('FE-STYLE-C-001 accepts managed theme styles and runtime CSS custom properties', async () => {
    const result = await evaluateFixture('valid');

    assertSuccessfulEslintRun(result);
    assert.equal(result.adapter_meta.eslint.exit_code, 0);
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.findings_by_rule[fullRuleId], []);
});

test('FE-STYLE-C-001 reports each unmanaged JSX style attribute', async () => {
    const result = await evaluateFixture('violation');

    assertSuccessfulEslintRun(result);
    assert.equal(result.adapter_meta.eslint.exit_code, 1);
    assert.equal(result.status, 'fail');
    assert.equal(result.findings.length, 4);
    assert.deepEqual(result.findings.map((finding) => finding.location.line), [6, 7, 8, 9]);

    for (const finding of result.findings) {
        assert.equal(finding.rule_id, fullRuleId);
        assert.equal(finding.rule_version, '0.2.0');
        assert.equal(finding.severity, 'warning');
        assert.equal(finding.evidence.source_tool, 'eslint');
        assert.equal(finding.evidence.source_rule_id, 'architecture/no-raw-jsx-style');
        assert.equal(finding.evidence.payload.eslint_rule_id, 'architecture/no-raw-jsx-style');
    }
});

test('FE-STYLE-C-001 accepts narrowly scoped documented exceptions', async () => {
    const result = await evaluateFixture('documented-exception');

    assertSuccessfulEslintRun(result);
    assert.equal(result.adapter_meta.eslint.exit_code, 0);
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.findings_by_rule[fullRuleId], []);
});
