import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runConstraints } from '../../../core/layers/constraints_runner.mjs';

const rulepackDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const constraintsDir = path.join(rulepackDir, 'fixtures', 'constraints');
const endpointFixturesDir = path.join(
    constraintsDir,
    'CROSS-EP-C-001-frontend-api-url-resolves-to-backend-route',
);
const methodFixturesDir = path.join(
    constraintsDir,
    'CROSS-METHOD-C-001-http-method-matches-backend-route',
);
const endpointRuleId = 'CROSS-EP-C-001-frontend-api-url-resolves-to-backend-route';
const methodRuleId = 'CROSS-METHOD-C-001-http-method-matches-backend-route';

function evaluateFixture(fixtureDir, fixtureName) {
    return runConstraints({
        targetDir: path.join(fixtureDir, fixtureName),
        rulepackDir,
        taskConfig: {
            enabled: {
                constraints: ['CROSS-EP-C-001', 'CROSS-METHOD-C-001'],
                metrics: [],
                judgments: [],
            },
        },
    });
}

function assertSuccessfulCrossStaticRun(result) {
    assert.equal(result.rules_evaluated, 2);
    assert.equal(result.adapter_meta['cross-static'].status, 'ok');
}

test('endpoint rules accept static, parameterized, concrete, and query-bearing frontend paths', async () => {
    const result = await evaluateFixture(endpointFixturesDir, 'valid');

    assertSuccessfulCrossStaticRun(result);
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.findings_by_rule[endpointRuleId], []);
    assert.deepEqual(result.findings_by_rule[methodRuleId], []);
    assert.equal(result.adapter_meta['cross-static'].frontend_endpoint_count, 4);
});

test('CROSS-EP-C-001 reports a production frontend path with no reachable backend route', async () => {
    const result = await evaluateFixture(endpointFixturesDir, 'missing-route');

    assertSuccessfulCrossStaticRun(result);
    assert.equal(result.status, 'fail');
    assert.equal(result.findings_by_rule[endpointRuleId].length, 1);
    assert.deepEqual(result.findings_by_rule[methodRuleId], []);
    assert.equal(
        result.findings_by_rule[endpointRuleId][0].evidence.payload.frontend_path,
        '/api/contacts',
    );
});

test('CROSS-EP-C-001 does not prove a dynamic frontend segment against one fixed backend segment', async () => {
    const result = await evaluateFixture(endpointFixturesDir, 'dynamic-does-not-match-static');

    assertSuccessfulCrossStaticRun(result);
    assert.equal(result.findings_by_rule[endpointRuleId].length, 1);
    assert.deepEqual(result.findings_by_rule[methodRuleId], []);
});

test('CROSS-EP-C-001 ignores controller declarations that are unreachable from AppModule', async () => {
    const result = await evaluateFixture(endpointFixturesDir, 'unregistered-controller');
    const meta = result.adapter_meta['cross-static'];

    assertSuccessfulCrossStaticRun(result);
    assert.equal(result.findings_by_rule[endpointRuleId].length, 1);
    assert.equal(meta.backend_declared_controller_count, 1);
    assert.equal(meta.backend_reachable_controller_count, 0);
});

test('CROSS-METHOD-C-001 reports method mismatch only after the route pattern resolves', async () => {
    const result = await evaluateFixture(methodFixturesDir, 'method-mismatch');

    assertSuccessfulCrossStaticRun(result);
    assert.deepEqual(result.findings_by_rule[endpointRuleId], []);
    assert.equal(result.findings_by_rule[methodRuleId].length, 1);

    const [finding] = result.findings_by_rule[methodRuleId];
    assert.equal(finding.rule_version, '0.2.0');
    assert.equal(finding.evidence.payload.frontend_method, 'DELETE');
    assert.equal(finding.evidence.payload.frontend_path, '/api/companies/:param');
    assert.equal(finding.evidence.payload.backend_methods, 'GET');
});
